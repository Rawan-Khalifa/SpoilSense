# server/openai_client.py

import os
import requests
import openai

# ─── 0) Configure OpenAI API key ───────────────────────────────────────────────
openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise ValueError("Missing OPENAI_API_KEY in environment")
openai.api_key = openai_api_key


# ─── 1) Helper: fetch current weather & humidity ──────────────────────────────
def get_weather(latitude: float, longitude: float) -> dict:
    """
    Returns a dict with keys 'temperature' (°C) and 'humidity' (%).

    Uses the free Open-Meteo API.
    """
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


# ─── 2) Main: estimate spoilage ────────────────────────────────────────────────
def estimate_spoilage(image_url: str, latitude: float, longitude: float) -> int:
    """
    Given a publicly-accessible image URL and geo coords, returns
    GPT’s integer estimate of days until spoilage.
    """
    # a) get the local weather
    weather = get_weather(latitude, longitude)

    # b) build a clear, single-shot prompt
    prompt = (
        f"The current temperature is {weather['temperature']}°C and "
        f"relative humidity is {weather['humidity']}%.\n\n"
        "Based on the image below of a food item, estimate how many days until it spoils. "
        "Answer with a single integer."
    )

    # c) call the Vision-enabled Responses API
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

    # d) parse & return an integer
    text = resp.output_text.strip()
    try:
        # In case GPT returns e.g. "5 days" or "5"
        days = int(text.split()[0])
    except Exception:
        raise ValueError(f"Unexpected spoilage response: {text}")

    return days


# ─── 3) quick CLI test ──────────────────────────────────────────────
if __name__ == "__main__":
    test_url = "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRXUUTiUsBgJA4lcA8Vq5g7CnTN8-VxdaQC7w&s"
    lat, lon = 35.6895, 139.6917  # Tokyo
    print("Estimating spoilage…")
    days = estimate_spoilage(test_url, lat, lon)
    print(f"→ Estimated days until spoilage: {days}")
