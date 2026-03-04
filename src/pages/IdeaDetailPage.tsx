import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { getLocalIdea, deleteLocalIdea, saveLocalIdea } from "../utils/localIdeas";
import { MentionTextarea } from "../components/MentionTextarea";
import { CharCount } from "../components/CharCount";
import { UserHoverCard } from "../components/UserHoverCard";

const LIMITS = {
  COMMENT: 2000,
};


type Idea = {
  _id: string;
  title: string;
  summary: string;
  content: string;
  tags: string[];
  visibility: string;
  isMonetizable: boolean;
  licenseType: string;
  createdAt: string;
  updatedAt: string;
  author?: { _id: string; username: string; role: string };
  stats?: { likeCount: number; commentCount: number; bookmarkCount: number; viewCount: number };
  aiReview?: {
    feasibilityScore: number;
    profitPotentialScore: number;
    analysisText: string;
    model?: string;
    createdAt?: string;
  };
  isFeedback?: boolean;
  feedbackType?: string;
  feedbackStatus?: string;
  aiSummary?: string;
};

type Comment = {
  _id: string;
  content: string;
  createdAt: string;
  author?: { _id: string; username: string; role: string };
  likes?: string[];
  likesCount?: number;
  parentCommentId?: string | null;
  replyCount?: number;
};
export default function IdeaDetailPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [showMoveConfirm, setShowMoveConfirm] = useState(false);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [replies, setReplies] = useState<{ [commentId: string]: Comment[] }>({});

  const [liked, setLiked] = useState(false);
  const [bookmarked, setBookmarked] = useState(false);

  const isCompany = user?.role === "company";
  const [interestMsg, setInterestMsg] = useState("");
  const [interested, setInterested] = useState(false); // Phase 8 简化：首次不拉状态，点了就更新


  async function loadComments() {
    const res = await apiFetch<{ comments: Comment[] }>(`/api/ideas/${id}/comments`);
    setComments(res.comments || []);
  }

  async function submitComment() {
    if (!commentText.trim()) return;
    try {
      setBusy(true);
      const res = await apiFetch<{ comment: Comment; commentCount: number }>(`/api/ideas/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentText }),
      });
      setCommentText("");
      // 立即把新评论插到最前
      setComments((prev) => [res.comment, ...prev]);
      // 同步本地 idea 计数（不必等重新拉详情）
      setIdea((prev) =>
        prev ? { ...prev, stats: { ...prev.stats, commentCount: res.commentCount } as any } : prev
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitReply(parentCommentId: string) {
    if (!replyText.trim()) return;
    try {
      setBusy(true);
      await apiFetch<{ comment: Comment }>(`/api/ideas/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: replyText, parentCommentId }),
      });
      setReplyText("");
      setReplyingTo(null);
      
      // 更新父评论的回复数
      setComments((prev) =>
        prev.map((c) =>
          c._id === parentCommentId ? { ...c, replyCount: (c.replyCount || 0) + 1 } : c
        )
      );
      
      // 立即加载并展开回复列表，这样用户能看到新回复
      try {
        const repliesRes = await apiFetch<{ replies: Comment[] }>(`/api/ideas/${id}/comments/${parentCommentId}/replies`);
        setReplies((prev) => ({ ...prev, [parentCommentId]: repliesRes.replies || [] }));
        setExpandedReplies((prev) => new Set([...prev, parentCommentId]));
      } catch (e: any) {
        console.error("Failed to load replies after submission:", e);
      }
    } finally {
      setBusy(false);
    }
  }

  async function loadReplies(commentId: string) {
    try {
      const res = await apiFetch<{ replies: Comment[] }>(`/api/ideas/${id}/comments/${commentId}/replies`);
      setReplies((prev) => ({ ...prev, [commentId]: res.replies || [] }));
      setExpandedReplies((prev) => new Set([...prev, commentId]));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  function toggleReplies(commentId: string) {
    if (expandedReplies.has(commentId)) {
      setExpandedReplies((prev) => {
        const newSet = new Set(prev);
        newSet.delete(commentId);
        return newSet;
      });
    } else {
      loadReplies(commentId);
    }
  }

  async function toggleCommentLike(commentId: string) {
    if (!id || !userId) return;
    try {
      const res = await apiFetch<{ liked: boolean; likesCount: number }>(
        `/api/ideas/${id}/comments/${commentId}/like`,
        { method: "POST" }
      );
      setComments((prev) =>
        prev.map((c) =>
          c._id === commentId
            ? { ...c, likesCount: res.likesCount, likes: res.liked ? [...(c.likes || []), userId] : (c.likes || []).filter((uid: string) => uid !== userId) }
            : c
        )
      );
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function onDeleteIdea() {
    if (!id) return;
    if (!confirm("Delete this idea? This cannot be undone.")) return;

    try {
      await apiFetch(`/api/ideas/${id}`, { method: "DELETE" });
      toast.success("Idea deleted");
      nav("/");
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function load() {
    try {
      setErr("");
      setLoading(true);
      if (id && id.startsWith("local-")) {
        const li = getLocalIdea(id);
        if (!li) {
          setErr("Local idea not found");
          return;
        }
        // map to Idea shape partially
        setIdea({
          _id: li._id,
          title: li.title,
          summary: li.summary || "",
          content: li.content || "",
          tags: li.tags || [],
          visibility: "private",
          isMonetizable: false,
          licenseType: "default",
          createdAt: li.createdAt,
          updatedAt: li.updatedAt,
        } as any);
        setLiked(false);
        setBookmarked(false);
        return;
      }

      const res = await apiFetch<{ idea: Idea; liked?: boolean; bookmarked?: boolean }>(`/api/ideas/${id}`);
      setIdea(res.idea);
      setLiked(!!res.liked);
      setBookmarked(!!res.bookmarked);
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg); // 可选

    } finally {
      setLoading(false);
    }
  }

  async function onToggleLike() {
    const res = await apiFetch<{ liked: boolean; likeCount: number }>(`/api/ideas/${id}/like`, { method: "POST" });
    setLiked(res.liked);
    setIdea((prev) => prev ? { ...prev, stats: { ...prev.stats, likeCount: res.likeCount } as any } : prev);
  }

  async function onToggleBookmark() {
    const res = await apiFetch<{ bookmarked: boolean; bookmarkCount: number }>(`/api/ideas/${id}/bookmark`, { method: "POST" });
    setBookmarked(res.bookmarked);
    setIdea((prev) => prev ? { ...prev, stats: { ...prev.stats, bookmarkCount: res.bookmarkCount } as any } : prev);
  }

  async function onToggleInterest() {
    const res = await apiFetch<{ interested: boolean }>(`/api/ideas/${id}/interest`, {
      method: "POST",
      body: JSON.stringify({ message: interestMsg }),
    });
    setInterested(res.interested);
  }


  useEffect(() => {
    (async () => {
      await load();
      await loadComments();
    })();
  }, [id]);

  // migration handler: confirm modal -> fetch full data -> save locally -> delete server
  async function confirmMoveToLocal() {
    if (!id) return;
    try {
      setLoading(true);
      // fetch latest idea (with liked/bookmarked) and comments
      const resIdea = await apiFetch<{ idea: Idea; liked?: boolean; bookmarked?: boolean }>(`/api/ideas/${id}`);
      const resComments = await apiFetch<{ comments: Comment[] }>(`/api/ideas/${id}/comments`);

      const payload: any = {
        _id: undefined,
        title: resIdea.idea.title,
        summary: resIdea.idea.summary,
        content: resIdea.idea.content,
        tags: resIdea.idea.tags,
        createdAt: resIdea.idea.createdAt,
        comments: resComments.comments || [],
        stats: resIdea.idea.stats || {},
        liked: !!resIdea.liked,
        bookmarked: !!resIdea.bookmarked,
      };

      const local = saveLocalIdea(payload);

      // delete server idea (owner only)
      await apiFetch(`/api/ideas/${id}`, { method: "DELETE" });

      // navigate to local idea view
      deleteLocalIdea(local._id); // ensure duplication doesn't occur, then re-save with full data
      saveLocalIdea({ ...local, ...payload, _id: local._id });

      toast.success(t('idea.movedToLocal'));
      setShowMoveConfirm(false);
      nav(`/ideas/${local._id}`);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  const userId = (user as any)?._id || (user as any)?.id;
  const isOwner = !!idea?.author?._id && !!userId && idea.author._id === userId;
  const isAdmin = user?.role === "admin";
  const canManageIdea = isOwner || isAdmin;
  const isLocal = !!idea && String(idea._id).startsWith("local-");

  return (
    <div className="max-w-3xl mx-auto p-4">
      {showMoveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold text-white">{t('idea.moveToPrivate')}</h3>
            <p className="text-sm text-gray-400 mt-2">{t('idea.moveToPrivateConfirmMsg')}</p>
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowMoveConfirm(false)} className="rounded-xl border border-gray-700 px-3 py-2 text-sm">{t('common.cancel')}</button>
              <button onClick={confirmMoveToLocal} className="rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold">{t('idea.confirmMove')}</button>
            </div>
          </div>
        </div>
      )}
      <Link to="/" className="text-sm text-gray-400 hover:text-white">{t('common.back')}</Link>

      {loading && <p className="text-gray-300 mt-6">{t('common.loading')}</p>}
      {err && <p className="text-red-400 mt-6">{t('common.error')}: {err}</p>}

      {idea && (

        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{idea.title}</h1>
              <p className="text-gray-400 text-sm mt-1">
                {t('idea.by')}{" "}
                {idea.author?._id ? (
                  <UserHoverCard userId={idea.author._id} username={idea.author.username}>
                    <span className="text-white">{idea.author.username}</span>
                  </UserHoverCard>
                ) : (
                  <span>{t('home.unknownAuthor')}</span>
                )}{" "}
                · {new Date(idea.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="text-right text-xs text-gray-400">
              <div>{t('idea.visibilityLabel')}: {idea.visibility}</div>
              <div>{t('idea.licenseLabel')}: {idea.licenseType}</div>
            </div>

            {canManageIdea && (
              <div className="flex flex-col gap-2 items-end">
                <Link
                  to={`/ideas/${idea._id}/edit`}
                  className="text-xs rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200"
                >
                  {t('common.edit')}
                </Link>

                {!isLocal && (
                  <button
                    onClick={async () => {
                      if (!confirm(t('idea.moveToPrivateConfirm'))) return;
                      try {
                        setLoading(true);
                        // save locally first
                        const local = saveLocalIdea({
                          title: idea.title,
                          summary: idea.summary,
                          content: idea.content,
                          tags: idea.tags,
                          createdAt: idea.createdAt,
                        });
                        // delete on server
                        await apiFetch(`/api/ideas/${idea._id}`, { method: "DELETE" });
                        toast.success(t('idea.movedToLocal'));
                        nav(`/ideas/${local._id}`);
                      } catch (e: any) {
                        toast.error(humanizeError(e));
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="text-xs rounded-lg border border-yellow-700 px-3 py-1.5 hover:bg-yellow-950 text-yellow-200"
                  >
                    {t('idea.moveToPrivate')}
                  </button>
                )}

                <button
                  onClick={onDeleteIdea}
                  className="text-xs rounded-lg border border-red-800 px-3 py-1.5 hover:bg-red-950 text-red-200"
                >
                  {t('common.delete')}
                </button>
              </div>
            )}

            {isLocal && (
              <div className="flex flex-col gap-2 items-end">
                <button
                  onClick={async () => {
                    // publish local idea -> POST to server
                    try {
                      setLoading(true);
                      const payload = {
                        title: idea.title,
                        summary: idea.summary,
                        content: idea.content,
                        tags: idea.tags,
                        visibility: "public",
                      };
                      const res = await apiFetch(`/api/ideas`, { method: "POST", body: JSON.stringify(payload) });
                      // on success, remove local and navigate to server idea
                      deleteLocalIdea(idea._id);
                      toast.success(t('idea.publishSuccess'));
                      nav(`/ideas/${res.idea._id}`);
                    } catch (e: any) {
                      toast.error(humanizeError(e));
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="text-xs rounded-lg border border-green-700 px-3 py-1.5 hover:bg-green-950 text-green-200"
                >
                  {t('idea.publishToPublic')}
                </button>

                <button
                  onClick={() => {
                    if (!confirm(t('idea.deleteLocalConfirm'))) return;
                    deleteLocalIdea(idea._id);
                    toast.success(t('idea.localDeleted'));
                    nav("/me");
                  }}
                  className="text-xs rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200"
                >
                  {t('idea.deleteLocal')}
                </button>
              </div>
            )}

          </div>

          {idea.isFeedback && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                idea.feedbackType === "bug" 
                  ? "bg-red-900/30 border border-red-800 text-red-200" 
                  : "bg-blue-900/30 border border-blue-800 text-blue-200"
              }`}>
                {idea.feedbackType === "bug" ? `🐛 ${t('idea.feedbackBug')}` : `💡 ${t('idea.feedbackSuggestion')}`}
              </span>
              
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                idea.feedbackStatus === "pending" ? "bg-yellow-900/30 border border-yellow-800 text-yellow-200" :
                idea.feedbackStatus === "under_review" ? "bg-purple-900/30 border border-purple-800 text-purple-200" :
                idea.feedbackStatus === "adopted" ? "bg-green-900/30 border border-green-800 text-green-200" :
                idea.feedbackStatus === "resolved" ? "bg-teal-900/30 border border-teal-800 text-teal-200" :
                idea.feedbackStatus === "rejected" ? "bg-gray-900/30 border border-gray-700 text-gray-400" :
                "bg-gray-900/30 border border-gray-700 text-gray-300"
              }`}>
                {idea.feedbackStatus === "pending" ? `⏳ ${t('idea.feedbackPending')}` :
                 idea.feedbackStatus === "under_review" ? `🔍 ${t('idea.feedbackUnderReview')}` :
                 idea.feedbackStatus === "adopted" ? `✅ ${t('idea.feedbackAdopted')}` :
                 idea.feedbackStatus === "resolved" ? `✔️ ${t('idea.feedbackResolved')}` :
                 idea.feedbackStatus === "rejected" ? `❌ ${t('idea.feedbackRejected')}` :
                 t('idea.statusUnknown')}
              </span>

              {isAdmin && !isLocal && (
                <div className="flex gap-1 ml-auto">
                  <select
                    className="text-xs rounded-lg bg-gray-950/50 border border-gray-700 px-2 py-1 text-gray-200"
                    value={idea.feedbackStatus || "pending"}
                    onChange={async (e) => {
                      try {
                        await apiFetch(`/api/admin/ideas/${idea._id}/feedback-status`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: e.target.value }),
                        });
                        toast.success(t('idea.statusUpdated'));
                        await load();
                      } catch (err: any) {
                        toast.error(humanizeError(err));
                      }
                    }}
                  >
                    <option value="pending">{t('idea.feedbackPending')}</option>
                    <option value="under_review">{t('idea.feedbackUnderReview')}</option>
                    <option value="adopted">{t('idea.feedbackAdopted')}</option>
                    <option value="resolved">{t('idea.feedbackResolved')}</option>
                    <option value="rejected">{t('idea.feedbackRejected')}</option>
                  </select>
                </div>
              )}
            </div>
          )}

          {idea.aiSummary && (
            <div className="mt-4 rounded-2xl border border-blue-800 bg-blue-950/20 p-3">
              <h4 className="text-sm font-semibold text-blue-200">📝 {t('idea.aiSummary')}</h4>
              <p className="text-sm text-blue-100 mt-1">{idea.aiSummary}</p>
            </div>
          )}

          {idea.summary && <p className="text-gray-200 mt-4">{idea.summary}</p>}
          {idea.content && <pre className="text-gray-200 mt-4 whitespace-pre-wrap font-sans">{idea.content}</pre>}

          {idea.aiReview?.analysisText && (
            <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
              <h3 className="font-semibold text-white">{t('aiReview.title')}</h3>

              <div className="mt-2 text-sm text-gray-300">
                <div>{t('aiReview.feasibility')}: <span className="text-white font-semibold">{idea.aiReview.feasibilityScore}</span> / 100</div>
                <div>{t('aiReview.profitPotential')}: <span className="text-white font-semibold">{idea.aiReview.profitPotentialScore}</span> / 100</div>
                <div className="text-xs text-gray-500 mt-1">
                  {t('aiReview.model')}: {idea.aiReview.model || t('home.unknownAuthor')} · {idea.aiReview.createdAt ? new Date(idea.aiReview.createdAt).toLocaleString() : ""}
                </div>
              </div>

              <pre className="mt-3 text-gray-200 whitespace-pre-wrap font-sans">
                {idea.aiReview.analysisText}
              </pre>
            </div>
          )}

          <div className="flex flex-wrap gap-2 mt-4 text-xs text-gray-400">
            {(idea.tags || []).map((t) => (
              <span key={t} className="px-2 py-1 rounded-full border border-gray-800">
                #{t}
              </span>
            ))}
            <span className="ml-auto text-gray-500">
              ❤️ {idea.stats?.likeCount ?? 0} · 💬 {idea.stats?.commentCount ?? 0} · 🔖{" "}
              {idea.stats?.bookmarkCount ?? 0} · 👀 {idea.stats?.viewCount ?? 0}
            </span>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-900 ${liked ? "border-white text-white" : "border-gray-700 text-gray-300"
                }`}
              onClick={onToggleLike}
              disabled={!user}
            >
              {liked ? `❤️ ${t('idea.liked')}` : `🤍 ${t('idea.like')}`}
            </button>

            <button
              className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-900 ${bookmarked ? "border-white text-white" : "border-gray-700 text-gray-300"
                }`}
              onClick={onToggleBookmark}
              disabled={!user}
            >
              {bookmarked ? `🔖 ${t('idea.bookmarked')}` : `📑 ${t('idea.bookmark')}`}
            </button>

            {isCompany && (
              <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                <h3 className="font-semibold text-white">{t('company.interest')}</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {t('company.interestDescription')}
                </p>

                <textarea
                  className="mt-3 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[90px] w-full"
                  placeholder={t('company.messagePlaceholder')}
                  value={interestMsg}
                  onChange={(e) => setInterestMsg(e.target.value)}
                />

                <button
                  className={`mt-3 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-900 ${interested ? "border-white text-white" : "border-gray-700 text-gray-300"
                    }`}
                  onClick={onToggleInterest}
                >
                  {interested ? `✅ ${t('company.interested')}` : `⭐ ${t('company.markInterested')}`}
                </button>
              </div>
            )}

            {!user && <span className="text-xs text-gray-500 self-center">{t('idea.loginToInteract')}</span>}
          </div>

          <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
            <h3 className="font-semibold text-white">{t('comment.title')}</h3>

            {user ? (
              <div className="mt-3 grid gap-2">
                <div>
                  <MentionTextarea
                    value={commentText}
                    onChange={setCommentText}
                    placeholder={t('comment.placeholder')}
                    className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[90px] w-full text-gray-200"
                    maxLength={LIMITS.COMMENT}
                  />
                  <CharCount current={commentText.length} max={LIMITS.COMMENT} className="mt-1" />
                </div>
                <button
                  className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
                  onClick={submitComment}
                  disabled={busy || !commentText.trim()}
                >
                  {busy ? t('comment.posting') : t('comment.submit')}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-2">{t('idea.loginToComment')}</p>
            )}

            <div className="mt-4 space-y-3">
              {comments.length === 0 && <p className="text-gray-400 text-sm">{t('comment.empty')}</p>}
              {comments.map((c) => {
                const isCommentLiked = c.likes?.includes(userId);
                const hasReplies = (c.replyCount || 0) > 0;
                const isExpanded = expandedReplies.has(c._id);
                const commentReplies = replies[c._id] || [];
                
                return (
                  <div key={c._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>
                        {c.author?._id ? (
                          <UserHoverCard userId={c.author._id} username={c.author.username}>
                            <span className="text-white">{c.author.username}</span>
                          </UserHoverCard>
                        ) : (
                          <span>{t('home.unknownAuthor')}</span>
                        )}
                      </span>
                      <span>{new Date(c.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-200 mt-2 whitespace-pre-wrap">{c.content}</p>
                    
                    <div className="flex items-center gap-2 mt-2">
                      {user && (
                        <>
                          <button
                            onClick={() => toggleCommentLike(c._id)}
                            className={`text-xs px-2 py-1 rounded border ${
                              isCommentLiked
                                ? "border-white text-white"
                                : "border-gray-700 text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {isCommentLiked ? "❤️" : "🤍"} {c.likesCount || 0}
                          </button>
                          
                          <button
                            onClick={() => setReplyingTo(replyingTo === c._id ? null : c._id)}
                            className="text-xs px-2 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                          >
                            💬 {t('comment.reply')}
                          </button>
                        </>
                      )}
                      
                      {hasReplies && (
                        <button
                          onClick={() => toggleReplies(c._id)}
                          className="text-xs px-2 py-1 text-blue-400 hover:text-blue-300"
                        >
                          {isExpanded ? '▼' : '▶'} {c.replyCount} {t('comment.replies')}
                        </button>
                      )}
                    </div>

                    {/* 回复输入框 */}
                    {replyingTo === c._id && (
                      <div className="mt-3 pl-4 border-l-2 border-gray-700">
                        <textarea
                          className="w-full rounded-lg bg-gray-800 border border-gray-700 p-2 text-sm text-white resize-none"
                          rows={2}
                          placeholder={t('comment.replyPlaceholder')}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          maxLength={LIMITS.COMMENT}
                        />
                        <div className="flex justify-between items-center mt-1">
                          <CharCount current={replyText.length} max={LIMITS.COMMENT} className="" />
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setReplyingTo(null);
                                setReplyText("");
                              }}
                              className="text-xs px-3 py-1 rounded border border-gray-700 text-gray-400 hover:text-gray-200"
                            >
                              {t('common.cancel')}
                            </button>
                            <button
                              onClick={() => submitReply(c._id)}
                              disabled={busy || !replyText.trim()}
                              className="text-xs px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
                            >
                              {busy ? t('comment.posting') : t('comment.submit')}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 回复列表 */}
                    {isExpanded && commentReplies.length > 0 && (
                      <div className="mt-3 pl-4 space-y-2 border-l-2 border-gray-700">
                        {commentReplies.map((reply) => {
                          const isReplyLiked = reply.likes?.includes(userId);
                          return (
                            <div key={reply._id} className="rounded-lg bg-gray-800 p-2">
                              <div className="flex items-center justify-between text-xs text-gray-400">
                                <span>
                                  {reply.author?._id ? (
                                    <UserHoverCard userId={reply.author._id} username={reply.author.username}>
                                      <span className="text-white">{reply.author.username}</span>
                                    </UserHoverCard>
                                  ) : (
                                    <span>{t('home.unknownAuthor')}</span>
                                  )}
                                </span>
                                <span>{new Date(reply.createdAt).toLocaleString()}</span>
                              </div>
                              <p className="text-gray-200 mt-1 text-sm whitespace-pre-wrap">{reply.content}</p>
                              {user && (
                                <button
                                  onClick={() => toggleCommentLike(reply._id)}
                                  className={`mt-1 text-xs px-2 py-0.5 rounded border ${
                                    isReplyLiked
                                      ? "border-white text-white"
                                      : "border-gray-700 text-gray-400 hover:text-gray-200"
                                  }`}
                                >
                                  {isReplyLiked ? "❤️" : "🤍"} {reply.likesCount || 0}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>


          {isOwner && (
            <p className="text-sm text-green-400 mt-4">
              {t('idea.authorNote')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
