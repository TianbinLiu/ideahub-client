import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type FeedbackIdea = {
  _id: string;
  title: string;
  summary: string;
  aiSummary: string;
  feedbackType: string;
  feedbackStatus: string;
  createdAt: string;
  author?: { _id: string; username: string; role: string };
  stats?: { likeCount: number; commentCount: number; bookmarkCount: number; viewCount: number };
};

export default function FeedbackAdminPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<FeedbackIdea[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  async function loadFeedback() {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await apiFetch<{ items: FeedbackIdea[]; total: number }>(
        `/api/admin/feedback?${params.toString()}`
      );
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      await apiFetch(`/api/admin/ideas/${id}/feedback-status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(t('admin.statusUpdated'));
      loadFeedback();
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  useEffect(() => {
    loadFeedback();
  }, [page, typeFilter, statusFilter]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{t('admin.feedbackManagement')}</h1>
        <div className="text-sm text-gray-400">
          {t('admin.totalFeedback')}: {total} {t('admin.feedbackTotal')}
        </div>
      </div>

      <div className="mb-4 flex gap-3 items-center flex-wrap">
        <div className="flex gap-2 items-center">
          <label className="text-sm text-gray-400">{t('admin.type')}:</label>
          <select
            className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-1.5 text-sm text-gray-200"
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t('admin.allTypes')}</option>
            <option value="bug">{t('admin.bugReports')}</option>
            <option value="suggestion">{t('admin.featureSuggestions')}</option>
          </select>
        </div>

        <div className="flex gap-2 items-center">
          <label className="text-sm text-gray-400">{t('admin.status')}:</label>
          <select
            className="rounded-lg bg-gray-950/50 border border-gray-800 px-3 py-1.5 text-sm text-gray-200"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="all">{t('admin.allStatuses')}</option>
            <option value="pending">{t('idea.feedbackPending')}</option>
            <option value="under_review">{t('idea.feedbackUnderReview')}</option>
            <option value="adopted">{t('idea.feedbackAdopted')}</option>
            <option value="resolved">{t('idea.feedbackResolved')}</option>
            <option value="rejected">{t('idea.feedbackRejected')}</option>
          </select>
        </div>

        <button
          onClick={() => {
            setTypeFilter("all");
            setStatusFilter("all");
            setPage(1);
          }}
          className="text-sm text-gray-400 hover:text-white ml-auto"
        >
          {t('admin.filterClear')}
        </button>
      </div>

      {loading && <p className="text-gray-400">{t('common.loading')}</p>}

      <div className="grid gap-3">
        {items.map((item) => (
          <div
            key={item._id}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      item.feedbackType === "bug"
                        ? "bg-red-900/30 border border-red-800 text-red-200"
                        : "bg-blue-900/30 border border-blue-800 text-blue-200"
                    }`}
                  >
                    {item.feedbackType === "bug" ? t('admin.feedbackBug') : t('admin.feedbackSuggestion')}
                  </span>

                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      item.feedbackStatus === "pending"
                        ? "bg-yellow-900/30 border border-yellow-800 text-yellow-200"
                        : item.feedbackStatus === "under_review"
                        ? "bg-purple-900/30 border border-purple-800 text-purple-200"
                        : item.feedbackStatus === "adopted"
                        ? "bg-green-900/30 border border-green-800 text-green-200"
                        : item.feedbackStatus === "resolved"
                        ? "bg-teal-900/30 border border-teal-800 text-teal-200"
                        : "bg-gray-900/30 border border-gray-700 text-gray-400"
                    }`}
                  >
                    {item.feedbackStatus === "pending"
                      ? `⏳ ${t('idea.feedbackPending')}`
                      : item.feedbackStatus === "under_review"
                      ? `🔍 ${t('idea.feedbackUnderReview')}`
                      : item.feedbackStatus === "adopted"
                      ? `✅ ${t('idea.feedbackAdopted')}`
                      : item.feedbackStatus === "resolved"
                      ? `✔️ ${t('idea.feedbackResolved')}`
                      : `❌ ${t('idea.feedbackRejected')}`}
                  </span>
                </div>

                <Link
                  to={`/ideas/${item._id}`}
                  className="text-white font-semibold hover:underline block mb-1"
                >
                  {item.title}
                </Link>

                {item.aiSummary && (
                  <p className="text-sm text-blue-200 bg-blue-950/20 border border-blue-900 rounded-lg px-2 py-1 mb-2">
                    {t('admin.aiSummary')} {item.aiSummary}
                  </p>
                )}

                {item.summary && (
                  <p className="text-sm text-gray-400 mb-2">{item.summary}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>
                    {t('admin.by')}{" "}
                    {item.author?.username ? (
                      <span className="text-gray-300">{item.author.username}</span>
                    ) : (
                      t('admin.unknown')
                    )}
                  </span>
                  <span>·</span>
                  <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                  {item.stats && (
                    <>
                      <span>·</span>
                      <span>
                        ❤️ {item.stats.likeCount} · 💬 {item.stats.commentCount}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <select
                  className="text-xs rounded-lg bg-gray-950/50 border border-gray-700 px-2 py-1 text-gray-200"
                  value={item.feedbackStatus || "pending"}
                  onChange={(e) => updateStatus(item._id, e.target.value)}
                >
                  <option value="pending">{t('idea.feedbackPending')}</option>
                  <option value="under_review">{t('idea.feedbackUnderReview')}</option>
                  <option value="adopted">{t('idea.feedbackAdopted')}</option>
                  <option value="resolved">{t('idea.feedbackResolved')}</option>
                  <option value="rejected">{t('idea.feedbackRejected')}</option>
                </select>

                <Link
                  to={`/ideas/${item._id}`}
                  className="text-xs text-center rounded-lg border border-gray-700 px-2 py-1 hover:bg-gray-800 text-gray-300"
                >
                  {t('admin.viewDetails')}
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!loading && items.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {t('admin.noFeedbackFound')}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex gap-2 justify-center">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-gray-900"
          >
            {t('admin.previousPage')}
          </button>
          <span className="px-3 py-1.5 text-sm text-gray-400">
            {t('admin.pageOf', { page, total: totalPages })}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-gray-900"
          >
            {t('admin.nextPage')}
          </button>
        </div>
      )}
    </div>
  );
}
