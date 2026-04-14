import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyComponents, updateMyComponents } from "../api";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

export default function TagRankSettingsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getMyComponents();
        if (!mounted) return;
        setEnabled(res.components.tagRank.enabled);
      } catch (e: any) {
        toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      const res = await updateMyComponents({
        tagRank: {
          enabled,
        },
      });
      setEnabled(res.components.tagRank.enabled);
      window.dispatchEvent(new CustomEvent("ideahub:components-updated"));
      toast.success(t("components.settingsSaved"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-4 text-gray-400">{t("common.loading")}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("components.tagRankSettingsTitle")}</h1>
          <p className="mt-2 text-gray-400">{t("components.tagRankSettingsSubtitle")}</p>
        </div>
        <Link to="/components" className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-900">
          {t("components.backToComponents")}
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
          <div>
            <p className="font-semibold text-white">{t("components.tagRankEnabledLabel")}</p>
            <p className="text-sm text-gray-400">{t("components.tagRankEnabledHint")}</p>
          </div>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
        </label>

        <div className="rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3 text-sm text-gray-300">
          <p>{t("components.tagRankSearchHint")}</p>
        </div>

        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="rounded-lg bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60">
            {saving ? t("common.loading") : t("common.save")}
          </button>
          <Link to="/components" className="rounded-lg border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900">
            {t("common.cancel")}
          </Link>
        </div>
      </div>
    </div>
  );
}