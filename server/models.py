import firebase_admin
from firebase_admin import firestore

# Use existing Firebase app to avoid conflicts
try:
    db = firestore.client()
except ValueError:
    # Fallback if no app is initialized
    from firebase_admin import credentials
    import os
    
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
        "name": name,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
