/**
 * @file Live2dMarketPage.tsx - 数字人 · Live2D 模型市场（给首页看板娘换装）
 * @category Page
 * @route /live2d/market
 * @i18n_module live2dMarket
 *
 * 职责:
 * - 列表：scope tab（全部 all / 已收藏 installed / 我的 mine，后两个要登录）+ 最新/最热 + 关键词 + tag 过滤 + 分页
 *   （与 PersonaGalleryPage 同一套 URLSearchParams 状态：深链、后退都能还原）
 * - 卡片：封面 / 名字 / 作者 / ⬇ 收藏数 ❤ 点赞数 / 官方 · 使用中 · 已收藏 徽标；按钮 使用 / 收藏 / 点赞
 * - 「使用」= PUT /api/companion/settings { modelId }（官方条目 → null），不是 install；
 *   install 只是收藏（计下载数）。两者分开是产品定义，见 docs/COMPANION.md「人格 / 音频 / 模型市场」
 * - 「上传模型」→ /live2d/market/new
 *
 * ★ 卡片不能整体做成 <Link>（PersonaGalleryPage 那样）：里面有三个按钮，a 里套 button 是无效 HTML，
 *   点按钮还会跟着跳详情。封面和名字各自是 Link，按钮独立。
 * ★ 官方条目不显示 收藏 / 点赞：它是服务端合成的、不在库里，install 会 400；「使用」照常（= 切回官方）。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import toast from "react-hot-toast";
import { Download, Heart, Shirt, Upload } from "lucide-react";
import {
  installLive2dModel,
  listLive2dModels,
  OFFICIAL_LIVE2D_MODEL_ID,
  toggleLive2dModelLike,
  uninstallLive2dModel,
  updateCompanionSettings,
  type Live2dModel,
} from "../api";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import { useCompanionSettings } from "../hooks/useCompanionSettings";
import Live2dModelCover from "../components/Live2dModelCover";

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

function authorName(author: Live2dModel["author"]) {
  if (!author) return "-";
  return typeof author === "string" ? author : author.username || "-";
}

type CardProps = {
  model: Live2dModel;
  inUse: boolean;
  switching: boolean;
  onUse: (model: Live2dModel) => void;
  onInstall: (model: Live2dModel) => void;
  onLike: (model: Live2dModel) => void;
  onTagClick: (tag: string) => void;
};

function ModelCard({ model: m, inUse, switching, onUse, onInstall, onLike, onTagClick }: CardProps) {
  const { t } = useTranslation();
  const detailPath = `/live2d/market/${m._id}`;
  return (
    <div className={`flex flex-col rounded-2xl border bg-gray-900 p-4 ${inUse ? "border-cyan-500/60" : "border-gray-800"}`}>
      <div className="flex items-start gap-3">
        <Link to={detailPath} className="shrink-0">
          <Live2dModelCover name={m.name} imageUrl={m.coverImageUrl} sizeClass="h-16 w-16" textClass="text-2xl" alt={m.name} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link to={detailPath} className="line-clamp-1 font-semibold text-white hover:text-cyan-200">
              {m.name}
            </Link>
            <div className="flex shrink-0 flex-wrap justify-end gap-1">
              {m.official && (
                <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-200">
                  {t("live2dMarket.official")}
                </span>
              )}
              {inUse ? (
                <span className="rounded-full border border-cyan-500/60 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">
                  {t("live2dMarket.inUse")}
                </span>
              ) : m.installed ? (
                <span className="rounded-full border border-gray-700 bg-gray-800/60 px-2 py-0.5 text-[11px] text-gray-300">
                  {t("live2dMarket.savedBadge")}
                </span>
              ) : null}
              {!m.shared && !m.official && (
                <span className="rounded-full border border-gray-600 px-2 py-0.5 text-[11px] text-gray-400">
                  {t("live2dMarket.privateBadge")}
                </span>
              )}
            </div>
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
            {t("live2dMarket.authorLabel", { name: m.official ? t("live2dMarket.officialAuthor") : authorName(m.author) })}
          </p>
        </div>
      </div>

      {m.description ? <p className="mt-2 line-clamp-2 text-xs text-gray-300">{m.description}</p> : null}

      {(m.tags || []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-cyan-200">
          {(m.tags || []).slice(0, 4).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="rounded-full border border-cyan-700/60 px-2 py-0.5 hover:border-cyan-400 hover:bg-cyan-500/10"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span className="mr-auto">
          ⬇ {m.stats?.downloadCount || 0} · ❤️ {m.stats?.likeCount || 0}
        </span>
        <button
          type="button"
          disabled={inUse || switching}
          onClick={() => onUse(m)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            inUse ? "cursor-default border border-cyan-500/60 text-cyan-200" : "bg-white text-black hover:bg-gray-200 disabled:opacity-60"
          }`}
        >
          {inUse ? t("live2dMarket.inUse") : switching ? t("live2dMarket.using") : t("live2dMarket.use")}
        </button>
        {!m.official && (
          <>
            <button
              type="button"
              onClick={() => onInstall(m)}
              title={m.installed ? t("live2dMarket.unsave") : t("live2dMarket.save")}
              aria-pressed={m.installed}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${
                m.installed ? "border-cyan-500 text-cyan-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              {m.installed ? t("live2dMarket.unsave") : t("live2dMarket.save")}
            </button>
            <button
              type="button"
              onClick={() => onLike(m)}
              title={m.liked ? t("live2dMarket.liked") : t("live2dMarket.like")}
              aria-pressed={m.liked}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${
                m.liked ? "border-rose-500 text-rose-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
              }`}
            >
              <Heart className={`h-3.5 w-3.5 ${m.liked ? "fill-rose-400" : ""}`} />
              {m.stats?.likeCount || 0}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Live2dMarketPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const rawScope = (params.get("scope") || "all") as Scope;
  // installed/mine 需登录，未登录一律当 all 处理（接口会 401）
  const scope: Scope = !user && rawScope !== "all" ? "all" : rawScope;
  const sort = (params.get("sort") || "new") as Sort;
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);

  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<Live2dModel[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [switchingId, setSwitchingId] = useState("");
  // 当前用的模型（登录才有）；null modelId = 官方内置
  const { settings, setSettings } = useCompanionSettings(Boolean(user));
  const activeModelId = settings?.settings.modelId || OFFICIAL_LIVE2D_MODEL_ID;

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await listLive2dModels({ scope, sort, q, tag, page, limit: 12 });
        if (!mounted) return;
        setModels(res.models || []);
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

  function requireLogin() {
    toast.error(t("live2dMarket.loginRequired"));
    navigate("/login?next=/live2d/market");
  }

  function patchModel(id: string, patch: Partial<Live2dModel>) {
    setModels((prev) => prev.map((x) => (x._id === id ? { ...x, ...patch } : x)));
  }

  async function handleUse(m: Live2dModel) {
    if (!user) return requireLogin();
    try {
      setSwitchingId(m._id);
      const res = await updateCompanionSettings({ modelId: m.official ? null : m._id });
      setSettings(res);
      toast.success(m.official ? t("live2dMarket.switchedOfficial") : t("live2dMarket.switched", { name: m.name }));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSwitchingId("");
    }
  }

  async function handleInstall(m: Live2dModel) {
    if (!user) return requireLogin();
    const nextInstalled = !m.installed;
    // 乐观更新：收藏是轻操作，等接口回来再变太顿
    patchModel(m._id, {
      installed: nextInstalled,
      stats: { ...m.stats, downloadCount: Math.max(0, (m.stats?.downloadCount || 0) + (nextInstalled ? 1 : -1)) },
    });
    try {
      const res = nextInstalled ? await installLive2dModel(m._id) : await uninstallLive2dModel(m._id);
      patchModel(m._id, { installed: res.installed, stats: { ...m.stats, downloadCount: res.downloadCount } });
    } catch (e) {
      patchModel(m._id, { installed: m.installed, stats: m.stats });
      toast.error(humanizeError(e));
    }
  }

  async function handleLike(m: Live2dModel) {
    if (!user) return requireLogin();
    const nextLiked = !m.liked;
    patchModel(m._id, {
      liked: nextLiked,
      stats: { ...m.stats, likeCount: Math.max(0, (m.stats?.likeCount || 0) + (nextLiked ? 1 : -1)) },
    });
    try {
      const res = await toggleLive2dModelLike(m._id);
      patchModel(m._id, { liked: res.liked, stats: { ...m.stats, likeCount: res.likeCount } });
    } catch (e) {
      patchModel(m._id, { liked: m.liked, stats: m.stats });
      toast.error(humanizeError(e));
    }
  }

  const visibleTabs = SCOPE_TABS.filter((tab) => !tab.auth || user);

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-gray-400 hover:text-white">
            ← {t("live2dMarket.backHome")}
          </Link>
          <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-bold text-white">
            <Shirt className="h-6 w-6 text-cyan-300" /> {t("live2dMarket.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-400">{t("live2dMarket.description")}</p>
        </div>
        <button
          type="button"
          onClick={() => (user ? navigate("/live2d/market/new") : requireLogin())}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
        >
          <Upload className="h-4 w-4" /> {t("live2dMarket.upload")}
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
                {t(`live2dMarket.${tab.labelKey}`)}
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
              placeholder={t("live2dMarket.searchPlaceholder")}
            />
            <button
              type="button"
              onClick={submitSearch}
              className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t("live2dMarket.search")}
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
              {t(`live2dMarket.${tab.labelKey}`)}
            </button>
          ))}
          {tag && (
            <div className="ml-1 flex items-center gap-2 text-xs text-gray-400">
              <span>{t("live2dMarket.tagFilter")}</span>
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

        {loading && <p className="mt-4 text-sm text-gray-400">{t("live2dMarket.loading")}</p>}
        {!loading && models.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">
              {scope === "mine"
                ? t("live2dMarket.emptyMine")
                : scope === "installed"
                  ? t("live2dMarket.emptyInstalled")
                  : t("live2dMarket.emptyAll")}
            </p>
          </div>
        )}

        {!loading && models.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {models.map((m) => (
              <ModelCard
                key={m._id}
                model={m}
                inUse={m._id === activeModelId}
                switching={switchingId === m._id}
                onUse={handleUse}
                onInstall={handleInstall}
                onLike={handleLike}
                onTagClick={applyTag}
              />
            ))}
          </div>
        )}

        {!loading && models.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("live2dMarket.previous")}
            </button>
            <span className="text-sm text-gray-400">{t("live2dMarket.pageInfo", { page, total: totalPages })}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("live2dMarket.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
