import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { Link } from "react-router-dom";

export default function TagRankPage() {
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadRank(t: string[]) {
    try {
      setLoading(true);
      const qs = new URLSearchParams();
      if (t.length) qs.set("tags", t.join(","));
      const res = await apiFetch(`/api/tag-rank?${qs.toString()}`);
      setResults(res.results || []);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // load empty list by default
    loadRank([]);
  }, []);

  function applyTags() {
    const arr = tagsInput.split(",").map(s => s.trim()).filter(Boolean).map(s=>s.toLowerCase());
    setTags(arr);
    loadRank(arr);
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

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-white">Tag Rank</h1>
      <p className="text-gray-400 text-sm mt-1">Pick tags to form a custom leaderboard.</p>

      <div className="mt-4 grid gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <input className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
          placeholder="tags, comma separated (e.g. novel,dark)"
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
        />
        <div className="flex gap-2">
          <button onClick={applyTags} className="rounded-xl bg-white text-black px-3 py-2 font-semibold">Apply</button>
          <button onClick={() => { setTagsInput(""); setTags([]); loadRank([]); }} className="rounded-xl border border-gray-700 px-3 py-2">Clear</button>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-lg text-white">{tags.length ? `Leaderboard for: ${tags.join(", ")}` : "Global Leaderboard"}</h2>
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

          {results.length === 0 && !loading && (
            <p className="text-gray-400">No ideas in this leaderboard yet. You can create the first one or adjust tags.</p>
          )}
        </div>
      </div>
    </div>
  );
}
