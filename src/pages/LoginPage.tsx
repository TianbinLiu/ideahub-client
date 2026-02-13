import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { API_BASE } from "../config"; // ✅ 用你已有的后端 base（避免 import.meta.env）

export default function LoginPage() {
  const nav = useNavigate();
  const { loginWithToken } = useAuth();

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // ✅ 预留：等 B3 做好后端 OAuth，再把 routes 接通即可
  const googleOAuthUrl = `${API_BASE}/api/auth/oauth/google`;
  const githubOAuthUrl = `${API_BASE}/api/auth/oauth/github`;

  async function submit() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ token: string }>(`/api/auth/login`, {
        method: "POST",
        body: JSON.stringify({ emailOrUsername, password }),
      });
      await loginWithToken(res.token);
      toast.success("Logged in!");
      nav("/");
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg); // 可选
    } finally {
      setLoading(false);
    }
  }

  function openOAuth(url: string) {
    // OAuth 必须整页跳转
    window.location.href = url;
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Login</h1>
      <p className="text-gray-400 text-sm mt-1">
        New here? <Link className="underline" to="/register">Create an account</Link>
      </p>

      {/* ✅ 新增：多渠道登录入口（占位，不影响现有登录） */}
      <div className="mt-4 grid gap-2">
        <button
          type="button"
          onClick={() => openOAuth(googleOAuthUrl)}
          className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900"
        >
          Continue with Google (coming soon)
        </button>

        <button
          type="button"
          onClick={() => openOAuth(githubOAuthUrl)}
          className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900"
        >
          Continue with GitHub (coming soon)
        </button>

        <Link
          to="/login/phone"
          className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900 text-center"
        >
          Login with phone (OTP) (coming soon)
        </Link>
      </div>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px bg-gray-800 flex-1" />
        <div className="text-xs text-gray-500">OR</div>
        <div className="h-px bg-gray-800 flex-1" />
      </div>

      {/* ✅ 原有：邮箱/用户名 + 密码 */}
      <div className="mt-2 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <input
          className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="email or username"
          value={emailOrUsername}
          onChange={(e) => setEmailOrUsername(e.target.value)}
          disabled={loading}
        />
        <input
          className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />

        <button
          onClick={submit}
          disabled={loading || !emailOrUsername || !password}
          className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
        >
          {loading ? "Logging in..." : "Login"}
        </button>

        <div className="text-xs text-gray-500">
          Tip: If you just registered, make sure you verified your email code on the Register page.
        </div>

        {err && <p className="text-red-400 text-sm">Error: {err}</p>}
      </div>
    </div>
  );
}
