import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ExternalSource } from "../api";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { saveLocalIdea } from "../utils/localIdeas";
import { MentionTextarea } from "../components/MentionTextarea";
import { CharCount } from "../components/CharCount";
import { PLATFORMS, detectPlatformFromUrl, getPlatformByName } from "../utils/platformConfig";

const LIMITS = {
  TITLE: 150,
  SUMMARY: 500,
  CONTENT: 10000,
  TAGS: 200,
};

export default function NewIdeaPage() {
  const nav = useNavigate();
  const { mode } = useParams();
  const { t } = useTranslation();

  const creationMode = useMemo(() => {
    if (mode === "business" || mode === "feedback" || mode === "external" || mode === "daily") {
      return mode;
    }
    return null;
  }, [mode]);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("demo,phase4");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [, setIsMonetizable] = useState(false);
  const [licenseType, setLicenseType] = useState("default");
  const [requestAI, setRequestAI] = useState(false);
  const [, setIsFeedback] = useState(false);

  // External source fields
  const [externalPlatform, setExternalPlatform] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalOriginalAuthor, setExternalOriginalAuthor] = useState("");
  const [autoFetching, setAutoFetching] = useState(false);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const isBusinessMode = creationMode === "business";
  const isFeedbackMode = creationMode === "feedback";
  const isExternalMode = creationMode === "external";
  const isDailyMode = creationMode === "daily";
  const showTagsInput = !isFeedbackMode;
  const externalEnabled = isExternalMode;
  const fixedFeedbackTag = "反馈bug/网站建议";

  const modeBadgeClass = isBusinessMode
    ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
    : isFeedbackMode
      ? "border-sky-400/70 bg-sky-500/20 text-sky-100"
      : isExternalMode
        ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100"
        : "border-amber-400/70 bg-amber-500/20 text-amber-100";

  useEffect(() => {
    if (!creationMode) {
      nav("/ideas/new", { replace: true });
      return;
    }

    if (isBusinessMode) {
      setIsMonetizable(false);
      setIsFeedback(false);
      return;
    }

    if (isFeedbackMode) {
      setIsMonetizable(false);
      setRequestAI(false);
      setIsFeedback(true);
      return;
    }

    if (isExternalMode) {
      setIsMonetizable(false);
      setRequestAI(false);
      setIsFeedback(false);
      return;
    }

    if (isDailyMode) {
      setIsMonetizable(false);
      setRequestAI(false);
      setIsFeedback(false);
    }
  }, [creationMode, isBusinessMode, isDailyMode, isExternalMode, isFeedbackMode, nav]);

  function isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  // Auto-detect platform from URL
  function handleUrlChange(url: string) {
    setExternalUrl(url);
    
    if (url && isValidUrl(url)) {
      const detected = detectPlatformFromUrl(url);
      if (detected && !externalPlatform) {
        setExternalPlatform(detected.name);
        toast.success(t('idea.platformDetected', { platform: detected.name }));
      }
    }
  }

  // Try to auto-fetch title from URL (using backend API)
  async function tryAutoFetch() {
    if (!externalUrl || !isValidUrl(externalUrl)) {
      toast.error(t('idea.externalSourceUrlInvalid'));
      return;
    }

    setAutoFetching(true);
    try {
      const result = await apiFetch<{
        ok: boolean;
        success: boolean;
        title: string;
        content: string;
        author: string;
        error?: string;
        message: string;
      }>('/api/scraper/fetch', {
        method: 'POST',
        body: JSON.stringify({ url: externalUrl }),
      });

      if (result.success) {
        // Successfully fetched content
        if (result.title && !title) {
          setTitle(result.title);
        }
        if (result.content && !content) {
          setContent(result.content);
        }
        if (result.author && !externalOriginalAuthor) {
          setExternalOriginalAuthor(result.author);
        }
        toast.success(t('idea.autoFetchSuccess'));
      } else {
        // Failed to fetch - show user-friendly message
        toast.error(result.error || result.message || t('idea.autoFetchFailed'), {
          duration: 6000,
        });
      }
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(t('idea.autoFetchFailed') + ': ' + msg);
    } finally {
      setAutoFetching(false);
    }
  }

  async function submit() {
    try {
      setErr("");
      setLoading(true);

      // Validate external source if enabled
      if (externalEnabled) {
        if (!externalPlatform.trim()) {
          throw new Error(t('idea.externalSourcePlatformRequired'));
        }
        if (!externalUrl.trim()) {
          throw new Error(t('idea.externalSourceUrlRequired'));
        }
        if (!isValidUrl(externalUrl)) {
          throw new Error(t('idea.externalSourceUrlInvalid'));
        }
      }

      if (visibility === "private") {
        const local = saveLocalIdea({ title, summary, content, tags: tags.split(",").map((s) => s.trim()).filter(Boolean) });
        toast.success(t('idea.savedLocally'));
        nav(`/ideas/${local._id}`);
        return;
      }

      // Build externalSource object if enabled
      const externalSource: ExternalSource | undefined = externalEnabled
        ? {
            platform: externalPlatform.trim(),
            url: externalUrl.trim(),
            originalAuthor: externalOriginalAuthor.trim() || undefined,
          }
        : undefined;

      const submitTags = isFeedbackMode ? fixedFeedbackTag : tags;
      const submitIsFeedback = isFeedbackMode ? true : false;
      const submitRequestAI = isBusinessMode ? requestAI : false;

      const res = await apiFetch<{ idea: { _id: string } }>(`/api/ideas`, {
        method: "POST",
        body: JSON.stringify({
          title,
          summary,
          content,
          tags: submitTags,
          visibility,
          isMonetizable: false,
          licenseType,
          isFeedback: submitIsFeedback,
          externalSource,
        }),
      });

      const ideaId = res.idea._id;

      if (submitRequestAI) {
        const r = await apiFetch<{ ok: true; jobId: string; status: string }>(`/api/ideas/${ideaId}/ai-review`, { method: "POST" });
        toast.success(t('idea.aiReviewQueued'));
        nav(`/ideas/${ideaId}?aiJob=${r.jobId}`);
        return;
      }
      nav(`/ideas/${ideaId}`);
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg); // 可选：保留页面内红字
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="rounded-2xl border border-purple-700/60 bg-gradient-to-r from-purple-950/80 to-indigo-950/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-purple-300/90">{t('idea.currentMode')}</p>
            <span className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${modeBadgeClass}`}>
              {creationMode ? t(`idea.createMode${creationMode.charAt(0).toUpperCase()}${creationMode.slice(1)}Title`) : ''}
            </span>
          </div>
          <Link
            to="/ideas/new"
            className="inline-flex items-center rounded-lg border border-purple-500/70 bg-purple-900/40 px-3 py-1.5 text-xs font-semibold text-purple-100 hover:bg-purple-900/60"
          >
            {t('idea.switchMode')}
          </Link>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-white">{t('idea.createTitle')}</h1>
      <p className="text-gray-400 text-sm mt-1">{t('idea.createSubtitle')}</p>

      <div className="mt-6 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
            placeholder={t('idea.title')} 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            maxLength={LIMITS.TITLE} />
          <CharCount current={title.length} max={LIMITS.TITLE} className="mt-1" />
        </div>

        <div>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
            placeholder={t('idea.summary')} 
            value={summary} 
            onChange={(e) => setSummary(e.target.value)}
            maxLength={LIMITS.SUMMARY} />
          <CharCount current={summary.length} max={LIMITS.SUMMARY} className="mt-1" />
        </div>

        <div>
          <MentionTextarea
            value={content}
            onChange={setContent}
            placeholder={t('idea.contentPlaceholder')}
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[220px] w-full text-gray-200"
            maxLength={LIMITS.CONTENT}
          />
          <CharCount current={content.length} max={LIMITS.CONTENT} className="mt-1" />
        </div>

        {showTagsInput && (
        <div>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
            placeholder={t('idea.tagsPlaceholder')} 
            value={tags} 
            onChange={(e) => setTags(e.target.value)}
            maxLength={LIMITS.TAGS} />
          <CharCount current={tags.length} max={LIMITS.TAGS} className="mt-1" />
        </div>
        )}

        {isFeedbackMode && (
          <div className="rounded-xl border border-blue-800 bg-blue-950/30 p-3 text-sm text-blue-100">
            {t('idea.feedbackFixedTagLabel')}: <span className="font-semibold">{fixedFeedbackTag}</span>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-2">
          <select className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
            <option value="public">{t('idea.public')}</option>
            <option value="unlisted">{t('idea.unlisted')}</option>
            <option value="private">{t('idea.private')}</option>
          </select>
          <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            placeholder={t('idea.licenseType')} value={licenseType} onChange={(e) => setLicenseType(e.target.value)} />
          {isBusinessMode && (
            <label className="flex items-center gap-2 text-sm text-gray-300 px-2">
              <input
                type="checkbox"
                checked={requestAI}
                onChange={(e) => setRequestAI(e.target.checked)}
              />
              {t('idea.requestAI')}
            </label>
          )}
        </div>

        {isFeedbackMode && (
          <div className="bg-blue-900/20 border border-blue-800 rounded-xl p-3 text-sm text-blue-200">
            <p>{t('idea.feedbackDescription')}</p>
          </div>
        )}

        {externalEnabled && (
          <div className="bg-purple-900/20 border border-purple-800 rounded-xl p-4 grid gap-3">
            <div>
              <label className="block text-sm text-gray-300 mb-2">
                {t('idea.externalSourceUrl')} *
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  className="flex-1 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-gray-200 focus:outline-none focus:border-purple-600"
                  placeholder={getPlatformByName(externalPlatform)?.placeholder || t('idea.externalSourceUrlPlaceholder')}
                  value={externalUrl}
                  onChange={(e) => handleUrlChange(e.target.value)}
                />
                <button
                  type="button"
                  onClick={tryAutoFetch}
                  disabled={!externalUrl || autoFetching}
                  className="rounded-xl bg-purple-700 hover:bg-purple-600 text-white px-4 py-2 text-sm disabled:opacity-50 whitespace-nowrap"
                >
                  {autoFetching ? t('idea.fetching') : t('idea.autoFetch')}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">{t('idea.externalSourceUrlHint')}</p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">{t('idea.externalSourcePlatform')} *</label>
              <select
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full text-gray-200 focus:outline-none focus:border-purple-600"
                value={externalPlatform}
                onChange={(e) => setExternalPlatform(e.target.value)}
              >
                <option value="">{t('idea.selectPlatform')}</option>
                {PLATFORMS.map((platform) => (
                  <option key={platform.name} value={platform.name}>
                    {platform.icon} {platform.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">{t('idea.externalSourcePlatformHint')}</p>
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">{t('idea.externalSourceAuthor')}</label>
              <input
                type="text"
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full text-gray-200 focus:outline-none focus:border-purple-600"
                placeholder={t('idea.externalSourceAuthorPlaceholder')}
                value={externalOriginalAuthor}
                onChange={(e) => setExternalOriginalAuthor(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">{t('idea.externalSourceAuthorHint')}</p>
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !title.trim()}
          className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
        >
          {loading ? t('idea.saving') : t('idea.createButton')}
        </button>

        {err && <p className="text-red-400 text-sm">{t('errors.error')}: {err}</p>}
      </div>
    </div>
  );
}
