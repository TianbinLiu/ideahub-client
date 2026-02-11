import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";

type Idea = {
  _id: string;
  title: string;
  summary: string;
  visibility: string;
  createdAt: string;
};

export default function MePage() {
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [likedIdeas, setLikedIdeas] = useState<any[]>([]);
  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<any[]>([]);
  const [receivedInterests, setReceivedInterests] = useState<any[]>([]);

  async function load() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ ideas: Idea[] }>("/api/ideas/mine");
      setIdeas(res.ideas || []);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    (async () => {
      try {
        const a = await apiFetch<{ ideas: any[] }>("/api/me/likes");
        setLikedIdeas(a.ideas || []);
        const b = await apiFetch<{ ideas: any[] }>("/api/me/bookmarks");
        setBookmarkedIdeas(b.ideas || []);
      } catch (e: any) {
        // 你也可以把错误显示出来，这里先忽略
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ interests: any[] }>("/api/me/received-interests");
        setReceivedInterests(res.interests || []);
      } catch { }
    })();
  }, []);

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Me</h1>
      <p className="text-gray-400 text-sm mt-1">{user?.email}</p>

      {loading && <p className="text-gray-300 mt-6">Loading...</p>}
      {err && <p className="text-red-400 mt-6">Error: {err}</p>}

      {/* ================= 我的 Ideas ================= */}
      <h2 className="text-xl font-semibold text-white mt-6">My Ideas</h2>

      <div className="mt-3 grid gap-3">
        {ideas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{it.title}</h3>
              <span className="text-xs text-gray-500">
                {new Date(it.createdAt).toLocaleString()}
              </span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
            <p className="text-xs text-gray-500 mt-2">
              visibility: {it.visibility}
            </p>
          </Link>
        ))}

        {!loading && ideas.length === 0 && (
          <p className="text-gray-400">No ideas yet.</p>
        )}
      </div>

      {/* ================= My Likes ================= */}
      <h2 className="text-xl font-semibold text-white mt-10">My Likes</h2>

      <div className="mt-3 grid gap-3">
        {likedIdeas.length === 0 && (
          <p className="text-gray-400">No liked ideas yet.</p>
        )}

        {likedIdeas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex justify-between">
              <span className="text-white font-semibold">{it.title}</span>
              <span className="text-xs text-gray-500">
                {it.author?.username || "unknown"}
              </span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
          </Link>
        ))}
      </div>

      {/* ================= My Bookmarks ================= */}
      <h2 className="text-xl font-semibold text-white mt-10">My Bookmarks</h2>

      <div className="mt-3 grid gap-3">
        {bookmarkedIdeas.length === 0 && (
          <p className="text-gray-400">No bookmarks yet.</p>
        )}

        {bookmarkedIdeas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex justify-between">
              <span className="text-white font-semibold">{it.title}</span>
              <span className="text-xs text-gray-500">
                {it.author?.username || "unknown"}
              </span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
          </Link>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-white mt-10">Received Interests</h2>
      <div className="mt-3 grid gap-3">
        {receivedInterests.length === 0 && (
          <p className="text-gray-400">No company interests yet.</p>
        )}

        {receivedInterests.map((r) => (
          <div key={r._id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="flex items-center justify-between">
              <div className="text-white font-semibold">
                Idea: {r.idea?.title || "unknown"}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>

            <div className="text-sm text-gray-300 mt-2">
              Company: <span className="text-white">{r.companyUser?.username}</span>{" "}
              <span className="text-gray-500">({r.companyUser?.email})</span>
            </div>

            {r.message && (
              <pre className="mt-2 text-gray-200 whitespace-pre-wrap font-sans">
                {r.message}
              </pre>
            )}
          </div>
        ))}
      </div>

    </div>
  );

}
