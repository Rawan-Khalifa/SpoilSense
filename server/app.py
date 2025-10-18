# server/app.py
import os
from uuid import uuid4
from functools import wraps
from datetime import datetime, timedelta, timezone
import traceback
import tempfile
from collections import defaultdict
import time
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, auth as admin_auth, storage
from werkzeug.utils import secure_filename

from models import initialize_firestore, get_db
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError  

# ─── Initialize Firebase only once ─────────────────────────────────────────────
if not firebase_admin._apps:
    STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "spoilsense-9d6d0.firebasestorage.app")
    
    # Try to use credentials from environment variables first, then fallback to file
    firebase_credentials_json = os.getenv("FIREBASE_CREDENTIALS_JSON")
    if firebase_credentials_json:
        try:
            # Parse JSON from environment variable
            import json
            cred_dict = json.loads(firebase_credentials_json)
            cred = credentials.Certificate(cred_dict)
            print("✅ Using Firebase credentials from environment variable")
        except json.JSONDecodeError as e:
            print(f"❌ Failed to parse Firebase credentials JSON: {e}")
            raise ValueError("Invalid Firebase credentials JSON format")
    else:
        # Fallback to file path
        GOOGLE_CREDS = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        if not GOOGLE_CREDS:
            raise ValueError("Missing GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_CREDENTIALS_JSON environment variable")
        cred = credentials.Certificate(GOOGLE_CREDS)
        print("✅ Using Firebase credentials from file path")
    
    try:
        firebase_admin.initialize_app(cred, {
            'storageBucket': STORAGE_BUCKET
        })
        print("✅ Firebase initialized successfully")
        
        # Initialize Firestore client
        initialize_firestore()
        print("✅ Firestore client initialized")
    except Exception as e:
        print(f"❌ Firebase initialization failed: {e}")
        raise

# Get Firebase services with explicit bucket name
STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "spoilsense-9d6d0.firebasestorage.app")
bucket = storage.bucket(STORAGE_BUCKET)

# ─── Rate limiting setup ─────────────────────────────────────────────────
# Simple in-memory rate limiting (use Redis in production)
request_counts = defaultdict(list)
RATE_LIMIT_WINDOW = 300  # 5 minutes
RATE_LIMIT_MAX_REQUESTS = 100  # Max requests per window

def rate_limit_check(identifier: str) -> bool:
    """Simple rate limiting check"""
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    
    # Clean old requests
    request_counts[identifier] = [
        req_time for req_time in request_counts[identifier] 
        if req_time > window_start
    ]
    
    # Check if under limit
    if len(request_counts[identifier]) >= RATE_LIMIT_MAX_REQUESTS:
        return False
    
    # Add current request
    request_counts[identifier].append(now)
    return True

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
        origin = request.headers.get('Origin')
        allowed_origins = [
            "https://spoil-sense.vercel.app",
            "http://localhost:3000"
        ]
        
        # Check if origin is in allowed list or is a Vercel preview deployment
        if origin in allowed_origins or (origin and "vercel.app" in origin):
            response.headers.add("Access-Control-Allow-Origin", origin)
        
        response.headers.add('Access-Control-Allow-Headers', "Authorization, Content-Type")
        response.headers.add('Access-Control-Allow-Methods', "GET, POST, PUT, DELETE, OPTIONS")
        response.headers.add('Access-Control-Allow-Credentials', "true")
        return response

# ─── Decorator to verify Firebase ID token ────────────────────────────────────
def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # Rate limiting check
        client_ip = request.remote_addr or request.headers.get('X-Forwarded-For', 'unknown')
        if not rate_limit_check(client_ip):
            return jsonify({"error": "Rate limit exceeded. Please try again later."}), 429
        
        auth_header = request.headers.get("Authorization", "")
        if not auth_header:
            return jsonify({"error": "Authorization header required"}), 401
        
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "Invalid authorization header format"}), 401
            
        token = auth_header.split(" ", 1)[1]
        if not token:
            return jsonify({"error": "Token required"}), 401
        
        try:
            decoded = admin_auth.verify_id_token(token)
            request.uid = decoded.get("uid")
            if not request.uid:
                return jsonify({"error": "Invalid token payload"}), 401
        except admin_auth.ExpiredIdTokenError:
            return jsonify({"error": "Token expired"}), 401
        except admin_auth.RevokedIdTokenError:
            return jsonify({"error": "Token revoked"}), 401
        except admin_auth.InvalidIdTokenError:
            return jsonify({"error": "Invalid token"}), 401
        except Exception as e:
            print(f"Token verification error: {e}")
            return jsonify({"error": "Token verification failed"}), 401
            
        return f(*args, **kwargs)
    return wrapper

# ─── Helper function to upload to Google Cloud Storage (Alternative) ───────────
def upload_to_gcs_storage(file, filename):
    """
    Upload file to Google Cloud Storage and return public URL (fallback method)
    """
    try:
        print(f"🔄 Uploading {filename} to Google Cloud Storage...")
        
        from google.cloud import storage as gcs_storage
        client = gcs_storage.Client()
        bucket = client.bucket("spoilsense-food-images-bucket")
        
        # Create a blob and upload
        blob = bucket.blob(f"food-images/{filename}")
        file.seek(0)  # Reset file pointer
        blob.upload_from_file(file, content_type=file.content_type)
        
        # Make it publicly accessible
        blob.make_public()
        
        public_url = f"https://storage.googleapis.com/spoilsense-food-images-bucket/food-images/{filename}"
        print(f"✅ GCS Upload successful: {public_url}")
        return public_url
        
    except Exception as e:
        print(f"❌ Google Cloud Storage upload error: {e}")
        raise ValueError(f"Failed to upload image: {str(e)}")

# ─── Robust upload function with fallback ─────────────────────────────────────
def upload_image_with_fallback(file, filename):
    """
    Try Firebase Storage first, fall back to Google Cloud Storage if it fails
    """
    # First, try Firebase Storage
    try:
        return upload_to_firebase_storage(file, filename)
    except Exception as firebase_error:
        print(f"⚠️ Firebase Storage failed: {firebase_error}")
        print(f"🔄 Falling back to Google Cloud Storage...")
        
        # Fall back to Google Cloud Storage
        try:
            return upload_to_gcs_storage(file, filename)
        except Exception as gcs_error:
            print(f"❌ Both storage methods failed!")
            print(f"Firebase error: {firebase_error}")
            print(f"GCS error: {gcs_error}")
            raise ValueError(f"All storage methods failed. Firebase: {firebase_error}, GCS: {gcs_error}")

# ─── Helper function to upload to Firebase Storage ────────────────────────────
def upload_to_firebase_storage(file, filename):
    """
    Upload file to Firebase Storage and return public URL
    """
    try:
        print(f"🔄 Uploading {filename} to Firebase Storage...")
        
        # Get fresh bucket reference to ensure proper auth
        storage_bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "spoilsense-9d6d0.firebasestorage.app")
        fresh_bucket = storage.bucket(storage_bucket_name)
        
        # Create a blob in the bucket
        blob = fresh_bucket.blob(f"food-images/{filename}")
        
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
            
            # Get fresh bucket reference to ensure proper auth
            storage_bucket_name = os.getenv("FIREBASE_STORAGE_BUCKET", "spoilsense-9d6d0.firebasestorage.app")
            fresh_bucket = storage.bucket(storage_bucket_name)
            
            blob = fresh_bucket.blob(f"food-images/{filename}")
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

    get_db().collection("users").document(uid).set(update_data, merge=True)
    return jsonify({"status": "ok"}), 200

# ─── Auth: delete account ───────────────────────────────────────────────────
@app.route("/auth/delete", methods=["DELETE"])
@login_required
def auth_delete():
    uid = request.uid
    
    # Delete all user's images from Firebase Storage
    try:
        for doc in get_db().collection("users").document(uid).collection("inventory").stream():
            data = doc.to_dict()
            image_url = data.get("imageUrl")
            if image_url:
                delete_from_firebase_storage(image_url)
    except Exception as e:
        print(f"Error cleaning up user images: {e}")
    
    # Delete user data and Firebase Auth user
    get_db().collection("users").document(uid).delete()
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
        image_url = upload_image_with_fallback(img, new_name)
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
        
        coll = get_db().collection("users").document(uid).collection("inventory")
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
    
    def fetch_inventory_data():
        """Fetch inventory data in a separate function"""
        items = []
        collection_ref = get_db().collection("users").document(uid).collection("inventory")
        docs = collection_ref.stream()
        
        for doc in docs:
            try:
                data = doc.to_dict()
                if not data:  # Skip empty documents
                    continue
                    
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
            except Exception as doc_error:
                print(f"⚠️ Error processing document {doc.id}: {doc_error}")
                continue
        return items
    
    try:
        print(f"📋 Fetching inventory for user: {uid}")
        
        # Use ThreadPoolExecutor with timeout
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(fetch_inventory_data)
            try:
                # 20-second timeout
                items = future.result(timeout=20)
                print(f"✅ Returning {len(items)} inventory items")
                return jsonify(items), 200
            except FutureTimeoutError:
                print(f"⏰ Timeout fetching inventory for user {uid}")
                return jsonify({"error": "Request timeout - database is slow", "items": []}), 200
        
    except Exception as e:
        print(f"❌ Error fetching inventory: {e}")
        traceback.print_exc()
        return jsonify({"error": "Failed to fetch inventory", "details": str(e)}), 500

# ─── Inventory: delete scan ───────────────────────────────────────────────────
@app.route("/inventory/<item_id>", methods=["DELETE"])
@login_required
def delete_inventory(item_id):
    uid = request.uid
    doc_ref = get_db().collection("users").document(uid).collection("inventory").document(item_id)
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
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "endpoints": [
            "/auth/login",
            "/auth/delete", 
            "/predict",
            "/inventory",
            "/test/weather"
        ]
    }), 200

@app.route("/health", methods=["GET"])
def health():
    """Simple health check"""
    def test_firebase():
        test_doc = get_db().collection("_health_check").document("test")
        test_doc.set({"timestamp": datetime.now(timezone.utc)})
        return True
    
    try:
        # Test Firebase connection with timeout
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(test_firebase)
            try:
                future.result(timeout=10)  # 10-second timeout
                return jsonify({
                    "status": "healthy",
                    "firebase": "connected",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }), 200
            except FutureTimeoutError:
                return jsonify({
                    "status": "degraded",
                    "firebase": "timeout",
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }), 200
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now(timezone.utc).isoformat()
        }), 500

# ─── Run Flask server ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Cloud Run sets PORT env var, default to 8080 for local development
    port = int(os.getenv("PORT", 8080))
    print(f"Starting SpoilSense on port {port}")
    
    # For production (Cloud Run), don't use debug mode
    debug_mode = os.getenv("FLASK_ENV") == "development"
    app.run(host="0.0.0.0", port=port, debug=debug_mode)

