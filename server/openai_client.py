# server/openai_client.py

import os
import re
import json
import requests
import openai

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
def estimate_spoilage(image_url: str, latitude: float, longitude: float) -> dict:
    weather = get_weather(latitude, longitude)
    prompt = (
        f"The current temperature is {weather['temperature']}°C and "
        f"relative humidity is {weather['humidity']}%.\n\n"
        "Analyze the image of a food item and respond with a JSON object containing exactly these keys:"
        "\n - 'product_name': the name of the food item"
        "\n - 'spoilage_days': integer days until spoilage"
        "\n - 'predicted_date': estimated spoilage date in YYYY-MM-DD format"
        "\n - 'confidence': your confidence percentage (0-100)"
        "\nProvide only valid JSON in your reply."
    )
    resp = openai.responses.create(
        model="gpt-4o",
        input=[{
            "role": "user",
            "content": [
                {"type": "input_text",  "text": prompt},
                {"type": "input_image", "image_url": image_url}
            ]
        }]
    )
    text = resp.output_text.strip()
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


