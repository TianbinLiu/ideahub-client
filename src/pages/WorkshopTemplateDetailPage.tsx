import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  applyWorkshopTemplate,
  createWorkshopTemplateComment,
  getWorkshopTemplateDetail,
  listWorkshopTemplateComments,
  toggleWorkshopTemplateBookmark,
  toggleWorkshopTemplateLike,
  type WorkshopTemplate,
  type WorkshopTemplateComment,
} from "../api";
import { saveActiveWorkshopTemplate } from "../utils/workshopTheme";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { useTranslation } from "react-i18next";
import { useAuth } from "../authContext";
import WorkshopLayoutCanvas from "../components/WorkshopLayoutCanvas";

export default function WorkshopTemplateDetailPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const nav = useNavigate();
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [commentBusy, setCommentBusy] = useState(false);
  const [template, setTemplate] = useState<WorkshopTemplate | null>(null);
  const [comments, setComments] = useState<WorkshopTemplateComment[]>([]);
  const [commentText, setCommentText] = useState("");

  async function load() {
    if (!id) return;
    try {
      setLoading(true);
      const [detailRes, commentsRes] = await Promise.all([
        getWorkshopTemplateDetail(id),
        listWorkshopTemplateComments(id),
      ]);
      setTemplate(detailRes.template);
      setComments(commentsRes.comments || []);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  async function handleApply() {
    if (!id) return;
    try {
      const res = await applyWorkshopTemplate(id);
      saveActiveWorkshopTemplate(res.activeTemplate);
      toast.success(t("workshop.applied"));
      nav("/");
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleLike() {
    if (!id || !template) return;
    try {
      const res = await toggleWorkshopTemplateLike(id);
      setTemplate({ ...template, liked: res.liked, stats: { ...template.stats, likeCount: res.likeCount } });
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleBookmark() {
    if (!id || !template) return;
    try {
      const res = await toggleWorkshopTemplateBookmark(id);
      setTemplate({ ...template, bookmarked: res.bookmarked, stats: { ...template.stats, bookmarkCount: res.bookmarkCount } });
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handlePostComment() {
    if (!id || !commentText.trim()) return;
    try {
      setCommentBusy(true);
      const res = await createWorkshopTemplateComment(id, commentText.trim());
      setComments((prev) => [res.comment, ...prev]);
      setTemplate((prev) => prev ? { ...prev, stats: { ...prev.stats, commentCount: (prev.stats?.commentCount || 0) + 1 } } : prev);
      setCommentText("");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setCommentBusy(false);
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl p-4 text-gray-300">{t("common.loading")}</div>;
  if (!template) return <div className="mx-auto max-w-6xl p-4 text-gray-400">{t("workshop.notFound")}</div>;

  const isOwner = user && (user as any)?._id === (template.author as any)?._id;

  return (
    <div className="mx-auto max-w-6xl p-4 ws-custom">
      <Link to="/workshop" className="text-sm text-gray-400 hover:text-white">{t("workshop.back")}</Link>

      <div className="mt-3 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-gray-800 bg-gray-900 ws-card">
            <div className="h-64 bg-gray-800">
              {template.previewImageUrl ? (
                <img src={template.previewImageUrl} alt={template.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-400">{t("workshop.noPreview")}</div>
              )}
            </div>
            <div className="p-5">
              <h1 className="text-2xl font-bold text-white ws-title">{template.title}</h1>
              <p className="mt-2 text-gray-300">{template.summary || t("workshop.noDescription")}</p>
              <p className="mt-2 text-sm text-gray-400">{t("workshop.author")}: {(template.author as any)?.username || "-"}</p>

              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {template.isDefault && <span className="rounded-full border border-amber-600/70 px-2 py-1 text-amber-200">{t("workshop.defaultTemplate")}</span>}
                <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">{t("workshop.version")}: {template.templateVersion || "-"}</span>
                <span className="rounded-full border border-gray-700 px-2 py-1 text-gray-300">{t("workshop.currentSiteVersion")}: {template.currentDefaultVersion || template.templateVersion || "-"}</span>
                <span className={`rounded-full border px-2 py-1 ${template.isCompatible === false ? "border-rose-700/70 text-rose-200" : "border-emerald-700/70 text-emerald-200"}`}>
                  {template.isCompatible === false ? t("workshop.incompatible") : t("workshop.compatible")}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-200">
                {(template.tags || []).map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-1">#{tag}</span>
                ))}
              </div>

              <div className="mt-4 text-sm text-gray-400">
                👀 {template.stats?.viewCount || 0} · ❤️ {template.stats?.likeCount || 0} · 🔖 {template.stats?.bookmarkCount || 0} · 💬 {template.stats?.commentCount || comments.length} · 🧪 {template.appliedCount || 0}
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button onClick={handleApply} className="ws-button rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">{t("workshop.apply")}</button>
                {!template.isDefault && <button onClick={handleLike} className="ws-button rounded-xl border border-gray-700 px-4 py-2 text-sm">{template.liked ? t("workshop.unlike") : t("workshop.like")}</button>}
                {!template.isDefault && <button onClick={handleBookmark} className="ws-button rounded-xl border border-gray-700 px-4 py-2 text-sm">{template.bookmarked ? t("workshop.unbookmark") : t("workshop.bookmark")}</button>}
                {isOwner && !template.isDefault && <Link to={`/workshop/templates/${template._id}/edit`} className="ws-button rounded-xl border border-cyan-700 px-4 py-2 text-sm text-cyan-300">{t("workshop.edit")}</Link>}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-gray-800 bg-gray-900/80 p-4 ws-card">
            <div className="mb-3">
              <h2 className="text-base font-semibold text-white">{t("workshop.previewLayout")}</h2>
              <p className="mt-1 text-xs text-gray-400">{t("workshop.layoutPreviewHint")}</p>
            </div>
            <WorkshopLayoutCanvas layout={template.layout} theme={template.theme} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-gray-800 bg-gray-900/80 p-4 ws-card">
            <h2 className="text-base font-semibold text-white">{t("workshop.authorUpdates")}</h2>
            {!template.updateLogs?.length ? (
              <p className="mt-3 text-sm text-gray-400">{t("workshop.noUpdates")}</p>
            ) : (
              <div className="mt-3 space-y-3">
                {template.updateLogs.map((entry, index) => (
                  <div key={entry._id || `${entry.title}-${index}`} className="rounded-2xl border border-gray-800 bg-gray-950/40 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{entry.title}</div>
                      <div className="text-[11px] text-gray-500">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "-"}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{entry.authorName || (template.author as any)?.username || "-"}</div>
                    {entry.summary && <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{entry.summary}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-gray-800 bg-gray-900/80 p-4 ws-card">
            <h2 className="text-base font-semibold text-white">{t("workshop.comments")}</h2>
            <div className="mt-3 space-y-3">
              <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3} className="w-full rounded-2xl border border-gray-700 bg-gray-950 px-3 py-2" placeholder={t("workshop.commentPlaceholder")} />
              <button disabled={commentBusy || !commentText.trim()} onClick={handlePostComment} className="ws-button rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
                {commentBusy ? t("workshop.postingComment") : t("workshop.postComment")}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {comments.length === 0 ? (
                <p className="text-sm text-gray-400">{t("workshop.noComments")}</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment._id} className="rounded-2xl border border-gray-800 bg-gray-950/40 p-3">
                    <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
                      <span>{comment.author?.username || "-"}</span>
                      <span>{comment.createdAt ? new Date(comment.createdAt).toLocaleString() : "-"}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-gray-200">{comment.content}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}