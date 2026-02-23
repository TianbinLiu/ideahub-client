import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";

export default function LeaderboardDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const userId = (user as any)?._id || (user as any)?.id;

  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [posts, setPosts] = useState<any[]>([]);
  const [postsPage, setPostsPage] = useState(1);
  const [postsLimit] = useState(6);
  const [postsTotal, setPostsTotal] = useState(0);
  const [postsSort, setPostsSort] = useState<"popular" | "recent">("popular");

  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostBody, setNewPostBody] = useState("");

  async function loadLeaderboard() {
    if (!id) return;
    try {
      setLoading(true);
      setError("");
      const res = await apiFetch<any>(`/api/tag-rank/leaderboards/${id}`);
      setLeaderboard(res);
    } catch (e: any) {
      setError(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadPosts() {
    if (!leaderboard?.tagsKey) return;
    try {
      const qs = new URLSearchParams({
        tagsKey: leaderboard.tagsKey,
        sort: postsSort,
        page: String(postsPage),
        limit: String(postsLimit),
      });
      const res = await apiFetch<any>(`/api/tag-rank/posts?${qs.toString()}`);
      setPosts(res.posts || []);
      setPostsTotal(res.total || 0);
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function submitPost() {
    try {
      if (!leaderboard?.tagsKey) return toast.error("No leaderboard selected");
      const tagsKey = leaderboard.tagsKey;
      await apiFetch(`/api/tag-rank/posts`, {
        method: "POST",
        body: JSON.stringify({ title: newPostTitle, body: newPostBody, tagsKey }),
      });
      setNewPostTitle("");
      setNewPostBody("");
      toast.success("Nomination posted");
      setPostsPage(1);
      loadPosts();
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function toggleLike(postId: string) {
    try {
      const res = await apiFetch<{ liked: boolean; likesCount: number }>(
        `/api/tag-rank/posts/${postId}/like`,
        { method: "POST" }
      );
      setPosts((prev) =>
        prev.map((p) =>
          p._id === postId
            ? {
                ...p,
                likesCount: res.likesCount,
                likes: res.liked
                  ? [...(p.likes || []), userId]
                  : (p.likes || []).filter((u: string) => u !== userId),
              }
            : p
        )
      );
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  useEffect(() => {
    loadLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (leaderboard?.tagsKey) {
      loadPosts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard?.tagsKey, postsPage, postsSort]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-gray-400">Loading leaderboard...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-red-400 mb-4">Error: {error}</div>
        <button
          onClick={() => nav("/tag-rank")}
          className="text-blue-400 hover:underline"
        >
          Back to Tag Rank
        </button>
      </div>
    );
  }

  if (!leaderboard) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-gray-400">Leaderboard not found</p>
        <button
          onClick={() => nav("/tag-rank")}
          className="text-blue-400 hover:underline mt-4"
        >
          Back to Tag Rank
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <button
        onClick={() => nav("/tag-rank")}
        className="text-sm text-gray-400 hover:text-white"
      >
        ← Back to Tag Rank
      </button>

      <h1 className="text-2xl font-bold text-white mt-4">
        Leaderboard: {leaderboard.tags?.join(", ")}
      </h1>

      {/* Nominations/Posts Section */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-lg text-white mb-3">Nominations</h2>

        {user && (
          <div className="grid gap-2 mb-4">
            <input
              value={newPostTitle}
              onChange={(e) => setNewPostTitle(e.target.value)}
              placeholder="Nomination title"
              className="px-3 py-2 rounded-xl bg-gray-950 border border-gray-800"
            />
            <textarea
              value={newPostBody}
              onChange={(e) => setNewPostBody(e.target.value)}
              placeholder="Why nominate this?"
              className="px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 min-h-20"
            />
            <div className="flex gap-2">
              <button
                onClick={submitPost}
                className="rounded-xl bg-white text-black px-3 py-2 font-semibold"
              >
                Post Nomination
              </button>
              <select
                value={postsSort}
                onChange={(e) => {
                  setPostsSort(e.target.value as any);
                  setPostsPage(1);
                }}
                className="ml-auto bg-gray-950 border border-gray-800 px-2 py-1 rounded-md text-sm"
              >
                <option value="popular">Popular</option>
                <option value="recent">Recent</option>
              </select>
            </div>
          </div>
        )}

        <div className="grid gap-2">
          {posts.map((p) => {
            const isLiked = p.likes?.includes(userId);
            return (
              <div
                key={p._id}
                className="rounded-xl border border-gray-800 bg-gray-950/50 p-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-white font-semibold">{p.title}</div>
                    <div className="text-xs text-gray-400">
                      by {p.author?.username || "unknown"} ·{" "}
                      {new Date(p.createdAt).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-300 mt-2">{p.body}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">
                      {p.likesCount || 0}
                    </div>
                    <div className="text-xs text-gray-400">likes</div>
                    {user && (
                      <button
                        onClick={() => toggleLike(p._id)}
                        className={`mt-2 text-xs px-2 py-1 rounded border ${
                          isLiked
                            ? "border-white text-white"
                            : "border-gray-700 text-gray-400 hover:text-gray-200"
                        }`}
                      >
                        {isLiked ? "❤️" : "🤍"} {p.likesCount || 0}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {posts.length === 0 && (
            <p className="text-gray-400 text-sm">
              No nominations yet. Be the first to nominate!
            </p>
          )}
        </div>

        <div className="mt-3 flex items-center justify-between text-sm">
          <button
            disabled={postsPage <= 1}
            onClick={() => setPostsPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-gray-700 px-3 py-1"
          >
            ← Prev
          </button>
          <div className="text-gray-400">
            Page <span className="text-white">{postsPage}</span> · Total{" "}
            <span className="text-white">{Math.ceil(postsTotal / postsLimit) || 1}</span>
          </div>
          <button
            disabled={
              postsPage >=
              Math.max(1, Math.ceil(postsTotal / postsLimit || 1))
            }
            onClick={() => setPostsPage((p) => p + 1)}
            className="rounded-lg border border-gray-700 px-3 py-1"
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}
