import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { getMyComponents } from "../api";
import { useAuth } from "../authContext";

type AccessStatus = "checking" | "enabled" | "disabled";

export default function TagRankAccessGate({ children }: { children: React.ReactNode }) {
  const nav = useNavigate();
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<AccessStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    async function verifyAccess() {
      if (authLoading) {
        return;
      }

      if (!user) {
        setStatus("disabled");
        return;
      }

      try {
        setStatus("checking");
        const res = await getMyComponents();
        if (!cancelled) {
          setStatus(res.components.tagRank.enabled ? "enabled" : "disabled");
        }
      } catch {
        if (!cancelled) {
          setStatus("disabled");
        }
      }
    }

    void verifyAccess();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user]);

  if (authLoading || status === "checking") {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 text-gray-300">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (status === "enabled") {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="rounded-3xl border border-amber-700/50 bg-gray-900 p-6 shadow-[0_18px_80px_rgba(0,0,0,0.35)]">
        <div className="inline-flex rounded-full border border-amber-600/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-amber-200">
          {t("components.tagRankAccessBadge")}
        </div>
        <h1 className="mt-4 text-2xl font-bold text-white">
          {t("components.tagRankAccessTitle")}
        </h1>
        <p className="mt-3 text-sm leading-6 text-gray-300">
          {t("components.tagRankAccessDescription")}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => nav("/components/tag-rank")}
            className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
          >
            {t("components.tagRankAccessAction")}
          </button>
          <button
            type="button"
            onClick={() => nav("/")}
            className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-950"
          >
            {t("components.tagRankAccessBackHome")}
          </button>
        </div>
      </div>
    </div>
  );
}