import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";

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
      nav("/");
    } catch (e: any) {
      setErr(e.message);
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

      <div className="mt-6 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="email or username" value={emailOrUsername} onChange={(e)=>setEmailOrUsername(e.target.value)} />
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="password" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />

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
  );
}
