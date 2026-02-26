import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";
import { CharCount } from "../components/CharCount";

const LIMITS = {
  TITLE: 150,
  SUMMARY: 500,
  CONTENT: 10000,
  TAGS: 200,
};

type Idea = {
  _id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  visibility: "public" | "private" | "unlisted" | string;
  isMonetizable: boolean;
  licenseType: string;
  author?: { _id: string; username: string; role: string };
};

export default function EditIdeaPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();

  const userId = (user as any)?._id || (user as any)?.id;
  const isAdmin = user?.role === "admin";

  const [idea, setIdea] = useState<Idea | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // form state
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private" | "unlisted">("public");
  const [isMonetizable, setIsMonetizable] = useState(false);
  const [licenseType, setLicenseType] = useState("default");

  const canEdit = useMemo(() => {
    if (!idea || !userId) return false;
    const isOwner = !!idea.author?._id && idea.author._id === userId;
    return isOwner || isAdmin;
  }, [idea, userId, isAdmin]);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ ok: true; idea: Idea }>(`/api/ideas/${id}`);
      const i = res.idea;
      setIdea(i);

      // init form values
      setTitle(i.title || "");
      setSummary(i.summary || "");
      setContent(i.content || "");
      setTags((i.tags || []).join(", "));
      setVisibility((i.visibility as any) || "public");
      setIsMonetizable(!!i.isMonetizable);
      setLicenseType(i.licenseType || "default");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSave() {
    if (!id) return;
    if (!title.trim()) {
      toast.error(t('errors.validation'));
      return;
    }
    if (!canEdit) {
      toast.error(t('auth.forbidden'));
      return;
    }

    setSaving(true);
    try {
      await apiFetch(`/api/ideas/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          title,
          summary,
          content,
          tags, // 后端已支持 "a,b,c" → toStringArray
          visibility,
          isMonetizable,
          licenseType,
        }),
      });

      toast.success(t('idea.updated'));
      nav(`/ideas/${id}`);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="max-w-3xl mx-auto p-4 text-gray-300">
        {t('idea.loginToEdit')}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <Link to={`/ideas/${id}`} className="text-sm text-gray-400 hover:text-white">
        {t('idea.backToIdea')}
      </Link>

      <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h1 className="text-2xl font-bold text-white">{t('idea.editTitle')}</h1>
        {idea?.author?.username && (
          <p className="text-gray-400 text-sm mt-1">
            {t('idea.author')}: {idea.author.username} {isAdmin ? `· ${t('idea.adminMode')}` : ""}
          </p>
        )}

        {loading && <p className="text-gray-300 mt-4">{t('common.loading')}</p>}

        {!loading && idea && !canEdit && (
          <p className="text-red-400 text-sm mt-4">
            {t('idea.editForbidden')}
          </p>
        )}

        {!loading && idea && (
          <div className="mt-5 grid gap-3">
            <div>
              <input
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
                placeholder={t('idea.title')}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={!canEdit || saving}
                maxLength={LIMITS.TITLE}
              />
              <CharCount current={title.length} max={LIMITS.TITLE} className="mt-1" />
            </div>

            <div>
              <input
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
                placeholder={t('idea.summary')}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                disabled={!canEdit || saving}
                maxLength={LIMITS.SUMMARY}
              />
              <CharCount current={summary.length} max={LIMITS.SUMMARY} className="mt-1" />
            </div>

            <div>
              <textarea
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[220px] w-full"
                placeholder={t('idea.content')}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!canEdit || saving}
                maxLength={LIMITS.CONTENT}
              />
              <CharCount current={content.length} max={LIMITS.CONTENT} className="mt-1" />
            </div>

            <div>
              <input
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 w-full"
                placeholder={t('idea.tagsPlaceholder')}
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                disabled={!canEdit || saving}
                maxLength={LIMITS.TAGS}
              />
              <CharCount current={tags.length} max={LIMITS.TAGS} className="mt-1" />
            </div>

            <div className="grid md:grid-cols-3 gap-2">
              <select
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as any)}
                disabled={!canEdit || saving}
              >
                <option value="public">{t('idea.public')}</option>
                <option value="unlisted">{t('idea.unlisted')}</option>
                <option value="private">{t('idea.private')}</option>
              </select>

              <input
                className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                placeholder={t('idea.licenseType')}
                value={licenseType}
                onChange={(e) => setLicenseType(e.target.value)}
                disabled={!canEdit || saving}
              />

              <label className="flex items-center gap-2 text-sm text-gray-300 px-2">
                <input
                  type="checkbox"
                  checked={isMonetizable}
                  onChange={(e) => setIsMonetizable(e.target.checked)}
                  disabled={!canEdit || saving}
                />
                {t('idea.monetizable')}
              </label>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={onSave}
                disabled={saving || !canEdit || !title.trim()}
                className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
              >
                {saving ? t('idea.saving') : t('common.save')}
              </button>

              <Link
                to={`/ideas/${id}`}
                className="rounded-xl border border-gray-700 px-4 py-2 text-gray-200 hover:bg-gray-900"
              >
                {t('common.cancel')}
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
