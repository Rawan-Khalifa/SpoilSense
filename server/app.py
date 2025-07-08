# server/app.py

import os
from uuid import uuid4
from flask import Flask, request, jsonify
from flask_cors import CORS
from firebase_admin import auth as admin_auth, credentials, initialize_app, firestore
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
from datetime import datetime, timedelta
import traceback

# ─── Load environment ──────────────────────────────────────────────────────────
load_dotenv()  # picks up server/.env

# ─── Configure local file uploads ──────────────────────────────────────────────
UPLOAD_BASE = os.getenv("UPLOAD_BASE_URL")
BASE_DIR   = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(
    __name__,
    static_url_path="/uploads",
    static_folder=UPLOAD_DIR
)

# ─── Enable CORS for your React app ────────────────────────────────────────────
CORS(app, origins=["http://localhost:3000"])

# ─── Initialize Firebase Admin & Firestore ────────────────────────────────────
cred = credentials.Certificate(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
initialize_app(cred)
db = firestore.client()

# ─── Auth decorator ────────────────────────────────────────────────────────────
def login_required(f):
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = request.headers.get("Authorization", "").split().pop()
        if not token:
            return jsonify({"error": "Missing ID token"}), 401
        try:
            decoded = admin_auth.verify_id_token(token)
        except Exception:
            return jsonify({"error": "Invalid ID token"}), 401
        request.uid = decoded["uid"]
        return f(*args, **kwargs)
    return wrapper

# ─── Health check ──────────────────────────────────────────────────────────────
@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200

# ─── Login / upsert user ───────────────────────────────────────────────────────
@app.route("/auth/login", methods=["POST"])
@login_required
def auth_login():
    uid = request.uid
    decoded = admin_auth.verify_id_token(request.headers["Authorization"].split().pop())
    doc = db.collection("users").document(uid)
    doc.set({
        "email":     decoded.get("email", ""),
        "name":      decoded.get("name", ""),
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
    return jsonify({"status": "ok"}), 200

# ─── Upload inventory (local FS) ───────────────────────────────────────────────
@app.route("/inventory", methods=["POST"])
@login_required
def upload_inventory():
    try:
        uid = request.uid

        # 1) Required: lat, lon, image
        lat = request.form.get("latitude", type=float)
        lon = request.form.get("longitude", type=float)
        img = request.files.get("image")
        if img is None or lat is None or lon is None:
            return jsonify({"error": "Missing image or coordinates"}), 400

        # 2) Optional metadata
        storage_type      = request.form.get("storageType", "room")
        temp_override     = request.form.get("temperature", type=float)
        humidity_override = request.form.get("humidity", type=float)
        scan_time_str     = request.form.get("scanTime")

        # 3) Save file locally under uploads/{uid}/…
        user_dir = os.path.join(UPLOAD_DIR, uid)
        os.makedirs(user_dir, exist_ok=True)
        filename = secure_filename(img.filename)
        unique   = f"{uuid4().hex}_{filename}"
        filepath = os.path.join(user_dir, unique)
        img.save(filepath)

        # 4) Build public URL
        host      = UPLOAD_BASE or request.host_url.rstrip("/")
        image_url = f"{host}/uploads/{uid}/{unique}"

        # 5) Call your structured spoilage estimator
        from openai_client import estimate_spoilage
        result = estimate_spoilage(image_url, lat, lon)
        product_name   = result["product_name"]
        spoilage_days  = result["spoilage_days"]
        predicted_date = result["predicted_date"]
        confidence     = result["confidence"]

        # 6) Assemble Firestore data for writing
        write_data = {
            "productName":   product_name,
            "imageUrl":      image_url,
            "latitude":      lat,
            "longitude":     lon,
            "storageType":   storage_type,
            "scanTime":      scan_time_str or datetime.utcnow().isoformat(),
            "registeredAt":  firestore.SERVER_TIMESTAMP,
            "spoilageDays":  spoilage_days,
            "predictedDate": predicted_date,
            "confidence":    confidence
        }

        if storage_type == "fridge":
            write_data["temperature"] = temp_override
            write_data["humidity"]    = humidity_override

        # 7) Write to Firestore
        coll = db.collection("users").document(uid).collection("inventory")
        doc  = coll.document()
        doc.set(write_data)

        # 8) Build a pure-Python response (no Firestore sentinels)
        resp_data = {
            "id":            doc.id,
            "productName":   product_name,
            "imageUrl":      image_url,
            "spoilageDays":  spoilage_days,
            "predictedDate": predicted_date,
            "confidence":    confidence,
            "storageType":   storage_type,
            "scanTime":      write_data["scanTime"]
        }

        if storage_type == "fridge":
            resp_data["temperature"] = temp_override
            resp_data["humidity"]    = humidity_override

        return jsonify(resp_data), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({
            "error":   "Internal server error",
            "details": str(e)
        }), 500
    
# ─── Fetch inventory for current user ───────────────────────────────────────────
@app.route("/inventory", methods=["GET"])
@login_required
def list_inventory():
    uid  = request.uid
    coll = db.collection("users").document(uid).collection("inventory")
    docs = coll.stream()

    items = []
    for d in docs:
        data = d.to_dict()

        # 1) Scan time (string)
        scan_time = data.get("scanTime", "")
        # If stored as Firestore Timestamp, convert to ISO first:
        if hasattr(scan_time, "isoformat"):
            scan_time = scan_time.isoformat()

        # 2) Spoilage days
        days = data.get("spoilageDays", 0)

        # 3) Predicted date: either stored, or derived
        pred_date = data.get("predictedDate")
        if not pred_date:
            try:
                base = datetime.fromisoformat(scan_time)
                pred_date = (base + timedelta(days=days)).date().isoformat()
            except Exception:
                pred_date = ""

        # 4) Confidence
        confidence = data.get("confidence", 0)

        # 5) Product name
        product_name = data.get("productName", "Unknown")

        # 6) Compute status
        status = "fresh"
        if days < 0:
            status = "expired"
        elif days <= 1:
            status = "expiring"

        items.append({
            "id":            d.id,
            "productName":   product_name,
            "imageUrl":      data.get("imageUrl", ""),
            "scanTime":      scan_time,
            "predictedDate": pred_date,
            "spoilageDays":  days,
            "confidence":    confidence,
            "storageType":   data.get("storageType", "room"),
            "temperature":   data.get("temperature"),
            "humidity":      data.get("humidity"),
            "status":        status
        })

    return jsonify(items), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
