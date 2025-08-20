# server/app.py
import os
from uuid import uuid4
from functools import wraps
from datetime import datetime, timedelta, timezone
import traceback
import tempfile

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import firebase_admin
from firebase_admin import auth as admin_auth, credentials, storage
from werkzeug.utils import secure_filename

from models import db  

# ─── Initialize Firebase only once ─────────────────────────────────────────────
if not firebase_admin._apps:
    GOOGLE_CREDS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    if not GOOGLE_CREDS:
        raise ValueError("Missing GOOGLE_APPLICATION_CREDENTIALS environment variable")
    
    cred = credentials.Certificate(GOOGLE_CREDS)
    firebase_admin.initialize_app(cred, {
        'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET', 'spoilsense-9d6d0.firebasestorage.app')
    })

# Get Firebase services
bucket = storage.bucket()

# ─── Flask application setup ─────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, origins=[
    "https://spoil-sense.vercel.app",
    "https://*.vercel.app",  # All Vercel preview deployments
    "http://localhost:3000"
], supports_credentials=True)

@app.before_request
def handle_preflight():
    if request.method == "OPTIONS":
        response = make_response()
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add('Access-Control-Allow-Headers', "*")
        response.headers.add('Access-Control-Allow-Methods', "*")
        return response

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

# ─── Helper function to upload to Firebase Storage ────────────────────────────
def upload_to_firebase_storage(file, filename):
    """
    Upload file to Firebase Storage and return public URL
    """
    try:
        print(f"🔄 Uploading {filename} to Firebase Storage...")
        
        # Create a blob in the bucket
        blob = bucket.blob(f"food-images/{filename}")
        
        # Upload the file
        blob.upload_from_file(file, content_type=file.content_type)
        print(f"✅ File uploaded successfully")
        
        # Make the blob publicly readable
        blob.make_public()
        print(f"✅ File made public")
        
        # Return the public URL
        public_url = blob.public_url
        print(f"✅ Public URL: {public_url}")
        return public_url
        
    except Exception as e:
        print(f"❌ Firebase Storage upload error: {e}")
        traceback.print_exc()
        raise ValueError(f"Failed to upload image: {str(e)}")

# ─── Helper function to delete from Firebase Storage ───────────────────────────
def delete_from_firebase_storage(image_url):
    """
    Delete file from Firebase Storage given its public URL
    """
    try:
        # Extract filename from URL
        # URL format: https://storage.googleapis.com/spoilsense-9d6d0.firebasestorage.app/food-images/filename.ext
        if "food-images/" in image_url:
            filename = image_url.split("food-images/")[1].split("?")[0]  # Remove query params
            blob = bucket.blob(f"food-images/{filename}")
            if blob.exists():
                blob.delete()
                print(f"Deleted {filename} from Firebase Storage")
    except Exception as e:
        print(f"Error deleting from Firebase Storage: {e}")

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

    update_data = {"lastLogin": datetime.now(timezone.utc)}  # Fixed deprecation
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
    
    # Delete all user's images from Firebase Storage
    try:
        for doc in db.collection("users").document(uid).collection("inventory").stream():
            data = doc.to_dict()
            image_url = data.get("imageUrl")
            if image_url:
                delete_from_firebase_storage(image_url)
    except Exception as e:
        print(f"Error cleaning up user images: {e}")
    
    # Delete user data and Firebase Auth user
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

    # Debug logging
    print(f"Predict request from user {uid}")
    print(f"Latitude: {lat}, Longitude: {lon}")
    print(f"Storage type: {storage_type}")
    print(f"Scan time: {scan_time_iso}")
    print(f"Image file: {img.filename if img else 'None'}")

    # Validate coordinates
    if lat is None or lon is None:
        print("❌ Missing coordinates")
        return jsonify({"error": "Missing latitude or longitude"}), 400

    # Validate image
    if img is None:
        print("❌ Missing image")
        return jsonify({"error": "Must include an image file"}), 400

    try:
        # Generate unique filename
        filename = secure_filename(img.filename)
        ext = os.path.splitext(filename)[1]
        new_name = f"{uuid4().hex}{ext}"
        
        print(f"Processing file: {filename} -> {new_name}")
        
        # Upload to Firebase Storage
        img.seek(0)  # Reset file pointer
        image_url = upload_to_firebase_storage(img, new_name)
        print(f"✅ Uploaded to Firebase: {image_url}")
        
        # Create temporary file for OpenAI processing
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_file:
            img.seek(0)  # Reset file pointer again
            tmp_file.write(img.read())
            tmp_file_path = tmp_file.name

        print(f"Created temp file: {tmp_file_path}")

        # Parse scanTime properly
        try:
            scan_time = datetime.fromisoformat(scan_time_iso.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            scan_time = datetime.now(timezone.utc)

        print(f"Scan time: {scan_time}")

        # Use temporary file path for OpenAI
        print("🤖 Calling OpenAI...")
        spoilage_res = estimate_spoilage(tmp_file_path, lat, lon)
        print(f"✅ OpenAI result: {spoilage_res}")
        
        # Clean up temporary file
        os.unlink(tmp_file_path)
        
        response = {
            "id": str(uuid4()),
            "imageUrl": image_url,  # Firebase Storage URL
            "productName": spoilage_res["product_name"],
            "spoilageDays": spoilage_res["spoilage_days"],
            "storageType": storage_type,
            "scanTime": scan_time.isoformat(),
            "confidence": spoilage_res["confidence"],
            "reasoning": spoilage_res.get("reasoning", "")
        }

        if storage_type == "fridge":
            response.update({
                "temperature": request.form.get("temperature", type=float),
                "humidity": request.form.get("humidity", type=float)
            })

        print(f"✅ Returning response: {response}")
        return jsonify(response), 200

    except ValueError as e:
        # These are user-friendly error messages from OpenAI client
        print(f"❌ ValueError: {e}")
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
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
                scan_time = datetime.now(timezone.utc)  # Fixed
        
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
    
    # Delete image from Firebase Storage
    image_url = data.get("imageUrl")
    if image_url:
        delete_from_firebase_storage(image_url)
    
    # Delete database record
    doc_ref.delete()
    return jsonify({"status": "deleted"}), 200

# ─── Test: weather API connectivity ───────────────────────────────────────────
@app.route("/test/weather", methods=["GET"])
def test_weather():
    """Test endpoint to debug weather API issues"""
    lat = request.args.get("lat", default=40.7128, type=float)  # NYC default
    lon = request.args.get("lon", default=-74.0060, type=float)
    
    try:
        from openai_client import get_weather, test_weather_connectivity
        
        # First test basic connectivity
        connectivity_ok = test_weather_connectivity()
        
        if not connectivity_ok:
            return jsonify({"error": "Connectivity test failed"}), 500
        
        # Then test actual weather fetch
        weather_data = get_weather(lat, lon)
        
        return jsonify({
            "status": "success",
            "weather": weather_data,
            "coordinates": {"lat": lat, "lon": lon}
        }), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "coordinates": {"lat": lat, "lon": lon}
        }), 500

# Add this route after your imports and before other routes
@app.route("/", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "SpoilSense API is running",
        "version": "1.0",
        "endpoints": [
            "/auth/login",
            "/auth/delete", 
            "/predict",
            "/inventory",
            "/test/weather"
        ]
    }), 200

# ─── Run Flask server ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    print(f"Starting SpoilSense on port {port}")
    app.run(host="0.0.0.0", port=port, debug=True)

