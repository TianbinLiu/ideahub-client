import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiFetch, apiUploadImage } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import { CharCount } from "../components/CharCount";
import { UserHoverCard } from "../components/UserHoverCard";
import { useTranslation } from "react-i18next";

const LIMITS = {
  NOMINATION_TITLE: 150,
  NOMINATION_BODY: 2000,
};

const IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/gif,image/webp";
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export default function LeaderboardDetailPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
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
  const [newPostImageUrls, setNewPostImageUrls] = useState<string[]>([]);
  const [uploadingPostImages, setUploadingPostImages] = useState(false);

  async function handlePostImageUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadingPostImages(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 4)) {
        if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
        if (file.size > IMAGE_MAX_BYTES) throw new Error("Image size must be <= 5MB");
        const uploaded = await apiUploadImage(file, "leaderboard");
        urls.push(uploaded.imageUrl);
      }
      setNewPostImageUrls((prev) => [...prev, ...urls].slice(0, 8));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUploadingPostImages(false);
    }
  }

  async function toggleBookmark() {
    try {
      const res = await apiFetch<{ bookmarked: boolean }>(
        `/api/tag-rank/leaderboards/${id}/bookmark`,
        { method: "POST" }
      );
      setLeaderboard((prev: any) =>
        prev ? { ...prev, bookmarked: res.bookmarked } : prev
      );
      toast.success(res.bookmarked ? t('leaderboard.bookmarked') : t('leaderboard.bookmarkRemoved'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function deleteLeaderboard() {
    if (!confirm(t('leaderboard.deleteConfirm'))) return;
    try {
      await apiFetch(`/api/tag-rank/leaderboards/${id}`, { method: "DELETE" });
      toast.success(t('leaderboard.deleted'));
      nav("/tag-rank");
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

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
      if (!leaderboard?.tagsKey) return toast.error(t('leaderboard.noLeaderboardSelected'));
      const tagsKey = leaderboard.tagsKey;
      await apiFetch(`/api/tag-rank/posts`, {
        method: "POST",
        body: JSON.stringify({ title: newPostTitle, body: newPostBody, imageUrls: newPostImageUrls, tagsKey }),
      });
      setNewPostTitle("");
      setNewPostBody("");
      setNewPostImageUrls([]);
      toast.success(t('leaderboard.nominationPosted'));
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
        <p className="text-gray-400">{t('leaderboard.loadingDetail')}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="text-red-400 mb-4">{t('common.error')}: {error}</div>
        <button
          onClick={() => nav("/tag-rank")}
          className="text-blue-400 hover:underline"
        >
          {t('leaderboard.backToTagRank')}
        </button>
      </div>
    );
  }

  if (!leaderboard) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <p className="text-gray-400">{t('leaderboard.notFound')}</p>
        <button
          onClick={() => nav("/tag-rank")}
          className="text-blue-400 hover:underline mt-4"
        >
          {t('leaderboard.backToTagRank')}
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
        {t('leaderboard.backToTagRankArrow')}
      </button>

      <div className="flex items-start justify-between mt-4">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {t('leaderboard.label')}: {leaderboard.tags?.join(", ")}
          </h1>
          {leaderboard.author && (
            <p className="text-sm text-gray-400 mt-1">
              {t('leaderboard.createdBy')} {" "}
              {leaderboard.author._id ? (
                <UserHoverCard userId={leaderboard.author._id} username={leaderboard.author.username}>
                  <span className="text-white">{leaderboard.author.username}</span>
                </UserHoverCard>
              ) : (
                <span>{leaderboard.author.username}</span>
              )}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {user && (
            <button
              onClick={toggleBookmark}
              className={`rounded-xl border px-3 py-2 text-sm ${
                leaderboard.bookmarked
                  ? "border-white text-white"
                  : "border-gray-700 text-gray-400 hover:text-white"
              }`}
            >
              {leaderboard.bookmarked ? `★ ${t('leaderboard.bookmarked')}` : `☆ ${t('idea.bookmark')}`}
            </button>
          )}
          
          {userId && leaderboard.author && String(leaderboard.author._id || leaderboard.author.id) === String(userId) && (
            <button
              onClick={deleteLeaderboard}
              className="rounded-xl border border-red-700 px-3 py-2 text-sm text-red-200 hover:bg-red-950"
            >
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {/* Nominations/Posts Section */}
      <div className="mt-6 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <h2 className="text-lg text-white mb-3">{t('leaderboard.nominationsTitle')}</h2>

        {user && (
          <div className="grid gap-2 mb-4">
            <div>
              <input
                value={newPostTitle}
                onChange={(e) => setNewPostTitle(e.target.value)}
                placeholder={t('leaderboard.nominationTitlePlaceholder')}
                className="px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 w-full"
                maxLength={LIMITS.NOMINATION_TITLE}
              />
              <CharCount current={newPostTitle.length} max={LIMITS.NOMINATION_TITLE} className="mt-1" />
            </div>
            <div>
              <textarea
                value={newPostBody}
                onChange={(e) => setNewPostBody(e.target.value)}
                placeholder={t('leaderboard.nominationBodyPlaceholder')}
                className="px-3 py-2 rounded-xl bg-gray-950 border border-gray-800 min-h-20 w-full"
                maxLength={LIMITS.NOMINATION_BODY}
              />
              <CharCount current={newPostBody.length} max={LIMITS.NOMINATION_BODY} className="mt-1" />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-xs rounded-lg border border-gray-700 px-3 py-1.5 cursor-pointer hover:bg-gray-900 text-gray-200">
                + Image
                <input
                  type="file"
                  accept={IMAGE_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    handlePostImageUpload(e.target.files);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              {uploadingPostImages && <span className="text-xs text-gray-400">Uploading...</span>}
              <span className="text-xs text-gray-500">Max 5MB per image</span>
            </div>
            {newPostImageUrls.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {newPostImageUrls.map((url) => (
                  <div key={url} className="relative">
                    <img src={url} alt="nomination" className="h-20 w-full rounded border border-gray-800 object-cover" />
                    <button
                      type="button"
                      className="absolute top-1 right-1 rounded bg-black/60 px-1 text-xs"
                      onClick={() => setNewPostImageUrls((prev) => prev.filter((item) => item !== url))}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={submitPost}
                className="rounded-xl bg-white text-black px-3 py-2 font-semibold"
              >
                {t('leaderboard.postNomination')}
              </button>
              <select
                value={postsSort}
                onChange={(e) => {
                  setPostsSort(e.target.value as any);
                  setPostsPage(1);
                }}
                className="ml-auto bg-gray-950 border border-gray-800 px-2 py-1 rounded-md text-sm"
              >
                <option value="popular">{t('leaderboard.popular')}</option>
                <option value="recent">{t('leaderboard.recent')}</option>
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
                      {t('leaderboard.by')} {" "}
                      {p.author?._id ? (
                        <UserHoverCard userId={p.author._id} username={p.author.username}>
                          <span className="text-white">{p.author.username}</span>
                        </UserHoverCard>
                      ) : (
                        <span>{t('home.unknownAuthor')}</span>
                      )}{" "}
                      · {new Date(p.createdAt).toLocaleString()}
                    </div>
                    <div className="text-sm text-gray-300 mt-2">{p.body}</div>
                    {!!p.imageUrls?.length && (
                      <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                        {p.imageUrls.map((url: string) => (
                          <img key={url} src={url} alt="post" className="h-24 w-full rounded border border-gray-800 object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-white font-bold">
                      {p.likesCount || 0}
                    </div>
                    <div className="text-xs text-gray-400">{t('leaderboard.likes')}</div>
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
