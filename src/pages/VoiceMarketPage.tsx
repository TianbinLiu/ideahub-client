/**
 * @file VoiceMarketPage.tsx - 声音市场：豆包 1.0 混音模板列表（给首页数字人换一把嗓子）
 * @category Page
 * @route /voices/market
 * @i18n_module voiceMarket
 *
 * 职责:
 * - 列表：scope tab（全部 all / 我的 mine，后者要登录）+ 最新/最热 + 关键词 + 分页
 *   （与 Live2dMarketPage 同一套 URLSearchParams 状态：深链、后退都能还原）
 * - 卡片（VoiceTemplateCard）：名字 / 作者 / 配方摘要「高冷御姐 50% · 知性女声 30% · 魅力女友 20%」/ 语速音调 /
 *   ⬆ 使用数 ❤ 点赞；按钮 试听 / 设为我的声音 / 点赞；「使用中」= settings.voice.templateId === _id
 * - 「设为我的声音」= PUT /api/companion/settings { voice: { templateId } }（服务端展开成快照）+ POST /:id/use 计数；游客 → 登录
 * - 「创建模板」→ /voices/market/new
 * 产品语义见 docs/COMPANION.md「声音市场」。
 *
 * ★ use 计数失败不影响「设为」：设置已经落库，计数只是统计，静默吞掉但 console.warn 留痕（铁律 8：失败要响）。
 * ★ 和模型市场一样不放在 /arena 下：游客也要能逛、能试听；new / edit 走 ProtectedRoute。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearchParams } from "react-router";
import toast from "react-hot-toast";
import { AudioLines, Plus } from "lucide-react";
import { listVoiceTemplates, recordVoiceTemplateUse, toggleVoiceTemplateLike, updateCompanionSettings, type VoiceTemplate } from "../api";
import { useAuth } from "../authContext";
import { useTtsVoices, voiceDisplayName } from "../companion/ttsVoices";
import { usePreviewSentence, voiceErrorMessage } from "../companion/voiceTemplates";
import { useCompanionSettings } from "../hooks/useCompanionSettings";
import VoiceTemplateCard from "../components/VoiceTemplateCard";

type Scope = "all" | "mine";
type Sort = "new" | "hot";

const SCOPE_TABS: { key: Scope; labelKey: string; auth?: boolean }[] = [
  { key: "all", labelKey: "scopeAll" },
  { key: "mine", labelKey: "scopeMine", auth: true },
];

const SORT_TABS: { key: Sort; labelKey: string }[] = [
  { key: "new", labelKey: "sortNew" },
  { key: "hot", labelKey: "sortHot" },
];

export default function VoiceMarketPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const rawScope = (params.get("scope") || "all") as Scope;
  // mine 需登录，未登录一律当 all 处理（接口会 401）
  const scope: Scope = !user && rawScope !== "all" ? "all" : rawScope;
  const sort = (params.get("sort") || "new") as Sort;
  const q = params.get("q") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);

  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<VoiceTemplate[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [applyingId, setApplyingId] = useState("");
  // 当前用的模板（登录才有）：settings.voice 是用户覆盖那一层，templateId 只在从模板设置时才有
  const { settings, setSettings } = useCompanionSettings(Boolean(user));
  const activeTemplateId = settings?.settings.voice?.templateId || "";
  const { voices, mixable } = useTtsVoices();
  const previewText = usePreviewSentence();
  const nameOf = (id: string) => voiceDisplayName(id, voices, mixable);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await listVoiceTemplates({ scope, sort, q, page, limit: 12 });
        if (!mounted) return;
        setTemplates(res.templates || []);
        setTotalPages(res.totalPages || 1);
      } catch (e) {
        if (mounted) toast.error(voiceErrorMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [scope, sort, q, page]);

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

  function goPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  function requireLogin() {
    toast.error(t("voiceMarket.loginRequired"));
    navigate("/login?next=/voices/market");
  }

  function patchTemplate(id: string, patch: (prev: VoiceTemplate) => Partial<VoiceTemplate>) {
    setTemplates((prev) => prev.map((x) => (x._id === id ? { ...x, ...patch(x) } : x)));
  }

  async function handleUse(tpl: VoiceTemplate) {
    if (!user) return requireLogin();
    try {
      setApplyingId(tpl._id);
      const res = await updateCompanionSettings({ voice: { templateId: tpl._id } });
      setSettings(res);
      toast.success(t("voiceMarket.applied", { name: tpl.name }));
      recordVoiceTemplateUse(tpl._id)
        .then((r) => patchTemplate(tpl._id, (prev) => ({ stats: { ...prev.stats, useCount: r.useCount } })))
        .catch((err) => console.warn("[voice-market] use count failed", err));
    } catch (e) {
      toast.error(voiceErrorMessage(e));
    } finally {
      setApplyingId("");
    }
  }

  async function handleLike(tpl: VoiceTemplate) {
    if (!user) return requireLogin();
    const nextLiked = !tpl.liked;
    // 乐观更新：点赞是轻操作，等接口回来再变太顿
    patchTemplate(tpl._id, (prev) => ({
      liked: nextLiked,
      stats: { ...prev.stats, likeCount: Math.max(0, (prev.stats?.likeCount || 0) + (nextLiked ? 1 : -1)) },
    }));
    try {
      const res = await toggleVoiceTemplateLike(tpl._id);
      patchTemplate(tpl._id, (prev) => ({ liked: res.liked, stats: { ...prev.stats, likeCount: res.likeCount } }));
    } catch (e) {
      patchTemplate(tpl._id, () => ({ liked: tpl.liked, stats: tpl.stats }));
      toast.error(voiceErrorMessage(e));
    }
  }

  const visibleTabs = SCOPE_TABS.filter((tab) => !tab.auth || user);

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/" className="text-sm text-gray-400 hover:text-white">
            ← {t("voiceMarket.backHome")}
          </Link>
          <h1 className="mt-1 inline-flex items-center gap-2 text-2xl font-bold text-white">
            <AudioLines className="h-6 w-6 text-cyan-300" /> {t("voiceMarket.title")}
          </h1>
          <p className="mt-1 text-sm text-gray-400">{t("voiceMarket.description")}</p>
        </div>
        <button
          type="button"
          onClick={() => (user ? navigate("/voices/market/new") : requireLogin())}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
        >
          <Plus className="h-4 w-4" /> {t("voiceMarket.create")}
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
                {t(`voiceMarket.${tab.labelKey}`)}
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
              placeholder={t("voiceMarket.searchPlaceholder")}
            />
            <button type="button" onClick={submitSearch} className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
              {t("voiceMarket.search")}
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
              {t(`voiceMarket.${tab.labelKey}`)}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-500">{t("voiceMarket.mixRule")}</span>
        </div>

        {loading && <p className="mt-4 text-sm text-gray-400">{t("voiceMarket.loading")}</p>}
        {!loading && templates.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">{scope === "mine" ? t("voiceMarket.emptyMine") : t("voiceMarket.emptyAll")}</p>
          </div>
        )}

        {!loading && templates.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {templates.map((tpl) => (
              <VoiceTemplateCard
                key={tpl._id}
                template={tpl}
                active={Boolean(activeTemplateId) && tpl._id === activeTemplateId}
                nameOf={nameOf}
                previewText={previewText}
                primaryLabel={t("voiceMarket.use")}
                primaryBusy={applyingId === tpl._id}
                onPrimary={(x) => void handleUse(x)}
                onLike={(x) => void handleLike(x)}
              />
            ))}
          </div>
        )}

        {!loading && templates.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <button type="button" disabled={page <= 1} onClick={() => goPage(page - 1)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40">
              {t("voiceMarket.previous")}
            </button>
            <span className="text-sm text-gray-400">{t("voiceMarket.pageInfo", { page, total: totalPages })}</span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              {t("voiceMarket.next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
