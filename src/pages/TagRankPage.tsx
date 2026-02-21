import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { Link } from "react-router-dom";
import { useAuth } from "../authContext";

export default function TagRankPage() {
  const { user } = useAuth();
  const userId = (user as any)?._id || (user as any)?.id;
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [recentBoards, setRecentBoards] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [postsPage, setPostsPage] = useState(1);
  const [postsLimit] = useState(6);
  const [postsTotal, setPostsTotal] = useState(0);
  const [newPostTitle, setNewPostTitle] = useState("");
  const [newPostBody, setNewPostBody] = useState("");
  const [postsSort, setPostsSort] = useState<"popular"|"recent">("popular");
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  async function loadRank(t: string[]) {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      if (t.length) qs.set("tags", t.join(","));
      qs.set("page", String(page));
      qs.set("limit", String(limit));
      const res = await apiFetch(`/api/tag-rank?${qs.toString()}`);
      setResults(res.results || []);
      setTotal(res.total || (res.results ? res.results.length : 0));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  // tag suggestions
  const [suggestions, setSuggestions] = useState<string[]>([]);
  async function fetchSuggestions(q: string) {
    try {
      if (!q.trim()) return setSuggestions([]);
      const res = await apiFetch(`/api/tag-rank/suggest?q=${encodeURIComponent(q)}`);
      setSuggestions(res.tags || []);
    } catch {}
  }

  useEffect(() => {
    // load when tags or page changes
    loadRank(tags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags, page]);

  useEffect(() => {
    // initialize from query param if present
    const q = searchParams.get("tags") || searchParams.get("tagsKey") || "";
    if (q) {
      const arr = q.split(/[,|]+/).map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase());
      setTags(arr);
      setTagsInput(arr.join(","));
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync when search params change (e.g. navigation via View/Open)
  useEffect(() => {
    const q = searchParams.get("tags") || searchParams.get("tagsKey") || "";
    const arr = q ? q.split(/[,|]+/).map(s => s.trim()).filter(Boolean).map(s => s.toLowerCase()) : [];
    // only update if different to avoid loops
    const same = arr.length === tags.length && arr.every((t,i)=>t === tags[i]);
    if (!same) {
      setTags(arr);
      setTagsInput(arr.join(","));
      setPage(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  useEffect(() => {
    // load recent persisted leaderboards for discovery when no tags selected
    async function loadRecent() {
      try {
        const res = await apiFetch(`/api/tag-rank/leaderboards?limit=6`);
        setRecentBoards(res.boards || []);
      } catch (e) {}
    }
    loadRecent();
  }, []);

  function applyTags() {
    const arr = tagsInput.split(",").map(s => s.trim()).filter(Boolean).map(s=>s.toLowerCase());
    setTags(arr);
    setPage(1);
    // update URL so users can share/bookmark leaderboard
    if (arr.length) setSearchParams({ tags: arr.join(",") });
    else setSearchParams({});
  }

  async function createLeaderboard() {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      if (tags.length) qs.set("tags", tags.join(","));
      const res = await apiFetch(`/api/tag-rank/leaderboard`, { method: "POST", body: JSON.stringify({ tags: tags.join(",") }) });
      toast.success(`Leaderboard created (${res.entriesCount || 0})`);
      loadRank(tags);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  async function vote(ideaId: string, v: number) {
    try {
      const res = await apiFetch(`/api/tag-rank/vote`, { method: "POST", body: JSON.stringify({ ideaId, tags, vote: v }) });
      // update local score for idea
      setResults(prev => prev.map(r => r.idea._id === ideaId ? { ...r, score: res.score, votes: res.votes } : r));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  // posts related
  async function loadPostsForTags(curTags: string[]) {
    try {
      if (!curTags || curTags.length === 0) return setPosts([]);
      const tagsKey = curTags.join("|");
      const qs = new URLSearchParams({ tagsKey, sort: postsSort, page: String(postsPage), limit: String(postsLimit) });
      const res = await apiFetch(`/api/tag-rank/posts?${qs.toString()}`);
      setPosts(res.posts || []);
      setPostsTotal(res.total || 0);
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    loadPostsForTags(tags);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags, postsPage, postsSort]);

  async function submitPost() {
    try {
      if (!tags || tags.length === 0) return toast.error("请选择一个 leaderboard 再发帖");
      const tagsKey = tags.join("|");
      await apiFetch(`/api/tag-rank/posts`, { method: "POST", body: JSON.stringify({ title: newPostTitle, body: newPostBody, tagsKey }) });
      setNewPostTitle(""); setNewPostBody("");
      toast.success("Post created");
      loadPostsForTags(tags);
    } catch (e: any) { toast.error(humanizeError(e)); }
  }

  async function toggleLike(postId: string) {
    try {
      const res = await apiFetch<{ liked: boolean; likesCount: number }>(`/api/tag-rank/posts/${postId}/like`, { method: "POST" });
      setPosts(prev => prev.map(p => p._id === postId ? { 
        ...p, 
        likesCount: res.likesCount,
        likes: res.liked ? [...(p.likes || []), userId] : (p.likes || []).filter((u: string) => u !== userId)
      } : p));
    } catch (e: any) { toast.error(humanizeError(e)); }
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Tag Rank</h1>
      <p className="text-gray-400 text-sm mt-1">Pick tags to form a custom leaderboard.</p>

      <div className="mt-4 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="tags, comma separated (e.g. novel,dark)"
          value={tagsInput}
          onChange={(e) => { setTagsInput(e.target.value); fetchSuggestions(e.target.value); }}
        />
        {suggestions.length > 0 && (
          <div className="mt-2 grid grid-cols-4 gap-2">
            {suggestions.map(s => (
              <button key={s} onClick={() => { setTagsInput(prev => prev ? `${prev},${s}` : s); setSuggestions([]); }}
                className="text-sm px-2 py-1 rounded-full border border-gray-700 text-gray-300">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={applyTags} className="rounded-xl bg-white text-black px-3 py-2 font-semibold">Apply</button>
          <button onClick={() => { setTagsInput(""); setTags([]); loadRank([]); }} className="rounded-xl border border-gray-700 px-3 py-2">Clear</button>
        </div>
        {/* Posts section: only show when viewing a specific leaderboard (tags selected) */}
        {tags.length > 0 && (
          <div className="mt-6">
            <h3 className="text-lg text-white mb-2">Leaderboard Posts</h3>
            <div className="grid gap-2">
              <input value={newPostTitle} onChange={e=>setNewPostTitle(e.target.value)} placeholder="Nomination title" className="px-3 py-2 rounded-xl bg-gray-900 border border-gray-800" />
              <textarea value={newPostBody} onChange={e=>setNewPostBody(e.target.value)} placeholder="Why nominate this?" className="px-3 py-2 rounded-xl bg-gray-900 border border-gray-800" />
              <div className="flex gap-2">
                <button onClick={submitPost} className="rounded-xl bg-white text-black px-3 py-2">Post Nomination</button>
                <div className="ml-auto flex items-center gap-2">
                  <label className="text-sm text-gray-400">Sort:</label>
                  <select value={postsSort} onChange={e=>{ setPostsSort(e.target.value as any); setPostsPage(1); }} className="bg-gray-900 border border-gray-800 px-2 py-1 rounded-md">
                    <option value="popular">Popular</option>
                    <option value="recent">Recent</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-2">
                {posts.map(p => {
                  const isLiked = p.likes?.includes(userId);
                  return (
                    <div key={p._id} className="rounded-xl border border-gray-800 bg-gray-900 p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="text-white font-semibold">{p.title}</div>
                          <div className="text-xs text-gray-400">by {p.author?.username || 'unknown'} · {new Date(p.createdAt).toLocaleString()}</div>
                          <div className="text-sm text-gray-300 mt-2">{p.body}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-white font-bold">{p.likesCount || 0}</div>
                          <div className="text-xs text-gray-400">likes</div>
                          {user && (
                            <button 
                              onClick={()=>toggleLike(p._id)} 
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
                  <div>
                    <p className="text-gray-400">No Nomination in this leaderboard yet. You can create the first one or adjust tags.</p>
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between">
                <button disabled={postsPage <= 1} onClick={()=>setPostsPage(p=>Math.max(1,p-1))} className="rounded-xl border border-gray-700 px-3 py-2">← Prev</button>
                <div className="text-sm text-gray-400">Page <span className="text-white">{postsPage}</span> · Total <span className="text-white">{Math.ceil(postsTotal/postsLimit) || 1}</span></div>
                <button disabled={postsPage >= Math.max(1, Math.ceil(postsTotal/postsLimit || 1))} onClick={()=>setPostsPage(p=>p+1)} className="rounded-xl border border-gray-700 px-3 py-2">Next →</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        {/* Leaderboard Ideas section - only show when tags selected */}
        {tags.length > 0 && (
          <div>
            <h2 className="text-lg text-white">Leaderboard for: {tags.join(", ")}</h2>
            {loading && <p className="text-gray-400">Loading...</p>}

            <div className="mt-3 grid gap-3">
              {results.map((r: any) => (
                <div key={r.idea._id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <Link to={`/ideas/${r.idea._id}`} className="text-white font-semibold text-lg">{r.idea.title}</Link>
                      <div className="text-sm text-gray-400">by {r.idea.author?.username || 'unknown'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-white font-bold text-lg">{r.score ?? 0}</div>
                      <div className="text-xs text-gray-400">{r.votes ?? 0} votes</div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button onClick={() => vote(r.idea._id, 1)} className="rounded-xl border border-green-700 px-3 py-1 text-sm text-green-200">支持</button>
                    <button onClick={() => vote(r.idea._id, -1)} className="rounded-xl border border-red-700 px-3 py-1 text-sm text-red-200">反对</button>
                  </div>
                </div>
              ))}

              {!loading && results.length === 0 && (
                <div>
                  <p className="text-gray-400">No ideas in this leaderboard yet. You can create the first one or adjust tags.</p>
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))} className="rounded-xl border border-gray-700 px-3 py-2">← Prev</button>
              <div className="text-sm text-gray-400">Page <span className="text-white">{page}</span> · Total <span className="text-white">{Math.ceil(total/limit) || 1}</span></div>
              <button disabled={page >= Math.max(1, Math.ceil(total/limit || 1))} onClick={() => setPage(p => p+1)} className="rounded-xl border border-gray-700 px-3 py-2">Next →</button>
            </div>
          </div>
        )}

        {/* No leaderboard prompt - show on home when no tags selected */}
        {tags.length === 0 && (
          <div>
            <h2 className="text-lg text-white">Global Leaderboard</h2>
            <div className="mt-3 grid gap-3">
              {recentBoards.length === 0 ? (
                <div className="text-gray-500">No persisted leaderboards yet.</div>
              ) : (
                recentBoards.map((b: any) => (
                  <div key={b.tagsKey} className="rounded-xl border border-gray-800 p-3 bg-gray-950/30">
                    <div className="text-sm text-gray-300">{(b.tags || []).join(", ") || "global"}</div>
                    <div className="text-xs text-gray-400 mt-1">{(b.entries || []).slice(0,3).map((e:any)=>e.idea? e.idea.title : "- ").join(" · ")}</div>
                    <div className="mt-2 flex gap-2">
                      <button onClick={() => { nav(`/tag-rank?tags=${encodeURIComponent((b.tags||[]).join(","))}`); }} className="text-sm px-2 py-1 rounded-full border border-gray-700">View</button>
                      <button onClick={() => { nav(`/tag-rank?tags=${encodeURIComponent((b.tags||[]).join(","))}`); }} className="text-sm px-2 py-1 rounded-full border border-gray-700">Open</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
