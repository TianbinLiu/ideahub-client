// src/pages/RegisterPage.tsx

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import OAuthButtons from "../components/OAuthButtons";
import { useLocation } from "react-router-dom";

type Step = "START" | "VERIFY";

export default function RegisterPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const next = new URLSearchParams(loc.search).get("next") || "/";
  const { loginWithToken } = useAuth();

  const [step, setStep] = useState<Step>("START");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "company">("user");

  const [code, setCode] = useState("");

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    try {
      setErr("");
      setLoading(true);

      await apiFetch(`/api/auth/email/register/start`, {
        method: "POST",
        body: JSON.stringify({
          username,
          email,
          password,
        }),
      });

      toast.success("Verification code sent. Check your email.");
      setStep("VERIFY");
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndCreate() {
    try {
      setErr("");
      setLoading(true);

      const res = await apiFetch<{ ok: true; token: string }>(`/api/auth/email/register/verify`, {
        method: "POST",
        body: JSON.stringify({
          username,
          email,
          password,
          role,
          code,
        }),
      });

      await loginWithToken(res.token);
      toast.success("Account created!");
      nav(next);;
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  function backToStart() {
    setStep("START");
    setCode("");
    setErr("");
  }

  const canSend = !!username.trim() && !!email.trim() && password.length >= 6;
  const canVerify = canSend && !!code.trim();

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Register</h1>
      <p className="text-gray-400 text-sm mt-1">
        Already have an account?{" "}
        <Link className="underline" to="/login">
          Login
        </Link>
      </p>

      {/* ===== OAuth quick register ===== */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="text-sm font-semibold text-white">Create account quickly</div>
        <p className="text-xs text-gray-400 mt-1">
          Continue with Google or GitHub. We’ll bring you back automatically.
        </p>
        <div className="mt-3">
          <OAuthButtons />
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-gray-800" />
          <div className="text-xs text-gray-500">or sign up with email</div>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* ===== Email OTP register (your original flow) ===== */}
        <div className="grid gap-3">
          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={loading || step === "VERIFY"}
          />

          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading || step === "VERIFY"}
          />

          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder="password (>= 6)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading || step === "VERIFY"}
          />

          <div className="flex gap-2 text-sm">
            <button
              className={`flex-1 rounded-xl border px-3 py-2 ${
                role === "user" ? "border-white text-white" : "border-gray-700 text-gray-300"
              }`}
              onClick={() => setRole("user")}
              type="button"
              disabled={loading || step === "VERIFY"}
            >
              Creator
            </button>

            <button
              className={`flex-1 rounded-xl border px-3 py-2 ${
                role === "company" ? "border-white text-white" : "border-gray-700 text-gray-300"
              }`}
              onClick={() => setRole("company")}
              type="button"
              disabled={loading || step === "VERIFY"}
            >
              Company
            </button>
          </div>

          {step === "VERIFY" && (
            <>
              <input
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 tracking-widest"
                placeholder="verification code (6 digits)"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
              />

              <div className="text-xs text-gray-500">
                Didn’t receive it? Check spam. You can go back to resend.
              </div>
            </>
          )}

          {step === "START" ? (
            <button
              onClick={sendCode}
              disabled={loading || !canSend}
              className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send verification code"}
            </button>
          ) : (
            <div className="grid gap-2">
              <button
                onClick={verifyAndCreate}
                disabled={loading || !canVerify}
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
              >
                {loading ? "Verifying..." : "Verify & create account"}
              </button>

              <button
                onClick={backToStart}
                disabled={loading}
                className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50"
                type="button"
              >
                Back (resend)
              </button>
            </div>
          )}

          {err && <p className="text-red-400 text-sm">Error: {err}</p>}

          <p className="text-xs text-gray-500 mt-1">
            By continuing, you agree to our basic usage and privacy terms.
          </p>
        </div>
      </div>
    </div>
  );
}
