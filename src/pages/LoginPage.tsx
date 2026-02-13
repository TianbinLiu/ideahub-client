import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import OAuthButtons from "../components/OAuthButtons";

export default function LoginPage() {
  const nav = useNavigate();
  const { loginWithToken } = useAuth();

  const [emailOrUsername, setEmailOrUsername] = useState("");
  const [password, setPassword] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

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
      nav("/");
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
        New here? <Link className="underline" to="/register">Create an account</Link>
      </p>

      {/* OAuth */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="text-sm font-semibold text-white">Sign in quickly</div>
        <p className="text-xs text-gray-400 mt-1">
          Use Google or GitHub. You’ll be redirected and come back automatically.
        </p>
        <div className="mt-3">
          <OAuthButtons />
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-gray-800" />
          <div className="text-xs text-gray-500">or</div>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* Email/Username + Password */}
        <div className="grid gap-3">
          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="email or username"
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
          />
          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={submit}
            disabled={loading || !emailOrUsername || !password}
            className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Login"}
          </button>

          {err && <p className="text-red-400 text-sm">Error: {err}</p>}
        </div>
      </div>
    </div>
  );
}
