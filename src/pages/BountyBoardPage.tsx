/**
 * @file BountyBoardPage.tsx - 赏金猎人 · 悬赏大厅
 * @category Page
 * @route /arena/bounty
 * @i18n none（页面内容以中文为主，与 ScenarioGalleryPage / ArenaPage 一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 公开悬赏大厅：sort(new/hot) + status 过滤 + 关键词搜索 + 分页
 * - 卡片展示标题 / 💰reward 点数 / 平台徽标 / 状态 / 👀view ✍submission 💬comment
 * - “发布悬赏” -> /arena/bounty/new；“我发布的” 切换到 listMyBounties
 *
 * 说明：赏金为平台虚拟点数，非真钱、不涉及任何真实支付/转账。
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Plus, Target } from "lucide-react";
import { listBounties, listMyBounties, type BountyCard } from "../api";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";

type SortKey = "new" | "hot";
type ViewKey = SortKey | "mine";

const SORT_TABS: { key: SortKey; labelKey: string }[] = [
  { key: "new", labelKey: "sortNew" },
  { key: "hot", labelKey: "sortHot" },
];

const STATUS_TABS: { value: string; labelKey: string }[] = [
  { value: "", labelKey: "statusAll" },
  { value: "open", labelKey: "statusOpen" },
  { value: "closed", labelKey: "statusClosed" },
  { value: "completed", labelKey: "statusCompleted" },
];

const PLATFORM_META: Record<string, { labelKey: string; className: string }> = {
  weibo: { labelKey: "platformWeibo", className: "border-orange-600/60 bg-orange-950/30 text-orange-200" },
  bilibili: { labelKey: "platformBilibili", className: "border-pink-600/60 bg-pink-950/30 text-pink-200" },
  tieba: { labelKey: "platformTieba", className: "border-blue-600/60 bg-blue-950/30 text-blue-200" },
  zhihu: { labelKey: "platformZhihu", className: "border-sky-600/60 bg-sky-950/30 text-sky-200" },
  douyin: { labelKey: "platformDouyin", className: "border-neutral-500/60 bg-neutral-900 text-neutral-200" },
  xiaohongshu: { labelKey: "platformXiaohongshu", className: "border-rose-600/60 bg-rose-950/30 text-rose-200" },
  instagram: { labelKey: "platformInstagram", className: "border-fuchsia-600/60 bg-fuchsia-950/30 text-fuchsia-200" },
  other: { labelKey: "platformOther", className: "border-gray-600/60 bg-gray-900 text-gray-300" },
};

const STATUS_META: Record<string, { labelKey: string; className: string }> = {
  open: { labelKey: "statusOpen", className: "border-emerald-600/60 bg-emerald-950/30 text-emerald-200" },
  closed: { labelKey: "statusClosed", className: "border-gray-600/60 bg-gray-900 text-gray-300" },
  completed: { labelKey: "statusCompleted", className: "border-cyan-600/60 bg-cyan-950/30 text-cyan-200" },
};

function platformMeta(platform: string) {
  return PLATFORM_META[platform] || PLATFORM_META.other;
}

function statusMeta(status: string) {
  return STATUS_META[status] || STATUS_META.open;
}

function BountyGrid({ items }: { items: BountyCard[] }) {
  const { t } = useTranslation();
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {items.map((b) => {
        const pm = platformMeta(b.platform);
        const sm = statusMeta(b.status);
        return (
          <Link
            key={b._id}
            to={`/arena/bounty/${b._id}`}
            className="flex flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 hover:bg-gray-900/70"
          >
            {b.coverImageUrl && (
              <img src={b.coverImageUrl} alt="" className="h-32 w-full object-cover" loading="lazy" />
            )}
            <div className="flex flex-1 flex-col p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 font-semibold text-white">{b.title}</h3>
              <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${sm.className}`}>
                {t(`arena.bounty.${sm.labelKey}`)}
              </span>
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-lg border border-amber-600/50 bg-amber-500/10 px-2.5 py-1 text-sm font-bold text-amber-200">
                💰 {t("arena.bounty.rewardPoints", { reward: b.reward })}
              </span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${pm.className}`}>
                {t(`arena.bounty.${pm.labelKey}`)}
              </span>
            </div>

            {(b.tags || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-cyan-200">
                {(b.tags || []).slice(0, 4).map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-0.5">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
              <span>👀 {b.stats?.viewCount || 0}</span>
              <span>✍ {b.stats?.submissionCount || 0}</span>
              <span>💬 {b.stats?.commentCount || 0}</span>
              <span className="ml-auto text-gray-500">
                {t("arena.bounty.approvedCount", { approved: b.approvedCount || 0, slots: b.slots })}
              </span>
            </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function BountyBoardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const rawView = (params.get("view") || "new") as ViewKey;
  // 未登录时「我发布的」需要鉴权，平滑回退到「最新」，避免 401 报错与误导空态
  const view: ViewKey = rawView === "mine" && !user ? "new" : rawView;
  const status = params.get("status") || "";
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);

  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [bounties, setBounties] = useState<BountyCard[]>([]);
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
            ? await listMyBounties({ page, limit: 12 })
            : await listBounties({ sort: view, q, tag, status, page, limit: 12 });
        if (!mounted) return;
        setBounties(res.bounties || []);
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
  }, [view, status, q, tag, page]);

  function setView(nextView: ViewKey) {
    const next = new URLSearchParams(params);
    next.set("view", nextView);
    next.set("page", "1");
    setParams(next);
  }

  function setStatus(nextStatus: string) {
    const next = new URLSearchParams(params);
    if (nextStatus) next.set("status", nextStatus);
    else next.delete("status");
    next.set("page", "1");
    setParams(next);
  }

  function submitSearch() {
    const next = new URLSearchParams(params);
    next.set("page", "1");
    if (searchInput.trim()) next.set("q", searchInput.trim());
    else next.delete("q");
    if (view === "mine") next.set("view", "new");
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
          <h1 className="flex items-center gap-2 text-2xl font-bold text-white">
            <Target className="h-6 w-6 text-amber-300" /> {t("arena.bounty.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.bounty.intro")}
          </p>
          <p className="mt-1 text-xs text-gray-500">{t("arena.bounty.disclaimer")}</p>
        </div>
        <button
          type="button"
          onClick={() => navigate("/arena/bounty/new")}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
        >
          <Plus className="h-4 w-4" /> {t("arena.bounty.publishBounty")}
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
                {t(`arena.bounty.${tab.labelKey}`)}
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
                {t("arena.bounty.published")}
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
              placeholder={t("arena.bounty.searchPlaceholder")}
            />
            <button
              type="button"
              onClick={submitSearch}
              className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t("arena.bounty.search")}
            </button>
          </div>
        </div>

        {view !== "mine" && (
          <div className="mt-3 flex flex-wrap gap-2">
            {STATUS_TABS.map((s) => (
              <button
                key={s.value || "all"}
                type="button"
                onClick={() => setStatus(s.value)}
                className={`rounded-lg border px-3 py-1 text-xs ${
                  status === s.value
                    ? "border-emerald-500 text-emerald-200"
                    : "border-gray-700 text-gray-400 hover:bg-gray-800"
                }`}
              >
                {t(`arena.bounty.${s.labelKey}`)}
              </button>
            ))}
          </div>
        )}

        {tag && view !== "mine" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <span>{t("arena.bounty.tagFilter")}</span>
            <button
              type="button"
              onClick={clearTag}
              className="rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2 py-0.5 text-cyan-200 hover:bg-cyan-950/50"
            >
              #{tag} ✕
            </button>
          </div>
        )}

        {loading && <p className="mt-4 text-sm text-gray-400">{t("arena.bounty.loading")}</p>}
        {!loading && bounties.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">
              {view === "mine"
                ? t("arena.bounty.emptyMine")
                : t("arena.bounty.emptyPublic")}
            </p>
          </div>
        )}

        {!loading && bounties.length > 0 && <BountyGrid items={bounties} />}

        {!loading && bounties.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("arena.bounty.prev")}
            </button>
            <span className="text-sm text-gray-400">
              {t("arena.bounty.pageInfo", { page, total: totalPages })}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("arena.bounty.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
