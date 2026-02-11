import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";

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
};

type Comment = {
  _id: string;
  content: string;
  createdAt: string;
  author?: { username: string; role: string };
};




export default function IdeaDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [idea, setIdea] = useState<Idea | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [busy, setBusy] = useState(false);

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

  async function load() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ idea: Idea; liked?: boolean; bookmarked?: boolean }>(`/api/ideas/${id}`);
      setIdea(res.idea);
      setLiked(!!res.liked);
      setBookmarked(!!res.bookmarked);
    } catch (e: any) {
      setErr(e.message);
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
  const isOwner = !!idea?.author?._id && !!user?._id && idea.author._id === user._id;

  return (
    <div className="max-w-3xl mx-auto p-4">
      <Link to="/" className="text-sm text-gray-400 hover:text-white">← Back</Link>

      {loading && <p className="text-gray-300 mt-6">Loading...</p>}
      {err && <p className="text-red-400 mt-6">Error: {err}</p>}

      {idea && (

        <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-white">{idea.title}</h1>
              <p className="text-gray-400 text-sm mt-1">
                by {idea.author?.username || "unknown"} · {new Date(idea.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="text-right text-xs text-gray-400">
              <div>visibility: {idea.visibility}</div>
              <div>license: {idea.licenseType}</div>
            </div>
          </div>

          {idea.summary && <p className="text-gray-200 mt-4">{idea.summary}</p>}
          {idea.content && <pre className="text-gray-200 mt-4 whitespace-pre-wrap font-sans">{idea.content}</pre>}

          {idea.aiReview?.analysisText && (
            <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
              <h3 className="font-semibold text-white">AI Review</h3>

              <div className="mt-2 text-sm text-gray-300">
                <div>Feasibility: <span className="text-white font-semibold">{idea.aiReview.feasibilityScore}</span> / 100</div>
                <div>Profit potential: <span className="text-white font-semibold">{idea.aiReview.profitPotentialScore}</span> / 100</div>
                <div className="text-xs text-gray-500 mt-1">
                  model: {idea.aiReview.model || "unknown"} · {idea.aiReview.createdAt ? new Date(idea.aiReview.createdAt).toLocaleString() : ""}
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
              {liked ? "❤️ Liked" : "🤍 Like"}
            </button>

            <button
              className={`rounded-xl border px-3 py-2 text-sm disabled:opacity-50 hover:bg-gray-900 ${bookmarked ? "border-white text-white" : "border-gray-700 text-gray-300"
                }`}
              onClick={onToggleBookmark}
              disabled={!user}
            >
              {bookmarked ? "🔖 Bookmarked" : "📑 Bookmark"}
            </button>

            {isCompany && (
              <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
                <h3 className="font-semibold text-white">Company Interest</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Mark this idea as interesting and leave a message for the creator.
                </p>

                <textarea
                  className="mt-3 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[90px] w-full"
                  placeholder="Optional message (contact email / what you’re looking for...)"
                  value={interestMsg}
                  onChange={(e) => setInterestMsg(e.target.value)}
                />

                <button
                  className={`mt-3 rounded-xl border px-4 py-2 text-sm font-semibold hover:bg-gray-900 ${interested ? "border-white text-white" : "border-gray-700 text-gray-300"
                    }`}
                  onClick={onToggleInterest}
                >
                  {interested ? "✅ Interested (click to remove)" : "⭐ Mark Interested"}
                </button>
              </div>
            )}

            {!user && <span className="text-xs text-gray-500 self-center">Login to like/bookmark/comment.</span>}
          </div>

          <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-950/40 p-4">
            <h3 className="font-semibold text-white">Comments</h3>

            {user ? (
              <div className="mt-3 grid gap-2">
                <textarea
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 min-h-[90px]"
                  placeholder="Write a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                />
                <button
                  className="rounded-xl bg-white text-black px-4 py-2 font-semibold disabled:opacity-50"
                  onClick={submitComment}
                  disabled={busy || !commentText.trim()}
                >
                  {busy ? "Posting..." : "Post Comment"}
                </button>
              </div>
            ) : (
              <p className="text-sm text-gray-400 mt-2">Please login to post comments.</p>
            )}

            <div className="mt-4 space-y-3">
              {comments.length === 0 && <p className="text-gray-400 text-sm">No comments yet.</p>}
              {comments.map((c) => (
                <div key={c._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{c.author?.username || "unknown"}</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-gray-200 mt-2 whitespace-pre-wrap">{c.content}</p>
                </div>
              ))}
            </div>
          </div>


          {isOwner && (
            <p className="text-sm text-green-400 mt-4">
              You are the author (Edit/Delete UI comes in Phase 5/6).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
