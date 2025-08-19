import firebase_admin
from firebase_admin import firestore

# Use the already initialized Firebase app
db = firestore.client()

def upsert_user(uid: str, email: str, name: str):
    """
    Creates or updates /users/{uid} with email, name, and timestamp.
    """
    doc = db.collection("users").document(uid)
    doc.set({
        "email": email,
        "name": name,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
