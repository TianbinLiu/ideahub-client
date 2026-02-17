import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
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
  const q = params.get("q") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10), 1);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [searchInput, setSearchInput] = useState(q);
  const [suggestions, setSuggestions] = useState<Array<{ type: string; text: string; id?: string }>>([]);
  const [highlight, setHighlight] = useState(-1);
  const [recentTags, setRecentTags] = useState<string[]>([]);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const suggRef = useRef<HTMLDivElement | null>(null);

  // debounce timer
  const suggTimer = useRef<any>(null);

  async function load() {
    try {
      setErr("");
      setLoading(true);

      const qs = new URLSearchParams({
        sort,
        q,
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
  }, [sort, q, page]);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    loadRecentTags();
  }, []);

  // fetch suggestions for tags and idea titles
  function fetchSuggestionsDebounced(v: string) {
    if (suggTimer.current) clearTimeout(suggTimer.current);
    suggTimer.current = setTimeout(async () => {
      try {
        const token = v.trim();
        if (!token) return setSuggestions([]);
        const [tagsRes, ideasRes] = await Promise.all([
          apiFetch(`/api/tag-rank/suggest?q=${encodeURIComponent(token)}`).catch(() => ({ tags: [] })),
          apiFetch(`/api/ideas/suggest?q=${encodeURIComponent(token)}`).catch(() => ({ ideas: [] })),
        ]);
        const tagSug = (tagsRes.tags || []).slice(0, 6).map((t: string) => ({ type: "tag", text: t }));
        const ideaSug = (ideasRes.ideas || []).slice(0, 6).map((it: any) => ({ type: "idea", text: it.title, id: it.id }));
        setSuggestions([...tagSug, ...ideaSug]);
        setHighlight(-1);
      } catch (e) {
        // ignore
      }
    }, 180);
  }

  function replaceLastTokenWith(input: string, replacement: string) {
    // replace last comma/space separated token
    const parts = input.split(/([,\s]+)/);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!parts[i].match(/^[,\s]+$/)) {
        parts[i] = replacement;
        return parts.join("");
      }
    }
    return replacement;
  }

  function loadRecentTags() {
    try {
      const raw = localStorage.getItem("recentSearchTags");
      if (!raw) return setRecentTags([]);
      const parsed = JSON.parse(raw || "[]");
      if (Array.isArray(parsed)) setRecentTags(parsed.slice(0, 12));
    } catch (e) {
      setRecentTags([]);
    }
  }

  function persistRecentTags(tags: string[]) {
    try {
      localStorage.setItem("recentSearchTags", JSON.stringify(tags.slice(0, 12)));
    } catch (e) {}
  }

  function updateRecentTagsFromInput(input: string) {
    const parts = input.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    const normalized = parts.map(s => s.toLowerCase());
    const merged = [...normalized, ...recentTags.filter(t => !normalized.includes(t))].slice(0, 12);
    setRecentTags(merged);
    persistRecentTags(merged);
  }


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
        <div className="relative">
          <input
            className="rounded-xl bg-gray-900 border border-gray-800 px-3 py-2 text-sm w-full"
            placeholder="Search tags or keywords (e.g. novel, dark or roguelike)"
            value={searchInput}
            onChange={(e) => { setSearchInput(e.target.value); fetchSuggestionsDebounced(e.target.value); }}
            ref={inputRef}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min((suggestions.length || 0) - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(-1, h - 1));
              } else if (e.key === "Enter") {
                if (highlight >= 0 && suggestions[highlight]) {
                  const s = suggestions[highlight];
                  if (s.type === "idea" && s.id) {
                    nav(`/ideas/${s.id}`);
                  } else if (s.type === "tag") {
                    setSearchInput(prev => replaceLastTokenWith(prev, s.text));
                  }
                  setSuggestions([]);
                  e.preventDefault();
                } else {
                  // trigger search
                    const next = new URLSearchParams(params);
                    next.set("page", "1");
                    if (searchInput.trim()) {
                      next.set("q", searchInput.trim());
                      updateRecentTagsFromInput(searchInput);
                    } else next.delete("q");
                    setParams(next);
                }
              } else if (e.key === "Tab") {
                if (highlight >= 0 && suggestions[highlight]) {
                  e.preventDefault();
                  const s = suggestions[highlight];
                  if (s.type === "idea" && s.id) {
                    nav(`/ideas/${s.id}`);
                  } else if (s.type === "tag") {
                    setSearchInput(prev => replaceLastTokenWith(prev, s.text));
                  }
                  setSuggestions([]);
                }
              }
            }}
          />

          {suggestions.length > 0 && (
            <div ref={suggRef} className="absolute mt-2 left-0 w-full bg-gray-900 border border-gray-800 rounded-xl z-50">
              {suggestions.map((s, idx) => (
                <div key={`${s.type}-${s.text}-${s.id || ""}`}
                  className={`px-3 py-2 cursor-pointer ${idx === highlight ? "bg-gray-800" : ""}`}
                  onMouseEnter={() => setHighlight(idx)}
                  onMouseLeave={() => setHighlight(-1)}
                  onClick={() => {
                    if (s.type === "idea" && s.id) nav(`/ideas/${s.id}`);
                    else setSearchInput(prev => replaceLastTokenWith(prev, s.text));
                    setSuggestions([]);
                  }}
                >
                  <div className="text-sm text-gray-200">{s.text}</div>
                  <div className="text-xs text-gray-500">{s.type === "tag" ? "tag suggestion" : "idea title"}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          {recentTags.length === 0 ? (
            <div className="text-gray-500 text-sm">热门标签会在你搜索后出现</div>
          ) : (
            recentTags.map((t) => (
              <button
                key={t}
                className="px-3 py-1 rounded-full border border-gray-700 text-sm text-gray-300 hover:bg-gray-800"
                onClick={() => {
                  setSearchInput(prev => {
                    const tokens = prev.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
                    if (tokens.length === 0) return t;
                    const last = tokens[tokens.length - 1].toLowerCase();
                    if (last === t.toLowerCase()) return prev;
                    return prev.trim() ? prev.trim() + ", " + t : t;
                  });
                  inputRef.current?.focus();
                }}
              >
                #{t}
              </button>
            ))
          )}
        </div>

        <button
          className="rounded-xl bg-white text-black px-4 py-2 text-sm font-semibold"
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("page", "1");

            if (searchInput.trim()) {
              next.set("q", searchInput.trim());
              updateRecentTagsFromInput(searchInput);
            } else next.delete("q");

            setParams(next);
          }}
        >
          Search
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
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">{new Date(it.createdAt).toLocaleString()}</span>
                <span className="text-xs px-2 py-0.5 rounded-full border border-gray-700 text-gray-300">Server</span>
              </div>
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
