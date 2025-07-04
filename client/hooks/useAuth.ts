import { useState, useEffect }      from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth }                     from "../services/firebase";

export function useAuth() {
  const [user, setUser] = useState<User|null>(null);
  const [token, setToken] = useState<string|null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u);
      if (u) {
        const idToken = await u.getIdToken();
        setToken(idToken);
      } else {
        setToken(null);
      }
    });
    return () => unsub();
  }, []);

  return { user, token };
}
