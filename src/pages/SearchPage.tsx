import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, type Idea } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { getPlatformIcon } from "../utils/platformConfig";

type IdeaTypeKey = "business" | "feedback" | "external" | "daily" | "dynamic";
type SortKey = "recommended" | "new" | "hot";

const IDEA_TYPE_OPTIONS: Array<{ key: IdeaTypeKey; emoji: string; activeClass: string; inactiveClass: string }> = [
  { key: "business", emoji: "💼", activeClass: "border-emerald-400/70 bg-emerald-500/20 text-emerald-100", inactiveClass: "border-emerald-800/50 text-emerald-200/80 hover:bg-emerald-950/30" },
  { key: "feedback", emoji: "🛠", activeClass: "border-sky-400/70 bg-sky-500/20 text-sky-100", inactiveClass: "border-sky-800/50 text-sky-200/80 hover:bg-sky-950/30" },
  { key: "external", emoji: "🔗", activeClass: "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100", inactiveClass: "border-fuchsia-800/50 text-fuchsia-200/80 hover:bg-fuchsia-950/30" },
  { key: "daily", emoji: "📝", activeClass: "border-amber-400/70 bg-amber-500/20 text-amber-100", inactiveClass: "border-amber-800/50 text-amber-200/80 hover:bg-amber-950/30" },
  { key: "dynamic", emoji: "📣", activeClass: "border-cyan-400/70 bg-cyan-500/20 text-cyan-100", inactiveClass: "border-cyan-800/50 text-cyan-200/80 hover:bg-cyan-950/30" },
];

function isIdeaTypeKey(value: string): value is IdeaTypeKey {
  return IDEA_TYPE_OPTIONS.some((item) => item.key === value);
}

export default function SearchPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const sort = (params.get("sort") || "recommended") as SortKey;
  const q = params.get("q") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10), 1);
  const groupSlug = (params.get("group") || "world").trim().toLowerCase() || "world";
  const rawIdeaType = params.get("ideaType") || "";
  const selectedIdeaTypes = useMemo(() => {
    const raw = params.get("ideaTypes") || rawIdeaType || "";
    return Array.from(new Set(raw.split(",").map((item) => item.trim()).filter(isIdeaTypeKey)));
  }, [params, rawIdeaType]);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    if (!rawIdeaType || !isIdeaTypeKey(rawIdeaType)) return;
    const next = new URLSearchParams(params);
    next.delete("ideaType");
    next.set("ideaTypes", rawIdeaType);
    next.set("page", "1");
    setParams(next, { replace: true });
  }, [rawIdeaType, params, setParams]);

  useEffect(() => {
    async function load() {
      try {
        setErr("");
        setLoading(true);
        const qs = new URLSearchParams({ sort, q, page: String(page), limit: "12", group: groupSlug });
        if (selectedIdeaTypes.length > 0) qs.set("ideaTypes", selectedIdeaTypes.join(","));
        const res = await apiFetch<{ ideas: Idea[]; totalPages: number }>(`/api/ideas?${qs.toString()}`);
        setIdeas(res.ideas || []);
        setTotalPages(res.totalPages || 1);
      } catch (e: any) {
        const msg = humanizeError(e);
        setErr(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [sort, q, page, groupSlug, selectedIdeaTypes.join(",")]);

  function updateSort(nextSort: SortKey) {
    const next = new URLSearchParams(params);
    if (sort === nextSort) next.delete("sort");
    else next.set("sort", nextSort);
    next.set("page", "1");
    setParams(next);
  }

  function toggleIdeaType(nextType: IdeaTypeKey) {
    const next = new URLSearchParams(params);
    next.delete("ideaType");
    const current = new Set(selectedIdeaTypes);
    if (current.has(nextType)) current.delete(nextType);
    else current.add(nextType);
    const values = Array.from(current);
    if (values.length > 0) next.set("ideaTypes", values.join(","));
    else next.delete("ideaTypes");
    next.set("page", "1");
    setParams(next);
  }

  function clearIdeaTypes() {
    const next = new URLSearchParams(params);
    next.delete("ideaType");
    next.delete("ideaTypes");
    next.set("page", "1");
    setParams(next);
  }

  function getIdeaTypeOption(type?: string) {
    return IDEA_TYPE_OPTIONS.find((item) => item.key === type);
  }

  function getIdeaTypeTitle(type?: string) {
    if (!type || !isIdeaTypeKey(type)) return "";
    return t(`idea.createMode${type.charAt(0).toUpperCase()}${type.slice(1)}Title`);
  }

  return (
    <div className="mx-auto max-w-6xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3" data-tour="search-filters">
        <div className="flex flex-wrap gap-2">
          {(["new", "hot"] as SortKey[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => updateSort(item)}
              className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${sort === item ? "border-white text-white" : "border-gray-700 text-gray-300 hover:bg-gray-800"}`}
            >
              {item === "new" ? t("home.new") : t("home.hot")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" data-tour="search-category-tags">
          {IDEA_TYPE_OPTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => toggleIdeaType(item.key)}
              className={`rounded-full border px-3 py-1 text-xs transition ${selectedIdeaTypes.includes(item.key) ? item.activeClass : item.inactiveClass}`}
            >
              {item.emoji} {getIdeaTypeTitle(item.key)}
            </button>
          ))}
          {selectedIdeaTypes.length > 0 ? (
            <button type="button" onClick={clearIdeaTypes} className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800">
              {t("common.clearFilters")}
            </button>
          ) : null}
        </div>
      </div>

      {loading && <p className="mt-6 text-sm text-gray-400">{t("common.loading")}</p>}
      {err && <p className="mt-6 text-sm text-red-400">{t("common.error")}: {err}</p>}

      <div className="mt-5 grid gap-3" data-tour="search-results">
        {!loading && ideas.length === 0 ? <p className="text-sm text-gray-400">{q ? t("home.noSearchTagIdeas") : t("home.noPublicIdeas")}</p> : null}
        {ideas.map((idea) => {
          const option = getIdeaTypeOption(idea.ideaType);
          return (
            <Link key={idea._id} to={`/ideas/${idea._id}`} className="rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-white">{idea.title}</h2>
                  {idea.summary ? <p className="mt-1 text-sm text-gray-300">{idea.summary}</p> : null}
                </div>
                <span className="text-xs text-gray-500">{idea.createdAt ? new Date(idea.createdAt).toLocaleString() : ""}</span>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
                {idea.ideaType ? (
                  <span className={`rounded-full border px-2.5 py-1 font-semibold ${option?.activeClass || "border-gray-700 text-gray-200"}`}>
                    {option?.emoji} {getIdeaTypeTitle(idea.ideaType)}
                  </span>
                ) : null}
                {idea.externalSource ? (
                  <span className="rounded-full border border-purple-700 bg-purple-900/20 px-2.5 py-1 text-purple-300">
                    {getPlatformIcon(idea.externalSource.platform)} {idea.externalSource.platform}
                  </span>
                ) : (
                  <span className="rounded-full border border-gray-700 px-2.5 py-1">{idea.author?.username || t("home.unknownAuthor")}</span>
                )}
                <span className="rounded-full border border-cyan-700/60 bg-cyan-950/20 px-2.5 py-1 text-cyan-200">#{idea.groupName || idea.groupSlug || "world"}</span>
                {(idea.tags || []).slice(0, 8).map((tag) => <span key={tag} className="rounded-full border border-gray-700 px-2.5 py-1">#{tag}</span>)}
                <span className="ml-auto text-gray-400">❤️ {idea.stats?.likeCount ?? 0} · 👀 {idea.stats?.viewCount ?? 0}</span>
              </div>
            </Link>
          );
        })}
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
          {t("home.prev")}
        </button>
        <div className="text-sm text-gray-400">{t("home.page")} <span className="text-white">{page}</span> / {totalPages}</div>
        <button
          className="rounded-xl border border-gray-700 px-3 py-2 text-sm disabled:opacity-50"
          disabled={page >= totalPages}
          onClick={() => {
            const next = new URLSearchParams(params);
            next.set("page", String(page + 1));
            setParams(next);
          }}
        >
          {t("home.next")}
        </button>
      </div>
    </div>
  );
}
