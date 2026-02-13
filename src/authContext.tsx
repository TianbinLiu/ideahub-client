//authContext.tsx

import { createContext, useContext, useEffect, useState } from "react";
import { apiFetch } from "./api";
import { clearToken, getToken, setToken } from "./auth";

export type AuthUser = {
  _id: string;
  username: string;
  email: string;
  role: "user" | "company" | "admin";
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  loginWithToken: (token: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshMe() {
    const token = getToken();
    if (!token) {
      setUser(null);
      return;
    }
    const res = await apiFetch<{ ok: boolean; user: AuthUser }>("/api/auth/me");
    setUser(res.user);
  }

  async function loginWithToken(token: string) {
    setToken(token);
    await refreshMe();
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } catch {
        // token 无效就清掉
        clearToken();
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, loginWithToken, logout, refreshMe }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
