"use client";

import { useState, useEffect }           from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import axios                              from "axios";
import { auth }                          from "../services/firebase";

export function useAuth() {
  const [user,    setUser]    = useState<User|null>(null);
  const [token,   setToken]   = useState<string|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const idToken = await u.getIdToken();
        setToken(idToken);
        // upsert on every sign-in
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/login`,
          {},
          { headers: { Authorization: `Bearer ${idToken}` } }
        );
      } else {
        setToken(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // signs out locally + tells your backend to delete auth record
  const deleteAccount = async () => {
    if (!token) return;
    try {
      // 1) delete from backend
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/delete`, // Changed from NEXT_PUBLIC_API_URL
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err) {
      console.error("Backend delete failed:", err);
    } finally {
      // 2) sign out of Firebase
      await signOut(auth);
      setUser(null);
      setToken(null);
    }
  };

  // just a normal logout (keep account)
  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setToken(null);
  };

  return { user, token, loading, logout, deleteAccount };
}
