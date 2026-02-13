import { useState } from "react";
import toast from "react-hot-toast";

function getServerBase() {
  // 你项目里 API_BASE 可能是 ""（同域）或 https://xxx.onrender.com
  const envBase = (import.meta as any).env?.VITE_API_BASE as string | undefined;
  return envBase && envBase.trim() ? envBase.trim().replace(/\/$/, "") : window.location.origin;
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

  async function go() {
    try {
      setLoading(true);

      // 这里不 apiFetch，因为 OAuth 是浏览器跳转，不是 fetch
      const base = getServerBase();
      const url = `${base}${path}`;

      // 小提示：告诉用户要跳转
      toast.loading(`Redirecting to ${provider}...`, { id: `oauth-${provider}` });

      // 直接跳转
      window.location.assign(url);
    } catch (e: any) {
      toast.error(e?.message || "OAuth redirect failed");
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      className="w-full rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-2.5 hover:bg-gray-900 disabled:opacity-50"
    >
      <div className="flex items-center justify-between">
        <div className="text-left">
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
