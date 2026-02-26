// src/pages/LoginPage.tsx

import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import OAuthButtons from "../components/OAuthButtons";
import { safeNext } from "../utils/safeNext";

export default function LoginPage() {
  const { t } = useTranslation();
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
  const rawNext = qNext || sNext || "/";
  const next = safeNext(rawNext);

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
      nav(next, { replace: true });
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
      <h1 className="text-2xl font-bold text-white">{t('auth.loginTitle')}</h1>
      <p className="text-gray-400 text-sm mt-1">
        {t('auth.noAccount')}{" "}
        <Link className="underline" to={`/register?next=${encodeURIComponent(next)}`}>
          {t('auth.createAccount')}
        </Link>
      </p>

      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        {/* ===== OAuth quick login ===== */}
        <div className="text-sm font-semibold text-white">{t('auth.signInQuickly')}</div>
        <p className="text-xs text-gray-400 mt-1">
          {t('auth.oauthDescription')}
        </p>

        <div className="mt-3">
          <OAuthButtons />
        </div>

        <div className="flex items-center gap-3 my-4">
          <div className="h-px flex-1 bg-gray-800" />
          <div className="text-xs text-gray-500">{t('auth.orLoginWith')}</div>
          <div className="h-px flex-1 bg-gray-800" />
        </div>

        {/* ===== password login ===== */}
        <div className="grid gap-3">
          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder={t('auth.emailOrUsername')}
            value={emailOrUsername}
            onChange={(e) => setEmailOrUsername(e.target.value)}
            disabled={loading}
            autoComplete="username"
          />

          <input
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder={t('auth.password')}
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
            {loading ? t('auth.loggingIn') : t('auth.loginButton')}
          </button>

          {/* 预留：忘记密码入口（你后面做邮箱 OTP reset 可以直接接这里） */}
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">{t('auth.oauthHint')}</span>
            <Link
              to={`/reset?next=${encodeURIComponent(next)}`}
              className="text-gray-300 hover:text-white underline decoration-gray-700"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>

          {err && <p className="text-red-400 text-sm">{t('common.error')}: {err}</p>}
        </div>
      </div>
    </div>
  );
}
