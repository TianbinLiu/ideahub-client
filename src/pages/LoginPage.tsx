// src/pages/LoginPage.tsx

import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import OAuthButtons from "../components/OAuthButtons";

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { loginWithToken } = useAuth();

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const qNext = new URLSearchParams(loc.search).get("next");
  const state = loc.state as any;
  const sNext = state?.from?.pathname
    ? `${state.from.pathname}${state.from.search || ""}`
    : null;

  // 支持 /login?next=/ideas/xxx 这种形式（现在先不强依赖后端 next，但前端先做好）
  const next = qNext || sNext || "/";

  async function submit() {
    try {
      setErr("");
      setLoading(true);

      const res = await apiFetch<{ token: string }>(`/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({ emailOrUsername, password }),
      });

      await loginWithToken(res.token);
      toast.success("Welcome back!");
      nav(next);
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Login</h1>
      <p className="text-gray-400 text-sm mt-1">
        New here?{" "}
        <Link className="underline" to="/register">
          Create an account
        </Link>
      </p>

      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        {/* ===== OAuth quick login ===== */}
        <div className="text-sm font-semibold text-white">Sign in quickly</div>
        <p className="text-xs text-gray-400 mt-1">
          Continue with Google or GitHub. You’ll be redirected and come back automatically.
        </p>

        <div className="mt-3">
          <OAuthButtons />
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-gray-800" />
          <div className="text-xs text-gray-500">or sign in with password</div>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* ===== password login ===== */}
        <div className="grid gap-3">
          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="email or username"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            disabled={loading}
            autoComplete="username"
          />

          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            autoComplete="current-password"
          />

          <button
            onClick={submit}
            disabled={loading || !emailOrUsername.trim() || !password}
            className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {/* 预留：忘记密码入口（你后面做邮箱 OTP reset 可以直接接这里） */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Tip: OAuth login does not require a password.</span>
            <button
              type="button"
              className="text-gray-300 hover:text-white underline decoration-gray-700"
              onClick={() => toast("Password reset is coming soon.", { icon: "🛠️" })}
              disabled={loading}
            >
              Forgot password?
            </button>
          </div>

          {err && <p className="text-red-400 text-sm">Error: {err}</p>}
        </div>
      </div>
    </div>
  );
}
