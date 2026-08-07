/**
 * @file PersonaGalleryPage.tsx - 人格下载 · 人格广场
 * @category Page
 * @route /arena/persona
 * @i18n none（页面内容以中文为主，与 ScenarioGalleryPage / ArenaPage 一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 公开画廊：scope tab（人格广场 all / 我的收藏 installed / 我发布的 mine）
 * - all 支持 最新(new)/最热(hot) 排序 + 关键词/标签搜索 + 分页
 * - 卡片展示 coverEmoji 大字 + name + 作者 + 🎭下载数 ❤️点赞数 + tags + 已装备/已收藏 徽标
 * - “发布人格” -> /arena/persona/new
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { listPersonas, type Persona } from "../api";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import PersonaCover from "../components/PersonaCover";

type Scope = "all" | "installed" | "mine";
type Sort = "new" | "hot";

const SCOPE_TABS: { key: Scope; labelKey: string; auth?: boolean }[] = [
  { key: "all", labelKey: "scopeAll" },
  { key: "installed", labelKey: "scopeInstalled", auth: true },
  { key: "mine", labelKey: "scopeMine", auth: true },
];

const SORT_TABS: { key: Sort; labelKey: string }[] = [
  { key: "new", labelKey: "sortNew" },
  { key: "hot", labelKey: "sortHot" },
];

function authorName(author: Persona["author"]) {
  if (!author) return "-";
  return typeof author === "string" ? author : author.username || "-";
}

function PersonaGrid({ items, onTagClick }: { items: Persona[]; onTagClick?: (tag: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => (
        <Link
          key={p._id}
          to={`/arena/persona/${p._id}`}
          className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
        >
          <div className="flex items-start gap-3">
            <PersonaCover emoji={p.coverEmoji} imageUrl={p.coverImageUrl} sizeClass="h-12 w-12" emojiClass="text-4xl" alt={p.name} />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 font-semibold text-white">{p.name}</h3>
                <div className="flex shrink-0 gap-1">
                  {p.equipped ? (
                    <span className="rounded-full border border-cyan-500/60 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">
                      {t("arena.persona.equipped")}
                    </span>
                  ) : p.installed ? (
                    <span className="rounded-full border border-gray-700 bg-gray-800/60 px-2 py-0.5 text-[11px] text-gray-300">
                      {t("arena.persona.saved")}
                    </span>
                  ) : null}
                </div>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{t("arena.persona.authorLabel", { name: authorName(p.author) })}</p>
            </div>
          </div>

          {p.description ? (
            <p className="mt-2 line-clamp-2 text-xs text-gray-300">{p.description}</p>
          ) : null}

          {(p.tags || []).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-cyan-200">
              {(p.tags || []).slice(0, 4).map((tag) =>
                onTagClick ? (
                  // 卡片整体是 <Link>，tag 点击要拦下冒泡/默认跳转，改为设置画廊的 tag 过滤
                  <button
                    key={tag}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onTagClick(tag);
                    }}
                    className="rounded-full border border-cyan-700/60 px-2 py-0.5 hover:border-cyan-400 hover:bg-cyan-500/10"
                  >
                    #{tag}
                  </button>
                ) : (
                  <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-0.5">
                    #{tag}
                  </span>
                )
              )}
            </div>
          )}

          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <span>🎭 {p.stats?.downloadCount || 0} · ❤️ {p.stats?.likeCount || 0}</span>
            {(p.price || 0) > 0 && (
              <span
                className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                  p.purchased || p.isOwner
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-600/60 bg-amber-950/30 text-amber-300"
                }`}
              >
                {p.purchased ? t("arena.persona.priceOwned") : `💰 ${p.price}`}
              </span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function PersonaGalleryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const rawScope = (params.get("scope") || "all") as Scope;
  // installed/mine 需登录，未登录一律当 all 处理
  const scope: Scope = !user && rawScope !== "all" ? "all" : rawScope;
  const sort = (params.get("sort") || "new") as Sort;
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);

  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await listPersonas({ scope, sort, q, tag, page, limit: 12 });
        if (!mounted) return;
        setPersonas(res.personas || []);
        setTotalPages(res.totalPages || 1);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [scope, sort, q, tag, page]);

  function setScope(nextScope: Scope) {
    const next = new URLSearchParams(params);
    next.set("scope", nextScope);
    next.set("page", "1");
    setParams(next);
  }

  function setSort(nextSort: Sort) {
    const next = new URLSearchParams(params);
    next.set("sort", nextSort);
    next.set("page", "1");
    setParams(next);
  }

  function submitSearch() {
    const next = new URLSearchParams(params);
    next.set("page", "1");
    if (searchInput.trim()) next.set("q", searchInput.trim());
    else next.delete("q");
    setParams(next);
  }

  function clearTag() {
    const next = new URLSearchParams(params);
    next.delete("tag");
    next.set("page", "1");
    setParams(next);
  }

  // 卡片上的 tag 点击 → 按该 tag 过滤（与 ?tag= 深链一致）
  function applyTag(nextTag: string) {
    const next = new URLSearchParams(params);
    next.set("tag", nextTag);
    next.set("page", "1");
    setParams(next);
  }

  function goPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  const visibleTabs = SCOPE_TABS.filter((t) => !t.auth || user);

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/arena" className="text-sm text-gray-400 hover:text-white">
            ← {t("arena.persona.backToArena")}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">{t("arena.persona.galleryTitle")}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.persona.galleryDescription")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/arena/persona/new")}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
        >
          <Plus className="h-4 w-4" /> {t("arena.persona.publishPersona")}
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {visibleTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setScope(tab.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  scope === tab.key ? "border-white text-white" : "border-gray-700 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {t(`arena.persona.${tab.labelKey}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
              placeholder={t("arena.persona.searchPlaceholder")}
            />
            <button
              type="button"
              onClick={submitSearch}
              className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t("arena.persona.search")}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {SORT_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSort(tab.key)}
              className={`rounded-lg border px-3 py-1 text-xs ${
                sort === tab.key ? "border-cyan-400 text-cyan-200" : "border-gray-700 text-gray-400 hover:bg-gray-800"
              }`}
            >
              {t(`arena.persona.${tab.labelKey}`)}
            </button>
          ))}
          {tag && (
            <div className="ml-1 flex items-center gap-2 text-xs text-gray-400">
              <span>{t("arena.persona.tagFilter")}</span>
              <button
                type="button"
                onClick={clearTag}
                className="rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2 py-0.5 text-cyan-200 hover:bg-cyan-950/50"
              >
                #{tag} ✕
              </button>
            </div>
          )}
        </div>

        {loading && <p className="mt-4 text-sm text-gray-400">{t("arena.persona.loading")}</p>}
        {!loading && personas.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">
              {scope === "mine"
                ? t("arena.persona.emptyMine")
                : scope === "installed"
                ? t("arena.persona.emptyInstalled")
                : t("arena.persona.emptyAll")}
            </p>
          </div>
        )}

        {!loading && personas.length > 0 && <PersonaGrid items={personas} onTagClick={applyTag} />}

        {!loading && personas.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("arena.persona.previous")}
            </button>
            <span className="text-sm text-gray-400">
              {t("arena.persona.pageInfo", { page, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("arena.persona.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
