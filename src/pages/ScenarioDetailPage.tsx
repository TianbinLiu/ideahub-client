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
 * - 用 PlatformCommentView 只读预览前几条 seed 评论
 * - 页面下方 <CommentThread targetType="scenario">：给大家讨论这个情景用的评论区
 *
 * ⚠️ 两个「评论」别混：
 *   - 上面的“评论区预览” = 情景自带的 seed 仿真评论（scenario.comments，只读预览）
 *   - 下面的 CommentThread = 用户之间真实的讨论区（ArenaComment）
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Bookmark, Eye, Heart, Pencil, Play } from "lucide-react";
import {
  getScenario,
  toggleScenarioBookmark,
  toggleScenarioLike,
  type Scenario,
} from "../api";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";
import PlatformCommentView from "../components/PlatformCommentView";
import CommentThread from "../components/CommentThread";

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

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getScenario(id);
        if (mounted) setScenario(res.scenario);
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
  const previewComments = (scenario.comments || []).slice(0, 6);

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
                  <span className="text-gray-500">{t("arena.scenarioDetail.debateTopic")}</span>{" "}
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
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">{t("arena.scenarioDetail.commentPreview")}</h2>
              <span className="text-xs text-gray-500">{t("arena.scenarioDetail.skinPreview", { platform: platformLabel })}</span>
            </div>
            {previewComments.length === 0 ? (
              <p className="text-sm text-gray-400">{t("arena.scenarioDetail.noComments")}</p>
            ) : (
              <PlatformCommentView
                platform={scenario.platform}
                comments={previewComments}
                topic={scenario.topic}
                composer={false}
              />
            )}
            <button
              type="button"
              onClick={() => navigate(`/arena/simulate/${scenario._id}/play`)}
              className="mt-4 w-full rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              {t("arena.scenarioDetail.enterFullSimulation")} →
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
