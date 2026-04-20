import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyComponents, updateMyComponents, uploadLive2dBundle } from "../api";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type SourceMode = "remote" | "uploaded";

export default function Live2DSettingsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [source, setSource] = useState<SourceMode>("remote");
  const [modelJsonUrl, setModelJsonUrl] = useState("");
  const [uploadedModelJsonUrl, setUploadedModelJsonUrl] = useState("");
  const [uploadedBundleName, setUploadedBundleName] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getMyComponents();
        if (!mounted) return;
        const live2d = res.components.live2d;
        setEnabled(live2d.enabled);
        setSource(live2d.source);
        setModelJsonUrl(live2d.modelJsonUrl);
        setUploadedModelJsonUrl(live2d.uploadedModelJsonUrl);
        setUploadedBundleName(live2d.uploadedBundleName);
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
        live2d: {
          enabled,
          source,
          modelJsonUrl,
        },
      });
      const live2d = res.components.live2d;
      setEnabled(live2d.enabled);
      setSource(live2d.source);
      setModelJsonUrl(live2d.modelJsonUrl);
      setUploadedModelJsonUrl(live2d.uploadedModelJsonUrl);
      setUploadedBundleName(live2d.uploadedBundleName);
      window.dispatchEvent(new CustomEvent("ideahub:components-updated"));
      toast.success(t("components.settingsSaved"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadLive2dBundle(file);
      setUploadedModelJsonUrl(res.uploadedModelJsonUrl);
      setUploadedBundleName(res.uploadedBundleName);
      setSource("uploaded");
      window.dispatchEvent(new CustomEvent("ideahub:components-updated"));
      toast.success(t("components.uploadSuccess"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto p-4 text-gray-400">{t("common.loading")}</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white">{t("components.live2dSettingsTitle")}</h1>
          <p className="mt-2 text-gray-400">{t("components.live2dSettingsSubtitle")}</p>
        </div>
        <Link to="/workshop#workshop-component-settings" className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-900">
          {t("components.backToComponents")}
        </Link>
      </div>

      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <label className="flex items-center justify-between gap-4 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
          <div>
            <p className="font-semibold text-white">{t("components.live2dEnabledLabel")}</p>
            <p className="text-sm text-gray-400">{t("components.live2dEnabledHint")}</p>
          </div>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5 accent-cyan-400" />
        </label>

        <div className="space-y-3">
          <p className="font-semibold text-white">{t("components.modelSource")}</p>
          <label className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
            <input type="radio" name="live2d-source" checked={source === "remote"} onChange={() => setSource("remote")} className="mt-1 accent-cyan-400" />
            <div>
              <p className="font-medium text-white">{t("components.remoteModel")}</p>
              <p className="text-sm text-gray-400">{t("components.remoteModelHint")}</p>
            </div>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3">
            <input type="radio" name="live2d-source" checked={source === "uploaded"} onChange={() => setSource("uploaded")} className="mt-1 accent-cyan-400" />
            <div>
              <p className="font-medium text-white">{t("components.uploadedModel")}</p>
              <p className="text-sm text-gray-400">{t("components.uploadedModelHint")}</p>
            </div>
          </label>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-300">{t("components.modelJsonUrl")}</label>
          <input
            value={modelJsonUrl}
            onChange={(e) => setModelJsonUrl(e.target.value)}
            disabled={source !== "remote"}
            placeholder="https://example.com/Hiyori.model3.json"
            className="w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-white disabled:opacity-50"
          />
          <p className="text-xs text-gray-500">{t("components.modelJsonUrlHint")}</p>
        </div>

        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-300">{t("components.uploadBundle")}</label>
          <input
            type="file"
            accept=".zip,application/zip"
            disabled={uploading}
            onChange={(e) => {
              void handleUpload(e.target.files?.[0] || null);
              e.currentTarget.value = "";
            }}
            className="block w-full text-sm text-gray-300 file:mr-4 file:rounded-lg file:border-0 file:bg-cyan-400 file:px-4 file:py-2 file:font-semibold file:text-black hover:file:bg-cyan-300"
          />
          <p className="text-xs text-gray-500">{t("components.uploadBundleHint")}</p>
          {uploading && <p className="text-sm text-gray-400">{t("components.uploadingBundle")}</p>}
          {uploadedModelJsonUrl && (
            <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 text-sm text-gray-300">
              <p>{t("components.currentUploadedBundle")}: <span className="text-white">{uploadedBundleName || t("components.unnamedBundle")}</span></p>
              <p className="mt-1 break-all text-xs text-gray-500">{uploadedModelJsonUrl}</p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button onClick={save} disabled={saving} className="rounded-lg bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60">
            {saving ? t("common.loading") : t("common.save")}
          </button>
          <Link to="/workshop#workshop-component-settings" className="rounded-lg border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900">
            {t("common.cancel")}
          </Link>
        </div>
      </div>
    </div>
  );
}