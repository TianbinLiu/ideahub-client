import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import toast from "react-hot-toast";

function getServerBase() {
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  return envBase && envBase.trim() ? envBase.trim().replace(/\/$/, "") : window.location.origin;
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" className="shrink-0">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.99 32.658 29.43 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.046 6.053 29.268 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.65-.389-3.917z"/>
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 16.108 19.01 12 24 12c3.059 0 5.842 1.154 7.957 3.043l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.004 6.306 14.691z"/>
      <path fill="#4CAF50" d="M24 44c5.327 0 10.2-2.047 13.851-5.381l-6.395-5.414C29.39 34.691 26.797 36 24 36c-5.409 0-9.957-3.319-11.279-7.946l-6.52 5.025C9.51 39.798 16.227 44 24 44z"/>
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.63 1.79-1.88 3.305-3.452 4.205l.003-.002 6.395 5.414C36.94 39.02 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" className="shrink-0" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.65 0 8.15c0 3.6 2.29 6.65 5.47 7.73.4.08.55-.18.55-.39 0-.19-.01-.82-.01-1.49-2.01.45-2.53-.5-2.69-.96-.09-.23-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.59 1.23.83.72 1.23 1.87.88 2.33.67.07-.53.28-.88.51-1.08-1.78-.2-3.64-.91-3.64-4.04 0-.89.31-1.62.82-2.19-.08-.2-.36-1.02.08-2.12 0 0 .67-.22 2.2.84.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.06 2.2-.84 2.2-.84.44 1.1.16 1.92.08 2.12.51.57.82 1.29.82 2.19 0 3.14-1.87 3.84-3.65 4.04.29.25.54.74.54 1.5 0 1.08-.01 1.95-.01 2.22 0 .21.15.47.55.39C13.71 14.8 16 11.75 16 8.15 16 3.65 12.42 0 8 0z"/>
    </svg>
  );
}

function OAuthBtn({
  provider,
  label,
  subLabel,
  path,
}: {
  provider: "google" | "github";
  label: string;
  subLabel?: string;
  path: string; // e.g. /api/auth/oauth/google
}) {
  const [loading, setLoading] = useState(false);
  const loc = useLocation();

  const next = useMemo(() => {
    const q = new URLSearchParams(loc.search);
    const fromQuery = q.get("next");
    // 优先 next=，否则用当前路径（比如用户从 /ideas/:id 打开登录页时希望回去）
    return fromQuery || loc.pathname || "/";
  }, [loc.pathname, loc.search]);

  async function go() {
    try {
      setLoading(true);

      const base = getServerBase();
      const url = new URL(`${base}${path}`);
      url.searchParams.set("next", next);

      toast.loading(`Redirecting to ${provider}...`, { id: `oauth-${provider}` });
      window.location.assign(url.toString());
    } catch (e: any) {
      toast.error(e?.message || "OAuth redirect failed");
      setLoading(false);
    }
  }

  const Icon = provider === "google" ? GoogleIcon : GitHubIcon;

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      className="w-full rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-2.5 hover:bg-gray-900 disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <Icon />
        <div className="flex-1 text-left">
          <div className="text-sm font-semibold text-gray-100">{label}</div>
          {subLabel && <div className="text-xs text-gray-400 mt-0.5">{subLabel}</div>}
        </div>
        <div className="text-xs text-gray-400">{loading ? "Opening..." : "→"}</div>
      </div>
    </button>
  );
}

export default function OAuthButtons() {
  return (
    <div className="grid gap-2">
      <OAuthBtn
        provider="google"
        label="Continue with Google"
        subLabel="Fast login • Email auto-verified"
        path="/api/auth/oauth/google"
      />
      <OAuthBtn
        provider="github"
        label="Continue with GitHub"
        subLabel="Developer-friendly • Uses your GitHub identity"
        path="/api/auth/oauth/github"
      />
    </div>
  );
}
