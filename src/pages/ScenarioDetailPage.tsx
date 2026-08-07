/**
 * @file ScenarioDetailPage.tsx - 情景模拟详情/介绍页
 * @category Page
 * @route /arena/simulate/:id
 * @i18n none（页面内容以中文为主）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 公开介绍页：封面/标题/简介/作者/平台/tags，浏览/点赞/收藏统计与按钮（乐观更新）
 * - “进入模拟” -> /arena/simulate/:id/play；作者可见“编辑”
 * - 用 ScenarioSceneView 只读预览（comment→前几条 seed 评论；chat→前几条种子消息）
 * - 页面下方 <CommentThread targetType="scenario">：给大家讨论这个情景用的评论区
 *
 * ⚠️ 两个「评论」别混：
 *   - 上面的“评论区预览” = 情景自带的 seed 仿真评论（scenario.comments，只读预览）
 *   - 下面的 CommentThread = 用户之间真实的讨论区（ArenaComment）
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Bookmark, Eye, Heart, Pencil, Play } from "lucide-react";
import {
  getScenario,
  installPersona,
  listScenarioSessions,
  purchasePersona,
  toggleScenarioBookmark,
  toggleScenarioLike,
  uninstallPersona,
  type Scenario,
  type ScenarioPersonaCard,
  type ScenarioSessionCard,
} from "../api";
import { formatRelativeTime } from "../utils/relativeTime";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import ScenarioSceneView from "../components/ScenarioSceneView";
import CommentThread from "../components/CommentThread";
import PersonaCover from "../components/PersonaCover";

// 页面自己的平台小徽标（与评论区皮肤无关：皮肤在 components/skins/ 里各自实现）。
// 新增平台时要跟着补一行，否则会 fallback 成「通用」徽标。
const PLATFORM_META: Record<string, { labelKey: string; className: string }> = {
  bilibili: { labelKey: "platformBilibili", className: "border-pink-600/60 bg-pink-950/30 text-pink-200" },
  weibo: { labelKey: "platformWeibo", className: "border-orange-600/60 bg-orange-950/30 text-orange-200" },
  tieba: { labelKey: "platformTieba", className: "border-blue-600/60 bg-blue-950/30 text-blue-200" },
  zhihu: { labelKey: "platformZhihu", className: "border-sky-600/60 bg-sky-950/30 text-sky-200" },
  douyin: { labelKey: "platformDouyin", className: "border-cyan-600/60 bg-cyan-950/30 text-cyan-200" },
  xiaohongshu: { labelKey: "platformXiaohongshu", className: "border-red-600/60 bg-red-950/30 text-red-200" },
  instagram: { labelKey: "platformInstagram", className: "border-fuchsia-600/60 bg-fuchsia-950/30 text-fuchsia-200" },
  generic: { labelKey: "platformGeneric", className: "border-gray-600/60 bg-gray-900 text-gray-300" },
  // 聊天类平台（sceneKind==='chat'），皮肤在 components/chatSkins/
  wechat: { labelKey: "platformWechat", className: "border-green-600/60 bg-green-950/30 text-green-200" },
  qq: { labelKey: "platformQq", className: "border-sky-600/60 bg-sky-950/30 text-sky-200" },
};

function platformMeta(platform: string) {
  return PLATFORM_META[platform] || PLATFORM_META.generic;
}

function authorName(author: Scenario["author"]) {
  if (!author) return "-";
  return typeof author === "string" ? author : author.username || "-";
}

function authorId(author: Scenario["author"]) {
  if (!author) return "";
  return typeof author === "string" ? author : author._id;
}

export default function ScenarioDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [scenario, setScenario] = useState<Scenario | null>(null);
  // 本情景中的人格（chat 场景绑定的，server 只给观看者可见的）
  const [personas, setPersonas] = useState<ScenarioPersonaCard[]>([]);
  // 大家的对话：已分享的对局（chat 场景）
  const [sessions, setSessions] = useState<ScenarioSessionCard[]>([]);
  // 正在收藏/取消收藏的人格 id（防连点）
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getScenario(id);
        if (mounted) {
          setScenario(res.scenario);
          setPersonas(res.personas || []);
          if (res.scenario.sceneKind === "chat") {
            listScenarioSessions(id, { sort: "hot", limit: 8 })
              .then((s) => {
                if (mounted) setSessions(s.sessions || []);
              })
              .catch(() => {
                // 对局列表拉不到不阻塞详情页
              });
          }
        }
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  /** 购买情景里的付费人格（永久解锁选用权；收藏本身仍免费） */
  async function handleBuyPersona(card: ScenarioPersonaCard) {
    if (!user) return requireLogin();
    if (installingId) return;
    setInstallingId(card._id);
    try {
      const res = await purchasePersona(card._id, card.price);
      setPersonas((prev) => prev.map((p) => (p._id === card._id ? { ...p, purchased: true } : p)));
      toast.success(
        res.alreadyOwned
          ? t("arena.scenarioDetail.personaAlreadyOwned", { name: card.name })
          : t("arena.scenarioDetail.personaPurchasedToast", { name: card.name, price: res.price })
      );
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setInstallingId(null);
    }
  }

  /** 收藏/取消收藏情景里的人格（PersonaInstall）。收藏后在人格选择器里置顶并标「收藏」。 */
  async function handleTogglePersonaInstall(card: ScenarioPersonaCard) {
    if (!user) return requireLogin();
    if (installingId) return;
    setInstallingId(card._id);
    try {
      const res = card.installed ? await uninstallPersona(card._id) : await installPersona(card._id);
      setPersonas((prev) =>
        prev.map((p) =>
          p._id === card._id
            ? { ...p, installed: res.installed, stats: { ...p.stats, downloadCount: res.downloadCount } }
            : p
        )
      );
      toast.success(
        res.installed
          ? t("arena.scenarioDetail.personaInstalled", { name: card.name })
          : t("arena.scenarioDetail.personaUninstalled", { name: card.name })
      );
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setInstallingId(null);
    }
  }

  function requireLogin() {
    toast.error(t("arena.scenarioDetail.loginRequired"));
    navigate(`/login?next=/arena/simulate/${id}`);
  }

  async function handleLike() {
    if (!id || !scenario) return;
    if (!user) return requireLogin();
    const prev = scenario;
    const nextLiked = !scenario.liked;
    setScenario({
      ...scenario,
      liked: nextLiked,
      stats: { ...scenario.stats, likeCount: Math.max(0, scenario.stats.likeCount + (nextLiked ? 1 : -1)) },
    });
    try {
      const res = await toggleScenarioLike(id);
      setScenario((s) => (s ? { ...s, liked: res.liked, stats: { ...s.stats, likeCount: res.likeCount } } : s));
    } catch (e) {
      // 仅回滚点赞相关字段，避免覆盖并发成功的收藏操作
      setScenario((s) => (s ? { ...s, liked: prev.liked, stats: { ...s.stats, likeCount: prev.stats.likeCount } } : s));
      toast.error(humanizeError(e));
    }
  }

  async function handleBookmark() {
    if (!id || !scenario) return;
    if (!user) return requireLogin();
    const prev = scenario;
    const nextBookmarked = !scenario.bookmarked;
    setScenario({
      ...scenario,
      bookmarked: nextBookmarked,
      stats: {
        ...scenario.stats,
        bookmarkCount: Math.max(0, scenario.stats.bookmarkCount + (nextBookmarked ? 1 : -1)),
      },
    });
    try {
      const res = await toggleScenarioBookmark(id);
      setScenario((s) =>
        s ? { ...s, bookmarked: res.bookmarked, stats: { ...s.stats, bookmarkCount: res.bookmarkCount } } : s
      );
    } catch (e) {
      // 仅回滚收藏相关字段，避免覆盖并发成功的点赞操作
      setScenario((s) =>
        s ? { ...s, bookmarked: prev.bookmarked, stats: { ...s.stats, bookmarkCount: prev.stats.bookmarkCount } } : s
      );
      toast.error(humanizeError(e));
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl p-4 text-gray-300">{t("arena.scenarioDetail.loading")}</div>;
  if (!scenario)
    return (
      <div className="mx-auto max-w-6xl p-4">
        <p className="text-gray-400">{t("arena.scenarioDetail.notFound")}</p>
        <Link to="/arena/simulate" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
          ← {t("arena.scenarioDetail.backToGallery")}
        </Link>
      </div>
    );

  const meta = platformMeta(scenario.platform);
  const platformLabel = t(`arena.scenarioDetail.${meta.labelKey}`);
  const isOwner = Boolean(scenario.isOwner || (user && authorId(scenario.author) === user._id));
  const isChat = scenario.sceneKind === "chat";
  const previewComments = (scenario.comments || []).slice(0, 6);
  const previewMessages = (scenario.messages || []).slice(0, 8);
  const hasPreview = isChat ? previewMessages.length > 0 : previewComments.length > 0;

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <Link to="/arena/simulate" className="text-sm text-gray-400 hover:text-white">
        ← {t("arena.scenarioDetail.backToGallery")}
      </Link>

      <div className="mt-3 grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-900">
            <div className="h-64 bg-gray-800">
              {scenario.coverImageUrl ? (
                <img src={scenario.coverImageUrl} alt={scenario.title} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-500">{t("arena.scenarioDetail.noCover")}</div>
              )}
            </div>
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <h1 className="text-2xl font-bold text-white">{scenario.title}</h1>
                <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium ${meta.className}`}>
                  {platformLabel}
                </span>
              </div>
              <p className="mt-2 text-gray-300">{scenario.summary || t("arena.scenarioDetail.noSummary")}</p>
              {scenario.topic && (
                <p className="mt-2 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-300">
                  <span className="text-gray-500">
                    {t(isChat ? "arena.scenarioDetail.sceneBackground" : "arena.scenarioDetail.debateTopic")}
                  </span>{" "}
                  {scenario.topic}
                </p>
              )}
              <p className="mt-3 text-sm text-gray-400">{t("arena.scenarioDetail.author", { name: authorName(scenario.author) })}</p>

              {(scenario.tags || []).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-200">
                  {(scenario.tags || []).map((tag) => (
                    <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-1">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
                <span className="inline-flex items-center gap-1">
                  <Eye className="h-4 w-4" /> {scenario.stats.viewCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-4 w-4" /> {scenario.stats.likeCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Bookmark className="h-4 w-4" /> {scenario.stats.bookmarkCount}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Play className="h-4 w-4" /> {scenario.stats.playCount}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/arena/simulate/${scenario._id}/play`)}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
                >
                  <Play className="h-4 w-4" /> {t("arena.scenarioDetail.enterSimulation")}
                </button>
                <button
                  type="button"
                  onClick={handleLike}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                    scenario.liked ? "border-rose-500 text-rose-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${scenario.liked ? "fill-rose-400" : ""}`} />
                  {scenario.liked ? t("arena.scenarioDetail.liked") : t("arena.scenarioDetail.like")}
                </button>
                <button
                  type="button"
                  onClick={handleBookmark}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                    scenario.bookmarked
                      ? "border-cyan-500 text-cyan-300"
                      : "border-gray-700 text-gray-200 hover:bg-gray-800"
                  }`}
                >
                  <Bookmark className={`h-4 w-4 ${scenario.bookmarked ? "fill-cyan-400" : ""}`} />
                  {scenario.bookmarked ? t("arena.scenarioDetail.saved") : t("arena.scenarioDetail.save")}
                </button>
                {isOwner && (
                  <Link
                    to={`/arena/simulate/${scenario._id}/edit`}
                    className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-950/30"
                  >
                    <Pencil className="h-4 w-4" /> {t("arena.scenarioDetail.edit")}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* 本情景中的人格：chat 场景角色绑定的人格，可收藏（PersonaInstall）。
              收藏后在所有「选择人格」入口置顶并标「收藏」。未公开的只有人格作者自己能看到。 */}
          {personas.length > 0 && (
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <h2 className="text-base font-semibold text-white">{t("arena.scenarioDetail.personasTitle")}</h2>
              <p className="mt-0.5 text-xs text-gray-500">{t("arena.scenarioDetail.personasHint")}</p>
              <div className="mt-3 space-y-2">
                {personas.map((p) => (
                  <div
                    key={p._id}
                    className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3"
                  >
                    <PersonaCover emoji={p.coverEmoji} imageUrl={p.coverImageUrl} sizeClass="h-10 w-10" emojiClass="text-3xl" alt={p.name} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to={`/arena/persona/${p._id}`}
                          className="truncate text-sm font-semibold text-white hover:text-cyan-200"
                        >
                          {p.name}
                        </Link>
                        {!p.shared && (
                          <span className="rounded-full border border-gray-600 px-1.5 py-0.5 text-[10px] text-gray-400">
                            {t("arena.scenarioDetail.personaPrivate")}
                          </span>
                        )}
                        {p.price > 0 && (
                          <span
                            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                              p.purchased || p.isOwner
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                                : "border-amber-600/60 bg-amber-950/30 text-amber-300"
                            }`}
                          >
                            {p.purchased ? t("arena.scenarioDetail.personaOwned") : `💰 ${p.price}`}
                          </span>
                        )}
                        <span className="text-[11px] text-gray-500">
                          🎭 {p.stats.downloadCount} · ❤️ {p.stats.likeCount}
                        </span>
                      </div>
                      {p.roles.length > 0 && (
                        <p className="mt-0.5 text-xs text-purple-200/70">
                          {t("arena.scenarioDetail.personaPlays", { roles: p.roles.join("、") })}
                        </p>
                      )}
                      {p.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{p.description}</p>}
                    </div>
                    {p.isOwner ? (
                      <span className="shrink-0 rounded-full border border-cyan-700/50 px-2 py-1 text-[11px] text-cyan-300">
                        {t("arena.scenarioDetail.personaMine")}
                      </span>
                    ) : p.shared ? (
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {/* 付费未购：先给购买入口（解锁选用权）；收藏本身始终免费 */}
                        {p.price > 0 && !p.purchased && (
                          <button
                            type="button"
                            disabled={installingId === p._id}
                            onClick={() => handleBuyPersona(p)}
                            className="rounded-lg border border-amber-600/60 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-200 transition-colors hover:bg-amber-900/40 disabled:opacity-50"
                          >
                            {t("arena.scenarioDetail.personaBuy", { price: p.price })}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={installingId === p._id}
                          onClick={() => handleTogglePersonaInstall(p)}
                          className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 ${
                            p.installed
                              ? "border-amber-500/60 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
                              : "border-gray-700 text-gray-200 hover:bg-gray-800"
                          }`}
                        >
                          {p.installed
                            ? t("arena.scenarioDetail.personaCollected")
                            : t("arena.scenarioDetail.personaCollect")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 大家的对话：已分享的对局（作者/得分/结束方式/点赞）→ 点击进回放 */}
          {sessions.length > 0 && (
            <div id="sessions" className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
              <h2 className="text-base font-semibold text-white">{t("arena.scenarioDetail.sessionsTitle")}</h2>
              <p className="mt-0.5 text-xs text-gray-500">{t("arena.scenarioDetail.sessionsHint")}</p>
              <div className="mt-3 space-y-2">
                {sessions.map((s) => (
                  <Link
                    key={s._id}
                    to={`/arena/simulate/${scenario._id}/session/${s._id}`}
                    className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3 hover:border-cyan-700/60 hover:bg-cyan-950/20"
                  >
                    {typeof s.user === "object" && s.user.avatarUrl ? (
                      <img src={s.user.avatarUrl} alt="" className="h-9 w-9 shrink-0 rounded-full border border-gray-700 object-cover" />
                    ) : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-xs font-semibold text-gray-200">
                        {(typeof s.user === "object" ? s.user.username : "?")?.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">
                          {typeof s.user === "object" ? s.user.username : "-"}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] ${
                            s.endReason === "completed"
                              ? "border-emerald-500/50 text-emerald-200"
                              : s.endReason === "derailed"
                                ? "border-rose-500/50 text-rose-200"
                                : "border-gray-600 text-gray-400"
                          }`}
                        >
                          {t(`arena.scenarioPlay.endReason_${s.endReason || "manual"}`)}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-gray-500">
                        {t("arena.scenarioDetail.sessionMeta", { count: s.messageCount })}
                        {s.endedAt ? ` · ${formatRelativeTime(s.endedAt)}` : ""}
                      </span>
                    </span>
                    {s.evaluation?.score != null && (
                      <span className="shrink-0 text-lg font-bold text-white">{s.evaluation.score}</span>
                    )}
                    <span className="shrink-0 text-xs text-gray-400">❤️ {s.likeCount}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                {t(isChat ? "arena.scenarioDetail.chatPreview" : "arena.scenarioDetail.commentPreview")}
              </h2>
              <span className="text-xs text-gray-500">{t("arena.scenarioDetail.skinPreview", { platform: platformLabel })}</span>
            </div>
            {!hasPreview ? (
              <p className="text-sm text-gray-400">
                {t(isChat ? "arena.scenarioDetail.noMessages" : "arena.scenarioDetail.noComments")}
              </p>
            ) : (
              <ScenarioSceneView
                sceneKind={scenario.sceneKind}
                platform={scenario.platform}
                comments={previewComments}
                topic={scenario.topic}
                participants={scenario.participants || []}
                messages={previewMessages}
              />
            )}
            <button
              type="button"
              onClick={() => navigate(`/arena/simulate/${scenario._id}/play`)}
              className="mt-4 w-full rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t(isChat ? "arena.scenarioDetail.enterFullSimulationChat" : "arena.scenarioDetail.enterFullSimulation")} →
            </button>
          </div>
        </div>
      </div>

      {/* 讨论区：情景作者是版主，可删任何人的评论 */}
      <div className="mt-4">
        <CommentThread targetType="scenario" targetId={scenario._id} canModerate={isOwner} />
      </div>
    </div>
  );
}
