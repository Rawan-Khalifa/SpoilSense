# server/openai_client.py

import os
import re
import json
import requests
import openai
import base64

# ─── 0) Configure OpenAI API key ───────────────────────────────────────────────
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("Missing OPENAI_API_KEY in environment")
openai.api_key = openai_api_key

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
    """
    try:
        # If it's a local file path, read and encode as base64
        if os.path.exists(image_path_or_url):
            with open(image_path_or_url, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            image_content = f"data:image/jpeg;base64,{base64_image}"
        else:
            # Fallback to URL (though this might still fail)
            image_content = image_path_or_url
        
        resp = openai.chat.completions.create(
            model="gpt-4o",
            messages=[{
                "role": "user", 
                "content": [
                    {"type": "text", "text": f"Analyze this food image. Latitude: {lat}, Longitude: {lon}. Estimate spoilage days and identify the food item."},
                    {"type": "image_url", "image_url": {"url": image_content}}
                ]
            }]
        )
        
        text = resp.choices[0].message.content
        # Extract JSON substring
        match = re.search(r"(\{.*\})", text, re.DOTALL)
        if not match:
            raise ValueError(f"Could not parse JSON from GPT response: {text!r}")
        result = json.loads(match.group(1))
        # Validate keys
        for key in ("product_name", "spoilage_days", "predicted_date", "confidence"):
            if key not in result:
                raise ValueError(f"Missing '{key}' in GPT output: {result}")
        return result

    except Exception as e:
        print(f"OpenAI API error: {e}")
        raise


# ─── 3) Estimate the average retail price of a product in USD ─────────────────────────

def estimate_price(product_name: str) -> float:
    """
    Ask GPT for the average US retail price in USD for the given product.
    Returns a float.
    """
    prompt = (
        f"""Estimate the average retail price in USD for "{product_name}" 
        in the current US market. Respond with just the number, no currency symbol."""
    )
    resp = openai.responses.create(
        model="gpt-4o",
        input=[{
            "role": "user",
            "content": [
                {"type": "input_text", "text": prompt}
            ]
        }]
    )
    text = resp.output_text.strip()
    # Pull the first numeric match
    match = re.search(r"[0-9]+(?:\\.[0-9]+)?", text)
    if not match:
        raise ValueError(f"Could not parse price from GPT response: {text!r}")
    return float(match.group())


