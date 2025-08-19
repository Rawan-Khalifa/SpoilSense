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
  console.log("🔄 Setting up auth listener...");
  // Important: this whole block must never throw without clearing loading
  const unsubscribe = onAuthStateChanged(auth, async (u) => {
      console.log("👤 Auth state changed:", u ? u.email : "No user");
      
      try {
        setUser(u ?? null);
        if (u) {
          const idToken = await u.getIdToken();
          console.log("🎫 Got token:", idToken.substring(0, 20) + "...");
          setToken(idToken);

          
        } else {
          setToken(null);
        }
      } catch (err: any) {
        console.error("❌ Auth error:", err);
        console.error("Error details:", err.response?.data);
        // Don't clear token on backend error - allow frontend to work
      } finally {
        setLoading(false);
      }
    },
    (err) => {
      // <-- this handles listener errors (e.g., bad config/env)
      console.error("[Auth] onAuthStateChanged listener error:", err);
      setUser(null);
      setToken(null);
      setLoading(false);
    }
  );

  return () => unsubscribe();
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
    await auth.signOut();
    setUser(null);
    setToken(null);
  };

  return { user, token, loading, logout, deleteAccount };
}
