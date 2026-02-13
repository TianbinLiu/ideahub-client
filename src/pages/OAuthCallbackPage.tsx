// src/pages/OAuthCallbackPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";

function safeNext(next: string | null) {
  // 只允许站内路径，避免 open redirect
  if (!next) return "/";
  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";
  return next;
}

export default function OAuthCallbackPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const { loginWithToken } = useAuth();

  const [err, setErr] = useState("");
  const [status, setStatus] = useState<"loading" | "error">("loading");

  const next = useMemo(() => safeNext(sp.get("next")), [sp]);

  useEffect(() => {
    (async () => {
      try {
        const token = sp.get("token");
        const error = sp.get("error");
        const message = sp.get("message");

        if (error) {
          const msg = message ? `${error}: ${message}` : error;
          setErr(msg);
          setStatus("error");
          toast.error(msg);
          return;
        }

        if (!token) {
          const msg = "Missing token in callback URL.";
          setErr(msg);
          setStatus("error");
          toast.error(msg);
          return;
        }

        await loginWithToken(token);
        toast.success("Logged in!");
        nav(next, { replace: true });
      } catch (e: any) {
        const msg = humanizeError(e);
        setErr(msg);
        setStatus("error");
        toast.error(msg);
      }
    })();
  }, [sp, nav, loginWithToken, next]);

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Signing you in...</h1>

      {status === "loading" && (
        <p className="text-gray-400 text-sm mt-2">
          Completing OAuth login. Please wait.
        </p>
      )}

      {status === "error" && (
        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-red-400 text-sm">Error: {err}</p>
          <div className="mt-3 flex gap-2">
            <Link
              to={`/login?next=${encodeURIComponent(next)}`}
              className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950"
            >
              Back to Login
            </Link>
            <Link
              to="/register"
              className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950"
            >
              Register
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
