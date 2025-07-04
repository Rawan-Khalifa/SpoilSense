import os, functools
from flask import Flask, request, jsonify
from firebase_admin import auth as admin_auth
from models import upsert_user

app = Flask(__name__)

def login_required(f):
    @functools.wraps(f)
    def wrapper(*args, **kwargs):
        header = request.headers.get("Authorization", "")
        token = header.split(" ").pop() if header else None
        if not token:
            return jsonify({"error":"missing token"}), 401
        try:
            decoded = admin_auth.verify_id_token(token)
        except Exception as e:
            return jsonify({"error":"invalid token"}), 401
        # make uid/email available
        request.uid   = decoded["uid"]
        request.email = decoded.get("email")
        request.name  = decoded.get("name", "")
        return f(*args, **kwargs)
    return wrapper

@app.route("/auth/login", methods=["POST"])
@login_required
def auth_login():
    # Create/update the user doc
    upsert_user(request.uid, request.email, request.name)
    return jsonify({"status":"ok"}), 200

if __name__ == "__main__":
    app.run(debug=True)
