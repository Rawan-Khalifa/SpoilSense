import firebase_admin
from firebase_admin import firestore

# Use the existing Firebase app instead of creating a new one
try:
    app = firebase_admin.get_app()
except ValueError:
    # This means no app exists, so we need to create one
    # But since app.py should initialize it, this shouldn't happen
    raise ValueError("Firebase not initialized. Make sure app.py initializes Firebase first.")

db = firestore.client(app)

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
