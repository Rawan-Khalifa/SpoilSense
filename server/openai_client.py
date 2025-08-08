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
    """Get weather data with fallback to multiple APIs"""
    
    # Try OpenWeatherMap first (more reliable globally)
    try:
        # You can get a free API key from https://openweathermap.org/api
        # For now, let's try without API key using a different approach
        
        # Try weather.gov (US only) or other free services
        url = f"https://api.openweathermap.org/data/2.5/weather?lat={latitude}&lon={longitude}&appid=demo&units=metric"
        
        print(f"🌤️ Trying OpenWeatherMap: {url}")
        
        headers = {
            'User-Agent': 'SpoilSense/1.0',
            'Accept': 'application/json'
        }
        
        resp = requests.get(url, timeout=(10, 30), headers=headers)
        
        if resp.status_code == 401:
            print("⚠️ OpenWeatherMap requires API key, falling back...")
            raise requests.exceptions.RequestException("API key required")
            
        resp.raise_for_status()
        data = resp.json()
        
        return {
            "temperature": data["main"]["temp"],
            "humidity": data["main"]["humidity"]
        }
        
    except Exception as e:
        print(f"⚠️ OpenWeatherMap failed: {e}")
        
        # Fallback to wttr.in (no API key required)
        try:
            url = f"https://wttr.in/{latitude},{longitude}?format=j1"
            print(f"🌤️ Trying wttr.in: {url}")
            
            resp = requests.get(url, timeout=(10, 30), headers=headers)
            resp.raise_for_status()
            data = resp.json()
            
            current = data["current_condition"][0]
            return {
                "temperature": float(current["temp_C"]),
                "humidity": float(current["humidity"])
            }
            
        except Exception as e2:
            print(f"⚠️ wttr.in failed: {e2}")
            
            # Last resort - try open-meteo again with different settings
            try:
                url = (
                    "https://api.open-meteo.com/v1/forecast"
                    f"?latitude={latitude}&longitude={longitude}"
                    "&current_weather=true&hourly=relative_humidity_2m"
                )
                
                print(f"🌤️ Last attempt with open-meteo: {url}")
                
                # Try with different network settings
                resp = requests.get(
                    url, 
                    timeout=(15, 45),  # Longer timeout
                    headers=headers,
                    verify=False  # Skip SSL verification as last resort
                )
                
                resp.raise_for_status()
                data = resp.json()
                
                return {
                    "temperature": data["current_weather"]["temperature"],
                    "humidity": data["hourly"]["relative_humidity_2m"][-1]
                }
                
            except Exception as e3:
                print(f"❌ All weather APIs failed: {e3}")
                raise ValueError(f"All weather services unavailable: {str(e3)}")

# Alternative weather function for testing
def test_weather_connectivity():
    """Test function to debug weather API issues"""
    try:
        # Test basic connectivity
        print("🔄 Testing basic internet connectivity...")
        test_resp = requests.get("https://httpbin.org/get", timeout=10)
        print(f"✅ Internet test: {test_resp.status_code}")
        
        # Test DNS resolution
        print("🔄 Testing DNS resolution...")
        import socket
        ip = socket.gethostbyname("api.open-meteo.com")
        print(f"✅ DNS resolution: api.open-meteo.com -> {ip}")
        
        # Test weather API with minimal request
        print("🔄 Testing weather API...")
        simple_url = "https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&current_weather=true"
        resp = requests.get(simple_url, timeout=15)
        print(f"✅ Weather API test: {resp.status_code}")
        print(f"📊 Sample response: {resp.json()}")
        
        return True
        
    except Exception as e:
        print(f"❌ Connectivity test failed: {e}")
        return False

# ─── 2) Main: estimate spoilage with structured output ─────────────────────────
def estimate_spoilage(image_path_or_url, lat, lon, storage_type="room", temperature=None, humidity=None):
    """
    Estimate spoilage using local image file or URL
    Raises exceptions instead of returning fallbacks
    """
    try:
        # Get environmental data based on storage type
        if storage_type == "fridge" and temperature is not None and humidity is not None:
            # Use provided fridge conditions
            weather = {
                "temperature": temperature,
                "humidity": humidity
            }
            print(f"❄️ Using fridge conditions: {weather}")
        else:
            # Get weather data for room temperature storage
            print(f"🌤️ Getting weather for room storage at {lat}, {lon}")
            weather = get_weather(lat, lon)
            print(f"✅ Weather data: {weather}")
        
        # If it's a local file path, read and encode as base64
        if os.path.exists(image_path_or_url):
            with open(image_path_or_url, "rb") as image_file:
                base64_image = base64.b64encode(image_file.read()).decode('utf-8')
            image_content = f"data:image/jpeg;base64,{base64_image}"
        else:
            # Fallback to URL (though this might still fail)
            image_content = image_path_or_url
        
        # Enhanced prompt with confidence calculation
        storage_info = f"Storage: {storage_type.title()}" + (
            f" (Temperature: {weather['temperature']}°C, Humidity: {weather['humidity']}%)"
            if storage_type == "fridge" 
            else f" temperature (Current weather: {weather['temperature']}°C, {weather['humidity']}% humidity)"
        )
        
        prompt = f"""Analyze this food image and provide a detailed assessment. 

Location: Latitude {lat}, Longitude {lon}
{storage_info}

Please analyze the food item and calculate your confidence based on:
- Image clarity and quality
- Visibility of the food item
- How well you can identify the specific food
- How clearly you can assess its freshness/spoilage state
- Storage conditions (refrigerated vs room temperature significantly affects spoilage rates)

You MUST respond with ONLY a valid JSON object in this exact format:
{{
    "product_name": "specific name of the food item",
    "spoilage_days": number_of_days_until_spoiled,
    "predicted_date": "YYYY-MM-DD format",
    "confidence": your_confidence_percentage_as_integer,
    "reasoning": "brief explanation of your confidence level and storage impact"
}}

Rules:
- spoilage_days must be a positive integer (0 means already spoiled)
- confidence must be an integer between 0-100
- predicted_date should be today + spoilage_days
- Consider storage conditions: refrigerated food lasts much longer than room temperature
- Be honest about your confidence - if image is unclear, give lower confidence

Do not include any other text or explanation outside the JSON."""

        print(f"🔄 Making OpenAI API call...")
        
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
        
        print(f"✅ OpenAI API response received")
        
        # Check if response exists
        if not resp or not resp.choices or len(resp.choices) == 0:
            raise ValueError("Empty response from OpenAI API")
        
        if not resp.choices[0].message or not resp.choices[0].message.content:
            raise ValueError("No content in OpenAI response")
            
        text = resp.choices[0].message.content.strip()
        print(f"📝 Raw OpenAI response: {text}")
        
        if not text:
            raise ValueError("Empty content from OpenAI")
        
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
        
        print(f"✅ Validated result: {result}")
        return result

    except requests.RequestException as e:
        if storage_type != "fridge":  # Only weather error for room storage
            raise ValueError(f"Weather data unavailable: {e}")
        else:
            raise ValueError(f"Network error: {e}")
    except FileNotFoundError:
        raise ValueError("Image file not found")
    except openai.RateLimitError:
        raise ValueError("Service temporarily busy. Please try again in a moment.")
    except openai.AuthenticationError:
        raise ValueError("API authentication failed. Please check configuration.")
    except openai.BadRequestError as e:
        if "image" in str(e).lower():
            raise ValueError("Unable to process image. Please try with a clearer photo of food.")
        else:
            raise ValueError(f"Invalid request: {str(e)}")
    except Exception as e:
        print(f"❌ Unexpected error in estimate_spoilage: {e}")
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
        
        if not resp or not resp.choices or not resp.choices[0].message.content:
            raise ValueError("Empty response from OpenAI")
            
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


