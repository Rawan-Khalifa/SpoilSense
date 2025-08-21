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
    
    const unsubscribe = onAuthStateChanged(auth, 
      async (u) => {
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
          // If token retrieval fails, sign out the user
          setUser(null);
          setToken(null);
        } finally {
          setLoading(false);
        }
      },
    );

    return () => unsubscribe();
  }, []);

  // Enhanced token refresh with proper expiration checking
  useEffect(() => {
    if (!user) return;

    const checkAndRefreshToken = async () => {
      try {
        // Get token result with expiration info
        const tokenResult = await user.getIdTokenResult();
        const expirationTime = new Date(tokenResult.expirationTime);
        const now = new Date();
        const timeUntilExpiry = expirationTime.getTime() - now.getTime();
        
        // Refresh if token expires within 5 minutes
        if (timeUntilExpiry < 5 * 60 * 1000) {
          console.log("🔄 Refreshing token - expires soon");
          const freshToken = await user.getIdToken(true);
          setToken(freshToken);
        }
      } catch (error) {
        console.error("❌ Token refresh failed:", error);
        // If refresh fails, sign out user
        await signOut(auth);
        setUser(null);
        setToken(null);
      }
    };

    // Check immediately and then every 5 minutes
    checkAndRefreshToken();
    const refreshInterval = setInterval(checkAndRefreshToken, 5 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [user]);

  // signs out locally + tells your backend to delete auth record
  const deleteAccount = async () => {
    if (!token) return;
    try {
      // 1) delete from backend
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_BASE_URL}/auth/delete`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (err: any) {
      console.error("Backend delete failed:", err);
      // Log specific error types
      if (err.response?.status === 401) {
        console.log("🔒 Token expired during account deletion");
      }
      // Continue with local signout even if backend fails
    } finally {
      // 2) sign out of Firebase
      await signOut(auth);
      setUser(null);
      setToken(null);
    }
  };

  // just a normal logout (keep account)
  const logout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      // Always clear state
      setUser(null);
      setToken(null);
    }
  };

  return { user, token, loading, logout, deleteAccount };
}
