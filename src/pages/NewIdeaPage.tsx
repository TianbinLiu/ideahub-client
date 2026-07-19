import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ExternalSource, Group } from "../api";
import { apiFetch, apiUploadImage, generateIdeaDraft, listGroups } from "../api";
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

const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp";
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export default function NewIdeaPage() {
  const nav = useNavigate();
  const { mode } = useParams();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();

  const creationMode = useMemo(() => {
    if (mode === "business" || mode === "feedback" || mode === "external" || mode === "daily" || mode === "dynamic") {
      return mode;
    }
    return null;
  }, [mode]);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverUploadedByUser, setCoverUploadedByUser] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [, setIsMonetizable] = useState(false);
  const [requestAI, setRequestAI] = useState(false);
  const [, setIsFeedback] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);

  // External source fields
  const [externalPlatform, setExternalPlatform] = useState("");
  const [customExternalPlatform, setCustomExternalPlatform] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalOriginalAuthor, setExternalOriginalAuthor] = useState("");
  const [autoFetching, setAutoFetching] = useState(false);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]);
  const [groupSlug, setGroupSlug] = useState(() => searchParams.get("group") || "world");

  const isBusinessMode = creationMode === "business";
  const isFeedbackMode = creationMode === "feedback";
  const isExternalMode = creationMode === "external";
  const isDailyMode = creationMode === "daily";
  const isDynamicMode = creationMode === "dynamic";
  const showTagsInput = !isFeedbackMode;
  const externalEnabled = isExternalMode;
  const fixedFeedbackTag = "反馈bug/网站建议";
  const OTHER_PLATFORM_VALUE = "__other__";

  const modeBadgeClass = isBusinessMode
    ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-100"
    : isFeedbackMode
      ? "border-sky-400/70 bg-sky-500/20 text-sky-100"
      : isExternalMode
        ? "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100"
        : isDailyMode
          ? "border-amber-400/70 bg-amber-500/20 text-amber-100"
          : "border-cyan-400/70 bg-cyan-500/20 text-cyan-100";

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

    if (isDailyMode || isDynamicMode) {
      setIsMonetizable(false);
      setRequestAI(false);
      setIsFeedback(false);
    }
  }, [creationMode, isBusinessMode, isDailyMode, isDynamicMode, isExternalMode, isFeedbackMode, nav]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await listGroups();
        if (!mounted) return;
        const joinedGroups = (res.groups || []).filter((group) => group.isWorld || group.joined);
        setAvailableGroups(joinedGroups);
        if (!joinedGroups.some((group) => group.slug === groupSlug)) {
          setGroupSlug("world");
        }
      } catch {
        if (!mounted) return;
        setAvailableGroups([{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }]);
        setGroupSlug("world");
      }
    })();

    return () => {
      mounted = false;
    };
  }, [groupSlug]);

  function isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  function isVideoPlatformVideoUrl(url: string): boolean {
    try {
      const u = new URL(url);
      const host = u.hostname.toLowerCase();
      const path = u.pathname.toLowerCase();
      if ((host.includes("bilibili.com") || host.includes("b23.tv")) && path.includes("/video/")) return true;
      if ((host.includes("youtube.com") && (path === "/watch" || path.startsWith("/shorts/") || path.startsWith("/live/"))) || host.includes("youtu.be")) return true;
      if (host.includes("tiktok.com") && path.includes("/video/")) return true;
      if (host.includes("vimeo.com")) return true;
      return false;
    } catch {
      return false;
    }
  }

  function toHttpsUrl(raw?: string): string {
    const val = String(raw || "").trim();
    if (!val) return "";
    if (/^http:\/\//i.test(val)) return val.replace(/^http:\/\//i, "https://");
    if (val.startsWith("//")) return `https:${val}`;
    return val;
  }

  function splitTags(input: string): string[] {
    return input
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function mergeTags(base: string, extra?: string): string {
    const list = splitTags(base);
    const cleaned = list.filter((tag) => tag !== "其他");
    if (extra) cleaned.push(extra.trim());
    return Array.from(new Set(cleaned)).join(",");
  }

  function applyFetchedPlatformName(rawName?: string) {
    const name = String(rawName || "").trim();
    if (!name) return;

    const matched = PLATFORMS.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (matched && matched.name !== "其他") {
      setExternalPlatform(matched.name);
      setCustomExternalPlatform("");
      return;
    }

    // If the fetched platform is not in dropdown options, switch to Other and prefill custom name.
    setExternalPlatform(OTHER_PLATFORM_VALUE);
    setCustomExternalPlatform(name);
  }

  async function handleIdeaImageUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingImages(true);
    try {
      const selected = Array.from(files).slice(0, 4);
      const urls: string[] = [];
      for (const file of selected) {
        if (!file.type.startsWith("image/")) {
          throw new Error("Only image files are allowed");
        }
        if (file.size > IMAGE_MAX_BYTES) {
          throw new Error("Image size must be <= 5MB");
        }
        const uploaded = await apiUploadImage(file, "idea");
        urls.push(uploaded.imageUrl);
      }
      setImageUrls((prev) => [...prev, ...urls].slice(0, 8));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleCoverImageUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploadingCover(true);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("Only image files are allowed");
      }
      if (file.size > IMAGE_MAX_BYTES) {
        throw new Error("Image size must be <= 5MB");
      }
      const uploaded = await apiUploadImage(file, "idea");
      setCoverImageUrl(uploaded.imageUrl);
      setCoverUploadedByUser(true);
      toast.success(t('idea.coverUploaded'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUploadingCover(false);
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
        platform?: string;
        coverImageUrl?: string;
        tags?: string[];
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
        applyFetchedPlatformName(result.platform);
        if (result.coverImageUrl && !coverImageUrl && !coverUploadedByUser && isVideoPlatformVideoUrl(externalUrl)) {
          try {
            const imported = await apiFetch<{ ok: boolean; imageUrl: string }>("/api/scraper/import-cover", {
              method: "POST",
              body: JSON.stringify({ url: toHttpsUrl(result.coverImageUrl) }),
            });
            if (imported?.imageUrl) setCoverImageUrl(imported.imageUrl);
          } catch {
            setCoverImageUrl(toHttpsUrl(result.coverImageUrl));
          }
        }
        if (result.tags && Array.isArray(result.tags) && result.tags.length > 0 && !tags.trim()) {
          setTags(result.tags.join(", "));
        }
        toast.success(t('idea.autoFetchSuccess'));
      } else {
        // Partial fallback: if backend returns anything useful, prefill it.
        if (result.title && !title) {
          setTitle(result.title);
        }
        if (result.content && !content) {
          setContent(result.content);
        }
        if (result.author && !externalOriginalAuthor) {
          setExternalOriginalAuthor(result.author);
        }
        applyFetchedPlatformName(result.platform);
        if (result.coverImageUrl && !coverImageUrl && !coverUploadedByUser && isVideoPlatformVideoUrl(externalUrl)) {
          try {
            const imported = await apiFetch<{ ok: boolean; imageUrl: string }>("/api/scraper/import-cover", {
              method: "POST",
              body: JSON.stringify({ url: toHttpsUrl(result.coverImageUrl) }),
            });
            if (imported?.imageUrl) setCoverImageUrl(imported.imageUrl);
          } catch {
            setCoverImageUrl(toHttpsUrl(result.coverImageUrl));
          }
        }
        if (result.tags && Array.isArray(result.tags) && result.tags.length > 0 && !tags.trim()) {
          setTags(result.tags.join(", "));
        }

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

      const ideaType = creationMode || "daily";

      const isOtherPlatform = externalPlatform.trim() === OTHER_PLATFORM_VALUE;
      const effectiveExternalPlatform = isOtherPlatform
        ? customExternalPlatform.trim()
        : externalPlatform.trim();

      // Validate external source if enabled
      if (externalEnabled) {
        if (!externalPlatform.trim()) {
          throw new Error(t('idea.externalSourcePlatformRequired'));
        }
        if (isOtherPlatform && !effectiveExternalPlatform) {
          throw new Error(t('idea.externalSourceCustomPlatformRequired'));
        }
        if (!externalUrl.trim()) {
          throw new Error(t('idea.externalSourceUrlRequired'));
        }
        if (!isValidUrl(externalUrl)) {
          throw new Error(t('idea.externalSourceUrlInvalid'));
        }
      }

      const submitTagsBase = isFeedbackMode ? mergeTags(fixedFeedbackTag, tags) : tags;
      const submitTags = externalEnabled
        ? mergeTags(submitTagsBase, effectiveExternalPlatform)
        : submitTagsBase;

      if (visibility === "private") {
        const local = saveLocalIdea({ title, summary, content, imageUrls, tags: splitTags(submitTags) });
        toast.success(t('idea.savedLocally'));
        nav(`/ideas/${local._id}`);
        return;
      }

      // Build externalSource object if enabled
      const externalSource: ExternalSource | undefined = externalEnabled
        ? {
            platform: effectiveExternalPlatform,
            url: externalUrl.trim(),
            originalAuthor: externalOriginalAuthor.trim() || undefined,
          }
        : undefined;

      const submitIsFeedback = isFeedbackMode ? true : false;
      const submitRequestAI = isBusinessMode ? requestAI : false;

      const res = await apiFetch<{ idea: { _id: string } }>(`/api/ideas`, {
        method: "POST",
        body: JSON.stringify({
          ideaType,
          title,
          summary,
          content,
          imageUrls,
          coverImageUrl,
          tags: submitTags,
          groupSlug,
          visibility,
          isMonetizable: false,
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

  async function handleGenerateDraft() {
    if (!content.trim()) {
      toast.error(t('idea.aiDraftNeedContent'));
      return;
    }

    setGeneratingDraft(true);
    try {
      const ideaType = isBusinessMode ? "business" : isFeedbackMode ? "feedback" : "daily";
      const res = await generateIdeaDraft({ content: content.trim(), ideaType });
      const draft = res.draft;

      setTitle(draft.title || "");
      setSummary(draft.summary || "");
      if (showTagsInput && Array.isArray(draft.tags) && draft.tags.length > 0) {
        setTags(draft.tags.join(", "));
      }
      toast.success(t('idea.aiDraftApplied'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setGeneratingDraft(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <div className="rounded-2xl border border-purple-700/60 bg-gradient-to-r from-purple-950/80 to-indigo-950/60 p-3" data-tour="new-idea-mode">
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

      <div className="mt-6 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4" data-tour="new-idea-form">
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
          {(isBusinessMode || isFeedbackMode || isDailyMode || isDynamicMode) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleGenerateDraft}
                disabled={generatingDraft || !content.trim()}
                className="rounded-lg border border-emerald-700/80 bg-emerald-900/30 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/50 disabled:opacity-50"
              >
                {generatingDraft ? t('idea.aiDraftGenerating') : t('idea.aiDraftGenerate')}
              </button>
            </div>
          )}
        </div>

        <div data-tour="new-idea-media">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-xs rounded-lg border border-purple-700 px-3 py-1.5 cursor-pointer hover:bg-purple-950/40 text-purple-200">
              {t('idea.uploadCover')}
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                className="hidden"
                onChange={(e) => {
                  handleCoverImageUpload(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {uploadingCover && <span className="text-xs text-gray-400">{t('idea.uploadingCover')}</span>}
          </div>

          {coverImageUrl && (
            <div className="mb-3 relative">
              <img src={coverImageUrl} alt="idea cover" className="h-48 w-full rounded border border-purple-800 object-contain bg-gray-900" />
              <button
                type="button"
                className="absolute top-1 right-1 rounded bg-black/60 px-2 text-xs"
                onClick={() => setCoverImageUrl("")}
              >
                {t('idea.removeCover')}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <label className="text-xs rounded-lg border border-gray-700 px-3 py-1.5 cursor-pointer hover:bg-gray-900 text-gray-200">
              + Image
              <input
                type="file"
                accept={IMAGE_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => {
                  handleIdeaImageUpload(e.target.files);
                  e.currentTarget.value = "";
                }}
              />
            </label>
            {uploadingImages && <span className="text-xs text-gray-400">Uploading...</span>}
          </div>

          {imageUrls.length > 0 && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {imageUrls.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="idea upload" className="h-20 w-full rounded border border-gray-800 object-cover" />
                  <button
                    type="button"
                    className="absolute top-1 right-1 rounded bg-black/60 px-1 text-xs"
                    onClick={() => setImageUrls((prev) => prev.filter((item) => item !== url))}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
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
            {t('idea.feedbackFixedTagLabel')}: <span className="font-semibold">{t('newIdeaExtra.feedbackFixedTagValue')}</span>
          </div>
        )}

        <div className="grid gap-2 rounded-xl border border-gray-800 bg-gray-950/40 p-3" data-tour="new-idea-group">
          <div>
            <p className="text-sm font-medium text-white">{t('idea.groupLabel')}</p>
          </div>
          <select
            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            value={groupSlug}
            onChange={(e) => setGroupSlug(e.target.value)}
          >
            {(availableGroups.length > 0 ? availableGroups : [{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }]).map((group) => (
              <option key={group.slug} value={group.slug}>
                {group.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid md:grid-cols-3 gap-2" data-tour="new-idea-visibility">
          <select className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            value={visibility} onChange={(e) => setVisibility(e.target.value as any)}>
            <option value="public">{t('idea.public')}</option>
            <option value="unlisted">{t('idea.unlisted')}</option>
            <option value="private">{t('idea.private')}</option>
          </select>
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
                  placeholder={
                    getPlatformByName(externalPlatform === OTHER_PLATFORM_VALUE ? "其他" : externalPlatform)?.placeholder ||
                    t('idea.externalSourceUrlPlaceholder')
                  }
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
            </div>

            <div>
              <label className="block text-sm text-gray-300 mb-2">{t('idea.externalSourcePlatform')} *</label>
              <select
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full text-gray-200 focus:outline-none focus:border-purple-600"
                value={externalPlatform}
                onChange={(e) => {
                  const selected = e.target.value;
                  setExternalPlatform(selected);
                  if (selected !== OTHER_PLATFORM_VALUE) {
                    setCustomExternalPlatform("");
                  }
                }}
              >
                <option value="">{t('idea.selectPlatform')}</option>
                {PLATFORMS.map((platform) => (
                  <option key={platform.name} value={platform.name === "其他" ? OTHER_PLATFORM_VALUE : platform.name}>
                    {platform.icon} {platform.name === "其他" ? t('idea.platformOther') : platform.name}
                  </option>
                ))}
              </select>
            </div>

            {externalPlatform === OTHER_PLATFORM_VALUE && (
              <div>
                <label className="block text-sm text-gray-300 mb-2">{t('idea.externalSourceCustomPlatform')} *</label>
                <input
                  type="text"
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full text-gray-200 focus:outline-none focus:border-purple-600"
                  placeholder={t('idea.externalSourceCustomPlatformPlaceholder')}
                  value={customExternalPlatform}
                  onChange={(e) => setCustomExternalPlatform(e.target.value)}
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-300 mb-2">{t('idea.externalSourceAuthor')}</label>
              <input
                type="text"
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full text-gray-200 focus:outline-none focus:border-purple-600"
                placeholder={t('idea.externalSourceAuthorPlaceholder')}
                value={externalOriginalAuthor}
                onChange={(e) => setExternalOriginalAuthor(e.target.value)}
              />
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading || !title.trim()}
          data-tour="new-idea-submit"
          className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
        >
          {loading ? t('idea.saving') : t('idea.createButton')}
        </button>

        {err && <p className="text-red-400 text-sm">{t('errors.error')}: {err}</p>}
      </div>
    </div>
  );
}
