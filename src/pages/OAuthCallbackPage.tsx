// src/pages/OAuthCallbackPage.tsx

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";
import { safeNext } from "../utils/safeNext";

export default function OAuthCallbackPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { loginWithToken, refreshMe } = useAuth();

  const [err, setErr] = useState("");
  const [status, setStatus] = useState<"loading" | "error">("loading");

  const next = useMemo(() => safeNext(sp.get("next")), [sp]);

  function openAuth(mode: "login" | "register") {
    window.dispatchEvent(new CustomEvent("ideahub:auth:open", { detail: { mode, next } }));
  }

  useEffect(() => {
    (async () => {
      try {
        const token = sp.get("token");
        const error = sp.get("error");
        const message = sp.get("message");
        const linked = sp.get("linked");

        if (error) {
          const msg = error === "oauth_conflict"
            ? t('auth.oauthConflict')
            : (message ? `${error}: ${message}` : error);
          setErr(msg);
          setStatus("error");
          toast.error(msg);
          return;
        }

        if (linked) {
          if (token) {
            await loginWithToken(token);
          } else {
            await refreshMe();
          }
          toast.success(
            t('auth.oauthLinkedSuccess', {
              provider: linked === "google" ? t('auth.providerGoogle') : t('auth.providerGitHub'),
            })
          );
          nav(next, { replace: true });
          return;
        }

        if (!token) {
          const msg = t('auth.missingToken');
          setErr(msg);
          setStatus("error");
          toast.error(msg);
          return;
        }

        await loginWithToken(token);
        toast.success(t('auth.loggedIn'));
        nav(next, { replace: true });
      } catch (e: any) {
        const msg = humanizeError(e);
        setErr(msg);
        setStatus("error");
        toast.error(msg);
      }
    })();
  }, [sp, nav, loginWithToken, next, refreshMe, t]);

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">{t('auth.signingIn')}</h1>

      {status === "loading" && (
        <p className="text-gray-400 text-sm mt-2">
          {t('auth.completingOAuthLogin')}
        </p>
      )}

      {status === "error" && (
        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-red-400 text-sm">{t('common.error')}: {err}</p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950"
            >
              {t('auth.backToLogin')}
            </button>
            <button
              type="button"
              onClick={() => openAuth("register")}
              className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950"
            >
              {t('auth.registerTitle')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
