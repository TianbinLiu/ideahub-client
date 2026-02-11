import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";

export default function RegisterPage() {
  const nav = useNavigate();
  const { loginWithToken } = useAuth();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "company">("user");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ token: string }>(`/api/auth/register`, {
        method: "POST",
        body: JSON.stringify({ username, email, password, role }),
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
      <h1 className="text-2xl font-bold text-white">Register</h1>
      <p className="text-gray-400 text-sm mt-1">
        Already have an account? <Link className="underline" to="/login">Login</Link>
      </p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="username" value={username} onChange={(e)=>setUsername(e.target.value)} />
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="password (>= 6)" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />

        <div className="flex gap-2 text-sm">
          <button
            className={`flex-1 rounded-xl border px-3 py-2 ${role==="user"?"border-white text-white":"border-gray-700 text-gray-300"}`}
            onClick={()=>setRole("user")}
            type="button"
          >
            Creator
          </button>
          <button
            className={`flex-1 rounded-xl border px-3 py-2 ${role==="company"?"border-white text-white":"border-gray-700 text-gray-300"}`}
            onClick={()=>setRole("company")}
            type="button"
          >
            Company
          </button>
        </div>

        <button
          onClick={submit}
          disabled={loading || !username || !email || password.length < 6}
          className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
        >
          {loading ? "Creating..." : "Create account"}
        </button>

        {err && <p className="text-red-400 text-sm">Error: {err}</p>}
      </div>
    </div>
  );
}
