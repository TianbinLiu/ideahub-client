/**
 * authContext.tsx - 全局认证状态管理
 * 
 * 📖 AI开发规范：修改前必读 /.ai-instructions.md 和 PROJECT_STRUCTURE.md
 * 🔄 修改后同步更新：PROJECT_STRUCTURE.md 相关章节
 * 
 * 职责：
 * - 提供全局用户状态（user, loading）
 * - 提供认证方法（login, logout, refreshUser）
 * - 所有页面通过 useAuth() hook 获取用户状态
 */

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

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
