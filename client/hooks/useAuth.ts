"use client";

import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import axios from "axios";
import { auth } from "../services/firebase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const idToken = await u.getIdToken();
          setToken(idToken);

          // automatically call your backend to upsert on every sign-in
          await axios.post(
            `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
            {},
            { headers: { Authorization: `Bearer ${idToken}` } }
          );
        } catch (err) {
          console.error("Failed to sync with backend:", err);
        }
      } else {
        setToken(null);
      }
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { user, token, loading };
}
