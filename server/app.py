import os
import json
from uuid import uuid4
from flask import Flask, request, jsonify
from flask_cors import CORS
from firebase_admin import auth as admin_auth, credentials, initialize_app, storage, firestore
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# load env
load_dotenv()

# init Flask + CORS
app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])  # adjust your origin

# init Firebase Admin with Firestore + Storage
cred = credentials.Certificate(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
initialize_app(cred, {
    "storageBucket": os.getenv("FIREBASE_STORAGE_BUCKET")
})
db     = firestore.client()
bucket = storage.bucket()

def login_required(f):
    """Decorator to verify Firebase ID token and set request.uid"""
    from functools import wraps

    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        token = auth_header.split(" ").pop() if auth_header else None
        if not token:
            return jsonify({"error": "Missing ID token"}), 401
        try:
            decoded = admin_auth.verify_id_token(token)
        except Exception:
            return jsonify({"error": "Invalid ID token"}), 401
        request.uid = decoded["uid"]
        return f(*args, **kwargs)
    return wrapper

# Health check
@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200

# Existing login/upsert
@app.route("/auth/login", methods=["POST"])
@login_required
def auth_login():
    uid = request.uid
    decoded = admin_auth.verify_id_token(request.headers["Authorization"].split().pop())
    upsert_user = db.collection("users").document(uid)
    upsert_user.set({
        "email": decoded.get("email",""),
        "name": decoded.get("name",""),
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
    return jsonify({"status": "ok"}), 200

# New inventory endpoint
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

    # store image in Firebase Storage
    filename   = secure_filename(img.filename)
    blob_path  = f"inventory/{uid}/{uuid4().hex}_{filename}"
    blob       = bucket.blob(blob_path)
    blob.upload_from_file(img, content_type=img.content_type)
    blob.make_public()  # so clients can fetch without a signed URL
    image_url  = blob.public_url

    # call your existing spoilage logic
    # make sure openai_client.py exports estimate_spoilage(image_url, lat, lon)
    from openai_client import estimate_spoilage
    spoilage_days = estimate_spoilage(image_url, lat, lon)

    # record in Firestore
    coll = db.collection("users").document(uid).collection("inventory")
    doc  = coll.document()  # auto‐ID
    registered_at = firestore.SERVER_TIMESTAMP
    predicted_date = firestore.SERVER_TIMESTAMP  # or compute client‐side if needed

    doc.set({
      "imageUrl": image_url,
      "latitude": lat,
      "longitude": lon,
      "registeredAt": registered_at,
      "spoilageDays": spoilage_days,
      # optionally compute predictedSpoilDate = registeredAt + spoilageDays
    })

    return jsonify({
      "id": doc.id,
      "imageUrl": image_url,
      "spoilageDays": spoilage_days
    }), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
