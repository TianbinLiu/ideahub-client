/**
 * @file ScenarioGalleryPage.tsx - 情景模拟画廊
 * @category Page
 * @route /arena/simulate
 * @i18n none（页面内容以中文为主，与 GroupsPage / ArenaPage 一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 公开画廊：sort tab（for_you/new/hot）+ 关键词/标签搜索 + 分页
 * - 卡片展示封面/标题/简介/平台徽标/👀点赞/收藏统计
 * - “创建情景” -> /arena/simulate/new；“我的情景” 切换到当前用户作品
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { listMyScenarios, listScenarios, type ScenarioCard } from "../api";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";

type SortKey = "for_you" | "new" | "hot";
type ViewKey = SortKey | "mine";

const SORT_TABS: { key: SortKey; labelKey: string }[] = [
  { key: "for_you", labelKey: "sortRecommended" },
  { key: "new", labelKey: "sortLatest" },
  { key: "hot", labelKey: "sortTrending" },
];

const PLATFORM_META: Record<string, { labelKey: string; className: string }> = {
  bilibili: { labelKey: "platformBilibili", className: "border-pink-600/60 bg-pink-950/30 text-pink-200" },
  weibo: { labelKey: "platformWeibo", className: "border-orange-600/60 bg-orange-950/30 text-orange-200" },
  tieba: { labelKey: "platformTieba", className: "border-blue-600/60 bg-blue-950/30 text-blue-200" },
  zhihu: { labelKey: "platformZhihu", className: "border-sky-600/60 bg-sky-950/30 text-sky-200" },
  instagram: { labelKey: "platformInstagram", className: "border-fuchsia-600/60 bg-fuchsia-950/30 text-fuchsia-200" },
  // 补齐抖音/小红书徽标，否则这两个平台的情景会落到 generic 被误标为「通用」
  douyin: { labelKey: "platformDouyin", className: "border-cyan-600/60 bg-cyan-950/30 text-cyan-200" },
  xiaohongshu: { labelKey: "platformXiaohongshu", className: "border-red-600/60 bg-red-950/30 text-red-200" },
  generic: { labelKey: "platformGeneric", className: "border-gray-600/60 bg-gray-900 text-gray-300" },
};

function platformMeta(platform: string) {
  return PLATFORM_META[platform] || PLATFORM_META.generic;
}

function PlatformBadge({ platform }: { platform: string }) {
  const { t } = useTranslation();
  const meta = platformMeta(platform);
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}>
      {t(`arena.scenario.${meta.labelKey}`)}
    </span>
  );
}

function ScenarioGrid({ items }: { items: ScenarioCard[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((sc) => (
        <Link
          key={sc._id}
          to={`/arena/simulate/${sc._id}`}
          className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 hover:bg-gray-900/70"
        >
          <div className="h-36 bg-gray-800">
            {sc.coverImageUrl ? (
              <img src={sc.coverImageUrl} alt={sc.title} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-sm text-gray-500">{t("arena.scenario.noCover")}</div>
            )}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-1 font-semibold text-white">{sc.title}</h3>
              <PlatformBadge platform={sc.platform} />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-gray-300">{sc.summary || t("arena.scenario.noSummary")}</p>
            {(sc.tags || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-cyan-200">
                {(sc.tags || []).slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-3 text-xs text-gray-400">
              👀 {sc.stats?.viewCount || 0} · ❤️ {sc.stats?.likeCount || 0} · 🔖 {sc.stats?.bookmarkCount || 0}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function ScenarioGalleryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const rawView = (params.get("view") || "for_you") as ViewKey;
  // 未登录时「我的情景」需要鉴权，直接访问 ?view=mine 会打鉴权端点报 401 并卡在空态；平滑回退到默认视图
  const view: ViewKey = rawView === "mine" && !user ? "for_you" : rawView;
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);

  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res =
          view === "mine"
            ? await listMyScenarios({ page, limit: 12 })
            : await listScenarios({ sort: view, q, tag, page, limit: 12 });
        if (!mounted) return;
        setScenarios(res.scenarios || []);
        setTotalPages(res.totalPages || 1);
      } catch (e: any) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [view, q, tag, page]);

  function setView(nextView: ViewKey) {
    const next = new URLSearchParams(params);
    next.set("view", nextView);
    next.set("page", "1");
    setParams(next);
  }

  function submitSearch() {
    const next = new URLSearchParams(params);
    next.set("page", "1");
    if (searchInput.trim()) next.set("q", searchInput.trim());
    else next.delete("q");
    // 关键词搜索时回到市场视图
    if (view === "mine") next.set("view", "for_you");
    setParams(next);
  }

  function clearTag() {
    const next = new URLSearchParams(params);
    next.delete("tag");
    next.set("page", "1");
    setParams(next);
  }

  function goPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("arena.scenario.pageTitle")}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.scenario.pageSubtitle")}
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/arena/simulate/new")}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
        >
          <Plus className="h-4 w-4" /> {t("arena.scenario.createScenario")}
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {SORT_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  view === tab.key ? "border-white text-white" : "border-gray-700 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {t(`arena.scenario.${tab.labelKey}`)}
              </button>
            ))}
            {user && (
              <button
                type="button"
                onClick={() => setView("mine")}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  view === "mine" ? "border-cyan-400 text-cyan-200" : "border-gray-700 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {t("arena.scenario.myScenarios")}
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
              placeholder={t("arena.scenario.searchPlaceholder")}
            />
            <button
              type="button"
              onClick={submitSearch}
              className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t("arena.scenario.search")}
            </button>
          </div>
        </div>

        {tag && view !== "mine" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <span>{t("arena.scenario.tagFilter")}</span>
            <button
              type="button"
              onClick={clearTag}
              className="rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2 py-0.5 text-cyan-200 hover:bg-cyan-950/50"
            >
              #{tag} ✕
            </button>
          </div>
        )}

        {loading && <p className="mt-4 text-sm text-gray-400">{t("arena.scenario.loading")}</p>}
        {!loading && scenarios.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">
              {view === "mine" ? t("arena.scenario.emptyMine") : t("arena.scenario.emptyGallery")}
            </p>
          </div>
        )}

        {!loading && scenarios.length > 0 && <ScenarioGrid items={scenarios} />}

        {!loading && scenarios.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("arena.scenario.previous")}
            </button>
            <span className="text-sm text-gray-400">
              {t("arena.scenario.pageInfo", { page, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("arena.scenario.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
