import firebase_admin
from firebase_admin import firestore
import os
import json

# Firebase client will be initialized after Firebase app is set up
db = None

def initialize_firestore():
    """Initialize Firestore client after Firebase app is set up"""
    global db
    if db is None:
        db = firestore.client()
    return db

def get_db():
    """Get Firestore client, initializing if needed"""
    if db is None:
        return initialize_firestore()
    return db

def upsert_user(uid: str, email: str, name: str):
    """
    Creates or updates /users/{uid} with email, name, and timestamp.
    """
    doc = get_db().collection("users").document(uid)
    doc.set({
        "email": email,
        "name": name,
        "updatedAt": firestore.SERVER_TIMESTAMP
    }, merge=True)
