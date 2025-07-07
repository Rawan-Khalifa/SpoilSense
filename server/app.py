# server/app.py

import os
import json
from uuid import uuid4
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from firebase_admin import auth as admin_auth, credentials, initialize_app, firestore
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# ─── Load environment ──────────────────────────────────────────────────────────
load_dotenv()  # picks up server/.env

# ─── Configure local file uploads ──────────────────────────────────────────────
BASE_DIR   = os.path.dirname(__file__)
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

# When you do `GET /uploads/<path:filename>`, Flask will serve from UPLOAD_DIR
app = Flask(
    __name__,
    static_url_path="/uploads",  # URL prefix for serving
    static_folder=UPLOAD_DIR     # directory to serve
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
        token = request.headers.get("Authorization", "").split(" ").pop()
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
        "email":    decoded.get("email", ""),
        "name":     decoded.get("name", ""),
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
    return jsonify({"status": "ok"}), 200

# ─── Upload inventory (local FS) ───────────────────────────────────────────────
@app.route("/inventory", methods=["POST"])
@login_required
def upload_inventory():
    uid = request.uid

    # parse form
    lat = request.form.get("latitude", type=float)
    lon = request.form.get("longitude", type=float)
    img = request.files.get("image")
    if img is None or lat is None or lon is None:
        return jsonify({"error":"Missing image or coordinates"}), 400

    # save file locally under uploads/{uid}/...
    user_dir = os.path.join(UPLOAD_DIR, uid)
    os.makedirs(user_dir, exist_ok=True)

    filename = secure_filename(img.filename)
    unique   = f"{uuid4().hex}_{filename}"
    filepath = os.path.join(user_dir, unique)
    img.save(filepath)

    # construct the public URL to serve it
    host = request.host_url.rstrip("/")
    image_url = f"{host}/uploads/{uid}/{unique}"

    # call your spoilage estimator
    from openai_client import estimate_spoilage
    spoilage_days = estimate_spoilage(image_url, lat, lon)

    # record in Firestore
    coll = db.collection("users").document(uid).collection("inventory")
    doc  = coll.document()
    doc.set({
        "imageUrl":      image_url,
        "latitude":      lat,
        "longitude":     lon,
        "registeredAt":  firestore.SERVER_TIMESTAMP,
        "spoilageDays":  spoilage_days
    })

    return jsonify({
        "id":           doc.id,
        "imageUrl":     image_url,
        "spoilageDays": spoilage_days
    }), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
