import os
import firebase_admin
from firebase_admin import credentials, firestore

# initialize the Admin SDK once
cred = credentials.Certificate(os.getenv("GOOGLE_APPLICATION_CREDENTIALS"))
firebase_admin.initialize_app(cred)
db = firestore.client()

def upsert_user(uid: str, email: str, name: str):
    """
    Creates or updates /users/{uid} with email, name, and timestamp.
    """
    doc = db.collection("users").document(uid)
    doc.set({
        "email": email,
        "name":  name,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
