import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { listLocalIdeas } from "../utils/localIdeas";

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
  const [localIdeas, setLocalIdeas] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [likedIdeas, setLikedIdeas] = useState<any[]>([]);
  const [bookmarkedIdeas, setBookmarkedIdeas] = useState<any[]>([]);
  const [bookmarkedLeaderboards, setBookmarkedLeaderboards] = useState<any[]>([]);
  const [receivedInterests, setReceivedInterests] = useState<any[]>([]);
  const [publicUsed, setPublicUsed] = useState(0);
  const FREE_PUBLIC_LIMIT = Number((import.meta as any).env?.VITE_FREE_PUBLIC_IDEA_LIMIT) || 5;

  async function load() {
    try {
      setErr("");
      setLoading(true);
      const res = await apiFetch<{ ideas: Idea[] }>("/api/ideas/mine");
      setIdeas(res.ideas || []);
      const used = (res.ideas || []).filter((i) => i.visibility === "public").length;
      setPublicUsed(used);
      // load local private ideas from browser
      setLocalIdeas(listLocalIdeas());
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg); // 可选

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
        const b = await apiFetch<{ ideas: any[]; leaderboards: any[] }>("/api/me/bookmarks");
        setBookmarkedIdeas(b.ideas || []);
        setBookmarkedLeaderboards(b.leaderboards || []);
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

      {user && user.role !== "company" && user.role !== "admin" && (
        <div className="mt-3 p-3 rounded-xl bg-gray-900 border border-gray-800 text-sm text-gray-300">
          Public ideas: <span className="text-white font-semibold">{publicUsed}</span> / <span className="text-white font-semibold">{FREE_PUBLIC_LIMIT}</span>
          {publicUsed >= FREE_PUBLIC_LIMIT && (
            <div className="mt-3 p-3 rounded-lg bg-red-950 border border-red-800 text-sm text-red-200 flex items-center justify-between">
              <div>
                You have reached your public idea limit. Delete an existing public idea or upgrade to publish more.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const el = document.getElementById("my-ideas");
                    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className="rounded-xl border border-red-700 px-3 py-2 text-sm bg-transparent"
                >
                  Manage ideas
                </button>
                <a href="/company" className="rounded-xl bg-white text-black px-3 py-2 text-sm font-semibold">Upgrade</a>
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <p className="text-gray-300 mt-6">Loading...</p>}
      {err && <p className="text-red-400 mt-6">Error: {err}</p>}

      {/* ================= 我的 Ideas ================= */}
      <h2 id="my-ideas" className="text-xl font-semibold text-white mt-6">My Ideas</h2>

      <div className="mt-3 grid gap-3">
        {localIdeas.map((it) => (
          <Link
            key={it._id}
            to={`/ideas/${it._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold">{it.title}</h3>
              <span className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">visibility: private (local)</p>
              <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">Local</span>
            </div>
          </Link>
        ))}

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
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">visibility: {it.visibility}</p>
              <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">Server</span>
            </div>
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

      <h3 className="text-lg font-semibold text-white mt-4">Ideas</h3>
      <div className="mt-3 grid gap-3">
        {bookmarkedIdeas.length === 0 && (
          <p className="text-gray-400">No idea bookmarks yet.</p>
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

      <h3 className="text-lg font-semibold text-white mt-6">Leaderboards</h3>
      <div className="mt-3 grid gap-3">
        {bookmarkedLeaderboards.length === 0 && (
          <p className="text-gray-400">No leaderboard bookmarks yet.</p>
        )}

        {bookmarkedLeaderboards.map((lb) => (
          <Link
            key={lb._id}
            to={`/leaderboard/${lb._id}`}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex justify-between">
              <span className="text-white font-semibold">
                {lb.tags?.join(", ") || "Leaderboard"}
              </span>
              <span className="text-xs text-gray-500">
                {lb.author?.username || "unknown"}
              </span>
            </div>
            <p className="text-gray-300 mt-1 text-sm">
              {lb.entries?.length || 0} nominations
            </p>
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
