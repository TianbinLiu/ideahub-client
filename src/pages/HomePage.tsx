import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type Idea = {
  _id: string;
  title: string;
  summary: string;
  tags: string[];
  createdAt: string;
  author?: { username: string; role: string };
  stats?: { likeCount?: number; viewCount?: number };
};

export default function HomePage() {
  const [params, setParams] = useSearchParams();
  const sort = params.get("sort") || "new";
  const keyword = params.get("keyword") || "";
  const tag = params.get("tag") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10), 1);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [keywordInput, setKeywordInput] = useState(keyword);
  const [tagInput, setTagInput] = useState(tag);

  async function load() {
    try {
      setErr("");
      setLoading(true);

      const qs = new URLSearchParams({
        sort,
        keyword,
        tag,
        page: String(page),
        limit: "10",
      });

      const res = await apiFetch<{
        ideas: Idea[];
        totalPages: number;
        total: number;
      }>(`/api/ideas?${qs.toString()}`);

      setIdeas(res.ideas || []);
      setTotalPages(res.totalPages || 1);
    } catch (e: any) {
      const msg = humanizeError(e);
      toast.error(msg);
      setErr(msg); // 可选

    } finally {
      setLoading(false);
    }
  }


  useEffect(() => {
    load();
  }, [sort]);

  useEffect(() => {
    setKeywordInput(keyword);
    setTagInput(tag);
  }, [keyword, tag]);

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Public Ideas</h1>
          <p className="text-gray-400 text-sm mt-1">Browse ideas shared by creators.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setParams({ sort: "new" })}
            className={`rounded-xl border px-3 py-1.5 text-sm ${sort === "new" ? "border-white text-white" : "border-gray-700 text-gray-300"
              }`}
          >
            New
          </button>
          <button
            onClick={() => setParams({ sort: "hot" })}
            className={`rounded-xl border px-3 py-1.5 text-sm ${sort === "hot" ? "border-white text-white" : "border-gray-700 text-gray-300"
              }`}
          >
            Hot
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <input
          className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-2 text-sm"
          placeholder="Search keyword..."
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
        />

        <input
          className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-2 text-sm"
          placeholder="Filter tag (e.g. demo)"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
        />

        <button
          className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("page", "1");

            keywordInput.trim()
              ? next.set("keyword", keywordInput.trim())
              : next.delete("keyword");

            tagInput.trim()
              ? next.set("tag", tagInput.trim())
              : next.delete("tag");

            setParams(next);
          }}
        >
          Apply
        </button>
      </div>


      {loading && <p className="text-gray-300 mt-6">Loading...</p>}
      {err && <p className="text-red-400 mt-6">Error: {err}</p>}

      <div className="mt-6 grid gap-3">
        {!loading && ideas.length === 0 && <p className="text-gray-400">No public ideas yet.</p>}

        {ideas.map((it) => (
          <Link
            to={`/ideas/${it._id}`}
            key={it._id}
            className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-white font-semibold">{it.title}</h2>
              <span className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</span>
            </div>
            {it.summary && <p className="text-gray-300 mt-1">{it.summary}</p>}

            <div className="flex flex-wrap gap-2 mt-3 text-xs text-gray-400">
              <span className="px-2 py-1 rounded-full border border-gray-800">
                {it.author?.username || "unknown"}
              </span>
              {(it.tags || []).map((t) => (
                <span key={t} className="px-2 py-1 rounded-full border border-gray-800">
                  #{t}
                </span>
              ))}
              <span className="ml-auto text-gray-500">
                ❤️ {it.stats?.likeCount ?? 0} · 👀 {it.stats?.viewCount ?? 0}
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          className="rounded-xl border border-gray-700 px-3 py-2 text-sm disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("page", String(page - 1));
            setParams(next);
          }}
        >
          ← Prev
        </button>

        <div className="text-sm text-gray-400">
          Page <span className="text-white">{page}</span> / {totalPages}
        </div>

        <button
          className="rounded-xl border border-gray-700 px-3 py-2 text-sm disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("page", String(page + 1));
            setParams(next);
          }}
        >
          Next →
        </button>
      </div>

    </div>
  );
}
