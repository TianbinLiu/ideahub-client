import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { safeNext } from "../utils/safeNext";

type Step = "START" | "VERIFY";

export default function ResetPasswordPage() {
  const { t } = useTranslation();
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
  const DEFAULT_COOLDOWN = Number((import.meta as any).env?.VITE_OTP_RESEND_COOLDOWN_SECONDS) || 60;
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<number | null>(null);

  async function sendCode() {
    try {
      setLoading(true);
      await apiFetch(`/api/auth/email/reset/start`, {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      toast.success(t('auth.resetCodeSent'));
      setStep("VERIFY");
      setCooldown(DEFAULT_COOLDOWN);
    } catch (e: any) {
      // if server returned OTP_RESEND_COOLDOWN with retryAfter, use it
      if (e?.code === "OTP_RESEND_COOLDOWN" && e?.details?.retryAfter) {
        setCooldown(Number(e.details.retryAfter) || DEFAULT_COOLDOWN);
      }
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
      toast.success(t('auth.resetSuccess'));
      nav(next, { replace: true });
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  // cooldown timer
  useEffect(() => {
    if (cooldown <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cooldown]);

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">{t('auth.resetPassword')}</h1>
      <p className="text-gray-400 text-sm mt-1">{t('auth.resetPasswordDescription')}</p>

      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4 grid gap-3">
        <input
          className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading || step === "VERIFY"}
        />

        {step === "VERIFY" && (
          <>
            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 tracking-widest"
              placeholder={t('auth.verificationCodePlaceholder')}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
            />

            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
              placeholder={t('auth.newPassword')}
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
            className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
            aria-busy={loading}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2" />
                  <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                </svg>
                {t('auth.sending')}
              </>
            ) : (
              t('auth.sendResetCode')
            )}
          </button>
        ) : (
          <div className="grid gap-2">
            <div className="flex gap-2">
              <button
                onClick={verifyAndReset}
                disabled={loading || !code.trim() || newPassword.length < 6}
                className="flex-1 rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2" />
                      <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                    </svg>
                    {t('auth.resetting')}
                  </>
                ) : (
                  t('auth.resetPasswordButton')
                )}
              </button>

              <button
                onClick={() => setStep("START")}
                disabled={loading}
                className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50"
              >
                {t('common.back')}
              </button>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={sendCode}
                disabled={loading || cooldown > 0}
                className="rounded-xl border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50 flex items-center gap-2"
                aria-busy={loading}
              >
                {loading && cooldown === 0 ? (
                  <svg className="animate-spin h-4 w-4 text-gray-200" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2" />
                    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                ) : null}
                {cooldown > 0 ? t('auth.resendCodeWait', { seconds: cooldown }) : t('auth.resendCode')}
              </button>

              <div className="text-gray-400 text-xs">
                {cooldown > 0
                  ? humanizeError({ code: "OTP_RESEND_COOLDOWN", details: { retryAfter: cooldown } })
                  : t('auth.canResendCode')}
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 mt-2">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("ideahub:auth:open", { detail: { mode: "login", next } }))}
            className="underline"
          >
            {t('auth.backToLogin')}
          </button>
        </div>
      </div>
    </div>
  );
}
