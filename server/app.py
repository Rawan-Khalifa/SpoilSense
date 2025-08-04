# server/app.py
import os
from uuid import uuid4
from functools import wraps
from datetime import datetime, timedelta
import traceback

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from firebase_admin import auth as admin_auth, credentials, initialize_app, firestore
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# ─── Load environment variables ───────────────────────────────────────────────
load_dotenv()
GOOGLE_CREDS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
cred = credentials.Certificate(GOOGLE_CREDS)
initialize_app(cred)
db = firestore.client()

# ─── Flask application setup ─────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# ─── File upload configuration ────────────────────────────────────────────────
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
UPLOAD_BASE = os.getenv("UPLOAD_BASE", "https://spoil-sense.loca.lt")
if not os.path.isdir(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR, exist_ok=True)

# ─── Decorator to verify Firebase ID token ────────────────────────────────────
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Unauthorized"}), 401
        token = auth_header.split(" ", 1)[1]
        try:
            decoded = admin_auth.verify_id_token(token)
            request.uid = decoded.get("uid")
        except Exception:
            return jsonify({"error": "Invalid or expired token"}), 401
        return f(*args, **kwargs)
    return wrapper

# ─── Serve uploaded files ─────────────────────────────────────────────────────
@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    """Serve uploaded files with proper headers"""
    try:
        response = send_from_directory(
            UPLOAD_DIR, 
            filename,
            as_attachment=False
        )
        # Set cache headers manually
        response.cache_control.max_age = 3600  # 1 hour
        return response
    except FileNotFoundError:
        return jsonify({"error": "Image not found"}), 404

# ─── External logic imports ───────────────────────────────────────────────────
from openai_client import estimate_spoilage, estimate_price

# ─── Auth: login/upsert user & update location ────────────────────────────────
@app.route("/auth/login", methods=["POST"])
@login_required
def auth_login():
    uid = request.uid
    data = request.get_json(silent=True) or {}
    lat = data.get("latitude")
    lon = data.get("longitude")

    update_data = {"lastLogin": datetime.utcnow()}
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        update_data["latitude"] = lat
        update_data["longitude"] = lon

    db.collection("users").document(uid).set(update_data, merge=True)
    return jsonify({"status": "ok"}), 200

# ─── Auth: delete account ───────────────────────────────────────────────────
@app.route("/auth/delete", methods=["DELETE"])
@login_required
def auth_delete():
    uid = request.uid
    db.collection("users").document(uid).delete()
    admin_auth.delete_user(uid)
    return jsonify({"status": "account deleted"}), 200

# ─── Inventory: predict & save a scan ─────────────────────────────────────────
@app.route("/predict", methods=["POST"])
@login_required
def predict_spoilage():
    """Only predict, don't save to database"""
    uid = request.uid
    lat = request.form.get("latitude", type=float)
    lon = request.form.get("longitude", type=float)
    storage_type = request.form.get("storageType", default="room")
    scan_time_iso = request.form.get("scanTime")
    img = request.files.get("image")

    # Validate coordinates
    if lat is None or lon is None:
        return jsonify({"error": "Missing latitude or longitude"}), 400

    # Validate image or URL
    if img is None:
        return jsonify({"error": "Must include an image file"}), 400

    try:
        # Store image temporarily
        if img:
            filename = secure_filename(img.filename)
            ext = os.path.splitext(filename)[1]
            new_name = f"{uuid4().hex}{ext}"
            save_path = os.path.join(UPLOAD_DIR, new_name)
            img.save(save_path)
            image_url = f"{UPLOAD_BASE}/uploads/{new_name}"
        else:
            image_url = img_url

        # Parse scanTime properly
        try:
            scan_time = datetime.fromisoformat(scan_time_iso.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            scan_time = datetime.utcnow()

        # Use local file path for OpenAI
        spoilage_res = estimate_spoilage(save_path, lat, lon)
        
        response = {
            "id": str(uuid4()),
            "imageUrl": f"{UPLOAD_BASE}/uploads/{new_name}",
            "productName": spoilage_res["product_name"],
            "spoilageDays": spoilage_res["spoilage_days"],
            "storageType": storage_type,
            "scanTime": scan_time.isoformat(),  # Ensure consistent format
            "confidence": spoilage_res["confidence"],
            "reasoning": spoilage_res.get("reasoning", "")
        }

        if storage_type == "fridge":
            response.update({
                "temperature": request.form.get("temperature", type=float),
                "humidity": request.form.get("humidity", type=float)
            })

        return jsonify(response), 200

    except Exception:
        traceback.print_exc()
        return jsonify({"error": "Prediction failed"}), 500

@app.route("/inventory", methods=["POST"])
@login_required
def save_to_inventory():
    """Save prediction result to inventory"""
    uid = request.uid
    data = request.get_json()
    
    try:
        # Handle different date formats
        scan_time_str = data.get("scanTime")
        try:
            # Try ISO format first
            scan_time = datetime.fromisoformat(scan_time_str.replace('Z', '+00:00'))
        except ValueError:
            # Try parsing localized format
            try:
                scan_time = datetime.strptime(scan_time_str, "%m/%d/%Y, %I:%M:%S %p")
            except ValueError:
                # Fallback to current time
                scan_time = datetime.utcnow()
        
        expiration_date = scan_time + timedelta(days=data.get("spoilageDays"))
        
        # Get price estimate
        try:
            estimated_price = estimate_price(data.get("productName"))
        except ValueError as e:
            print(f"Price estimation failed: {e}")
            estimated_price = 0.0  # Default price
        
        record = {
            "imageUrl": data.get("imageUrl"),
            "scanTime": scan_time,
            "productName": data.get("productName"),
            "spoilageDays": data.get("spoilageDays"),
            "predictedDate": expiration_date,
            "confidence": data.get("confidence"),
            "storageType": data.get("storageType"),
            "estimatedPrice": estimated_price,
            "reasoning": data.get("reasoning", "")
        }
        
        if data.get("storageType") == "fridge":
            record.update({
                "temperature": data.get("temperature"),
                "humidity": data.get("humidity")
            })
        
        coll = db.collection("users").document(uid).collection("inventory")
        doc = coll.document()
        doc.set(record)
        
        return jsonify({"status": "saved", "id": doc.id}), 200
        
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Save failed: {str(e)}"}), 500

# ─── Inventory: list scans ────────────────────────────────────────────────────
@app.route("/inventory", methods=["GET"])
@login_required
def list_inventory():
    uid = request.uid
    items = []
    for doc in db.collection("users").document(uid).collection("inventory").stream():
        data = doc.to_dict()
        scanned = data.get("scanTime")
        expiration = data.get("predictedDate")
        items.append({
            "id": doc.id,
            "imageUrl": data.get("imageUrl"),
            "storageType": data.get("storageType"),
            "scanTime": scanned.isoformat() if isinstance(scanned, datetime) else scanned,
            "productName": data.get("productName"),
            "spoilageDays": data.get("spoilageDays"),
            # stored predictedDate is expiration datetime
            "predictedDate": expiration.isoformat() if isinstance(expiration, datetime) else expiration,
            "confidence": data.get("confidence"),
            "estimatedPrice": data.get("estimatedPrice"),
            "temperature": data.get("temperature"),
            "humidity": data.get("humidity")
        })
    return jsonify(items), 200

# ─── Inventory: delete scan ───────────────────────────────────────────────────
@app.route("/inventory/<item_id>", methods=["DELETE"])
@login_required
def delete_inventory(item_id):
    uid = request.uid
    doc_ref = db.collection("users").document(uid).collection("inventory").document(item_id)
    snapshot = doc_ref.get()
    if not snapshot.exists:
        return jsonify({"error": "Not found"}), 404
    data = snapshot.to_dict()
    # Delete local file if exists
    try:
        _, _, path = data.get("imageUrl", "").partition("/uploads/")
        file_path = os.path.join(UPLOAD_DIR, path)
        if os.path.exists(file_path):
            os.remove(file_path)
    except Exception:
        pass
    doc_ref.delete()
    return jsonify({"status": "deleted"}), 200

# ─── Run Flask server ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"Starting SpoilSense on port {port}, uploads base {UPLOAD_BASE}")
    app.run(host="0.0.0.0", port=port, debug=True)

