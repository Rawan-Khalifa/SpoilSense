import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from firebase_admin import auth as admin_auth
from models import upsert_user
from dotenv import load_dotenv

load_dotenv()  # picks up .env in server/

app = Flask(__name__)
# allow your React app to call this API
CORS(app, origins=["http://localhost:3000"])

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({"status":"ok"}), 200

@app.route("/auth/login", methods=["POST"])
def auth_login():
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ").pop() if auth_header else None
    if not token:
        return jsonify({"error": "Missing ID token"}), 401

    try:
        decoded = admin_auth.verify_id_token(token)
    except Exception:
        return jsonify({"error": "Invalid ID token"}), 401

    uid   = decoded["uid"]
    email = decoded.get("email", "")
    name  = decoded.get("name", "")
    upsert_user(uid, email, name)

    return jsonify({"status": "ok"}), 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
