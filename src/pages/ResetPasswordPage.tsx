import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { safeNext } from "../utils/safeNext";

type Step = "START" | "VERIFY";

export default function ResetPasswordPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const rawNext = new URLSearchParams(loc.search).get("next");
  const next = safeNext(rawNext);
  const { loginWithToken } = useAuth();

  const [step, setStep] = useState<Step>("START");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode() {
    try {
      setLoading(true);
      await apiFetch(`/api/auth/email/reset/start`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      toast.success("If the email exists, a reset code was sent.");
      setStep("VERIFY");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  async function verifyAndReset() {
    try {
      setLoading(true);
      const res = await apiFetch<{ ok: true; token: string }>(`/api/auth/email/reset/verify`, {
        method: "POST",
        body: JSON.stringify({ email, code, newPassword }),
      });

      await loginWithToken(res.token);
      toast.success("Password reset and logged in");
      nav(next, { replace: true });
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Reset Password</h1>
      <p className="text-gray-400 text-sm mt-1">Enter your email to receive a reset code.</p>

      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4 grid gap-3">
        <input
          className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || step === "VERIFY"}
        />

        {step === "VERIFY" && (
          <>
            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 tracking-widest"
              placeholder="verification code (6 digits)"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
            />

            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
              placeholder="new password (>=6)"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
            />
          </>
        )}

        {step === "START" ? (
          <button
            onClick={sendCode}
            disabled={loading || !email.trim()}
            className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send reset code"}
          </button>
        ) : (
          <div className="grid gap-2">
            <button
              onClick={verifyAndReset}
              disabled={loading || !code.trim() || newPassword.length < 6}
              className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
            >
              {loading ? "Resetting..." : "Reset password"}
            </button>

            <button
              onClick={() => setStep("START")}
              disabled={loading}
              className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50"
            >
              Back
            </button>
          </div>
        )}

        <div className="text-xs text-gray-500 mt-2">
          <Link to={`/login?next=${encodeURIComponent(next)}`} className="underline">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
