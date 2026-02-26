// src/pages/RegisterPage.tsx

import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import OAuthButtons from "../components/OAuthButtons";
import { useLocation } from "react-router-dom";
import { safeNext } from "../utils/safeNext";
import { CharCount } from "../components/CharCount";

const LIMITS = {
  USERNAME: 50,
  EMAIL: 100,
};

type Step = "START" | "VERIFY";

export default function RegisterPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const rawNext = new URLSearchParams(loc.search).get("next");
  const next = safeNext(rawNext);
  const { loginWithToken } = useAuth();

  const [step, setStep] = useState<Step>("START");

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "company">("user");

  const [code, setCode] = useState("");
  const DEFAULT_COOLDOWN = Number((import.meta as any).env?.VITE_OTP_RESEND_COOLDOWN_SECONDS) || 60;
  const [cooldown, setCooldown] = useState(0);
  const timerRef = useRef<number | null>(null);

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

      toast.success(t('auth.verificationSent'));
      setStep("VERIFY");
      setCooldown(DEFAULT_COOLDOWN);
    } catch (e: any) {
      // If server tells retryAfter, use it to set cooldown
      if (e?.code === "OTP_RESEND_COOLDOWN" && e?.details?.retryAfter) {
        setCooldown(Number(e.details.retryAfter) || DEFAULT_COOLDOWN);
      }
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
      nav(next, { replace: true });
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  // Removed unused backToStart helper (was causing TS6133).

  const canSend = !!username.trim() && !!email.trim() && password.length >= 6;
  const canVerify = canSend && !!code.trim();

  // cooldown timer for resend
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
      <h1 className="text-2xl font-bold text-white">{t('auth.registerTitle')}</h1>
      <p className="text-gray-400 text-sm mt-1">
        {t('auth.haveAccount')}{" "}
        <Link className="underline" to={`/login?next=${encodeURIComponent(next)}`}>
          {t('auth.loginButton')}
        </Link>
      </p>

      {/* ===== OAuth quick register ===== */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="text-sm font-semibold text-white">{t('auth.createAccountQuickly')}</div>
        <p className="text-xs text-gray-400 mt-1">
          {t('auth.oauthRegisterDescription')}
        </p>
        <div className="mt-3">
          <OAuthButtons />
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-gray-800" />
          <div className="text-xs text-gray-500">{t('auth.orSignUpWith')}</div>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* ===== Email OTP register (your original flow) ===== */}
        <div className="grid gap-3">
          <div>
            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
              placeholder={t('auth.username')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading || step === "VERIFY"}
              maxLength={LIMITS.USERNAME}
            />
            <CharCount current={username.length} max={LIMITS.USERNAME} className="mt-1" />
          </div>

          <div>
            <input
              className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading || step === "VERIFY"}
              maxLength={LIMITS.EMAIL}
            />
            <CharCount current={email.length} max={LIMITS.EMAIL} className="mt-1" />
          </div>

          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder={t('auth.passwordHint')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading || step === "VERIFY"}
          />

          <div className="flex gap-2 text-sm">
            <button
              className={`flex-1 rounded-xl border px-3 py-2 ${role === "user" ? "border-white text-white" : "border-gray-700 text-gray-300"
                }`}
              onClick={() => setRole("user")}
              type="button"
              disabled={loading || step === "VERIFY"}
            >
              {t('auth.creator')}
            </button>

            <button
              className={`flex-1 rounded-xl border px-3 py-2 ${role === "company" ? "border-white text-white" : "border-gray-700 text-gray-300"
                }`}
              onClick={() => setRole("company")}
              type="button"
              disabled={loading || step === "VERIFY"}
            >
              {t('auth.company')}
            </button>
          </div>

          {step === "VERIFY" && (
            <>
              <input
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 tracking-widest"
                placeholder={t('auth.verificationCodePlaceholder')}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={loading}
              />

              <div className="text-xs text-gray-500">{t('auth.didntReceive')}</div>

              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={sendCode}
                  disabled={loading || cooldown > 0}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-gray-200 hover:bg-gray-950 disabled:opacity-50 flex items-center gap-2"
                >
                  {cooldown > 0 ? t('auth.resendCodeWait', { seconds: cooldown }) : t('auth.resendCode')}
                </button>

                <div className="text-gray-400 text-xs">
                  {cooldown > 0 ? t('auth.waitBeforeResend', { seconds: cooldown }) : t('auth.canResendCode')}
                </div>
              </div>
            </>
          )}

          {step === "START" ? (
            <button
              onClick={sendCode}
              disabled={loading || !canSend}
              className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-black" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity="0.2" />
                    <path d="M22 12a10 10 0 00-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
                  </svg>
                  {t('auth.sendingCode')}
                </>
              ) : (
                t('auth.sendVerificationCode')
              )}
            </button>
          ) : (
            <div className="grid gap-2">
              <button
                onClick={verifyAndCreate}
                disabled={loading || !canVerify}
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
              >
                {loading ? t('auth.verifying') : t('auth.verifyAndCreate')}
              </button>

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
            </div>
          )}

          {err && <p className="text-red-400 text-sm">{t('common.error')}: {err}</p>}

          <p className="text-xs text-gray-500 mt-1">
            {t('auth.agreeTerms')}
          </p>
        </div>
      </div>
    </div>
  );
}
