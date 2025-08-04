# server/openai_client.py

import os
import re
import json
import requests
import openai
import base64
from datetime import datetime, timedelta

# ─── 0) Configure OpenAI API key ───────────────────────────────────────────────
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("Missing OPENAI_API_KEY in environment")

# Initialize OpenAI client (new way)
client = openai.OpenAI(api_key=openai_api_key)

# ─── 1) Helper: fetch current weather & humidity ──────────────────────────────
def get_weather(latitude: float, longitude: float) -> dict:
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={latitude}&longitude={longitude}"
        "&current_weather=true&hourly=relative_humidity_2m"
    )
    resp = requests.get(url)
    resp.raise_for_status()
    data = resp.json()
    return {
        "temperature": data["current_weather"]["temperature"],
        "humidity":    data["hourly"]["relative_humidity_2m"][-1]
    }

# ─── 2) Main: estimate spoilage with structured output ─────────────────────────
def estimate_spoilage(image_path_or_url, lat, lon):
    """
    Estimate spoilage using local image file or URL
    Raises exceptions instead of returning fallbacks
    """
    try:
        # Get weather data
        weather = get_weather(lat, lon)
        
        # If it's a local file path, read and encode as base64
        if os.path.exists(image_path_or_url):
            with open(image_path_or_url, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            image_content = f"data:image/jpeg;base64,{base64_image}"
        else:
            # Fallback to URL (though this might still fail)
            image_content = image_path_or_url
        
        # Enhanced prompt with confidence calculation
        prompt = f"""Analyze this food image and provide a detailed assessment. 

Location: Latitude {lat}, Longitude {lon}
Current weather: Temperature {weather['temperature']}°C, Humidity {weather['humidity']}%

Please analyze the food item and calculate your confidence based on:
- Image clarity and quality
- Visibility of the food item
- How well you can identify the specific food
- How clearly you can assess its freshness/spoilage state

You MUST respond with ONLY a valid JSON object in this exact format:
{{
    "product_name": "specific name of the food item",
    "spoilage_days": number_of_days_until_spoiled,
    "predicted_date": "YYYY-MM-DD format",
    "confidence": your_confidence_percentage_as_integer,
    "reasoning": "brief explanation of your confidence level"
}}

Rules:
- spoilage_days must be a positive integer (0 means already spoiled)
- confidence must be an integer between 0-100
- predicted_date should be today + spoilage_days
- Be honest about your confidence - if image is unclear, give lower confidence

Do not include any other text or explanation outside the JSON."""

        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user", 
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": image_content}}
                ]
            }],
            response_format={"type": "json_object"}
        )
        
        text = resp.choices[0].message.content.strip()
        
        try:
            # Try to parse the entire response as JSON
            result = json.loads(text)
        except json.JSONDecodeError as e:
            # If JSON parsing fails, don't fallback - raise an error
            raise ValueError(f"GPT returned invalid JSON format: {text}") from e
        
        # Validate required keys
        required_keys = ["product_name", "spoilage_days", "predicted_date", "confidence"]
        missing_keys = [key for key in required_keys if key not in result]
        if missing_keys:
            raise ValueError(f"GPT response missing required fields: {missing_keys}")
        
        # Validate data types and ranges
        try:
            result["spoilage_days"] = int(result["spoilage_days"])
            result["confidence"] = int(result["confidence"])
        except (ValueError, TypeError) as e:
            raise ValueError(f"Invalid data types in GPT response: {e}")
        
        if not (0 <= result["spoilage_days"] <= 365):
            raise ValueError(f"Invalid spoilage_days: {result['spoilage_days']} (must be 0-365)")
        
        if not (0 <= result["confidence"] <= 100):
            raise ValueError(f"Invalid confidence: {result['confidence']} (must be 0-100)")
        
        # Validate date format
        try:
            datetime.strptime(result["predicted_date"], "%Y-%m-%d")
        except ValueError as e:
            raise ValueError(f"Invalid date format: {result['predicted_date']}") from e
        
        return result

    except requests.RequestException as e:
        raise ValueError(f"Weather data unavailable: {e}")
    except FileNotFoundError:
        raise ValueError("Image file not found")
    except Exception as e:
        if "Invalid image" in str(e) or "image" in str(e).lower():
            raise ValueError("Unable to process image. Please try with a clearer photo of food.")
        elif "rate limit" in str(e).lower():
            raise ValueError("Service temporarily unavailable. Please try again in a moment.")
        elif "api" in str(e).lower():
            raise ValueError("AI service unavailable. Please try again later.")
        else:
            raise ValueError(f"Analysis failed: {str(e)}")

# ─── 3) Estimate the average retail price of a product in USD ─────────────────────────
def estimate_price(product_name: str) -> float:
    """
    Ask GPT for the average US retail price in USD for the given product.
    Returns a float or raises an exception.
    """
    try:
        prompt = f"""Estimate the average retail price in USD for '{product_name}' in the current US market.

Respond with ONLY a JSON object in this format:
{{
    "price": number_in_dollars,
    "reasoning": "brief explanation of price estimate"
}}

Example: {{"price": 2.50, "reasoning": "typical grocery store price"}}"""

        resp = client.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user",
                "content": prompt
            }],
            response_format={"type": "json_object"}
        )
        
        text = resp.choices[0].message.content.strip()
        result = json.loads(text)
        
        if "price" not in result:
            raise ValueError("No price found in response")
        
        price = float(result["price"])
        if price < 0 or price > 1000:  # Sanity check
            raise ValueError(f"Unrealistic price: ${price}")
        
        return price
        
    except Exception as e:
        raise ValueError(f"Price estimation failed: {str(e)}")


