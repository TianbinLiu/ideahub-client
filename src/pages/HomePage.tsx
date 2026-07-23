/**
 * @file HomePage.tsx - 创意列表首页
 * @category Page
 * @requires_auth no
 * @i18n_module idea
 * @route /
 */

import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, getFollowingFeed, listGroups, type FeedAuthor, type Group, type Idea as ApiIdea } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import { formatRelativeTime } from "../utils/relativeTime";
import { getPlatformIcon } from "../utils/platformConfig";
import { useAuth } from "../authContext";
import { Flame, Radio } from "lucide-react";

type Idea = {
  _id: string;
  ideaType?: "business" | "feedback" | "external" | "daily" | "dynamic";
  title: string;
  summary: string;
  imageUrls?: string[];
  coverImageUrl?: string;
  tags: string[];
  groupSlug?: string;
  groupName?: string;
  createdAt: string;
  author?: { _id?: string; username: string; role: string };
  stats?: { likeCount?: number; viewCount?: number };
  externalSource?: {
    platform?: string;
    url?: string;
    originalAuthor?: string;
  };
  recommendationFeedbackReason?: "not_interested" | "already_recommended" | null;
};

type IdeaTypeKey = "business" | "feedback" | "external" | "daily" | "dynamic";
type HomeFeedMode = "dynamic" | "hot";

type TagRankBoard = {
  _id: string;
  tags?: string[];
  postsCount?: number;
  computedAt?: string;
  entries?: Array<{ idea?: { title?: string } }>;
};

type FollowingUser = {
  _id: string;
  username?: string;
};

const IDEA_TYPE_OPTIONS: Array<{ key: IdeaTypeKey; emoji: string; activeClass: string; inactiveClass: string }> = [
  { key: "business", emoji: "💼", activeClass: "border-emerald-400/70 bg-emerald-500/20 text-emerald-100", inactiveClass: "border-emerald-800/50 text-emerald-200/80 hover:bg-emerald-950/30" },
  { key: "feedback", emoji: "🛠", activeClass: "border-sky-400/70 bg-sky-500/20 text-sky-100", inactiveClass: "border-sky-800/50 text-sky-200/80 hover:bg-sky-950/30" },
  { key: "external", emoji: "🔗", activeClass: "border-fuchsia-400/70 bg-fuchsia-500/20 text-fuchsia-100", inactiveClass: "border-fuchsia-800/50 text-fuchsia-200/80 hover:bg-fuchsia-950/30" },
  { key: "daily", emoji: "📝", activeClass: "border-amber-400/70 bg-amber-500/20 text-amber-100", inactiveClass: "border-amber-800/50 text-amber-200/80 hover:bg-amber-950/30" },
  { key: "dynamic", emoji: "📣", activeClass: "border-cyan-400/70 bg-cyan-500/20 text-cyan-100", inactiveClass: "border-cyan-800/50 text-cyan-200/80 hover:bg-cyan-950/30" },
];

const IDEA_TYPE_STORAGE_KEY = "preferredHomeIdeaType";
const IDEA_GROUP_STORAGE_KEY = "preferredHomeIdeaGroup";
const RECOMMENDATION_PAGE_SIZE = 6;
const COMPACT_RECOMMENDATION_PAGE_SIZE = 4;

function isIdeaTypeKey(value: string): value is IdeaTypeKey {
  return IDEA_TYPE_OPTIONS.some((item) => item.key === value);
}

function toHttpsUrl(raw?: string) {
  const val = String(raw || "").trim();
  if (!val) return "";
  if (/^http:\/\//i.test(val)) return val.replace(/^http:\/\//i, "https://");
  if (val.startsWith("//")) return `https:${val}`;
  return val;
}

function formatDate(raw?: string) {
  if (!raw) return "";
  return new Date(raw).toLocaleDateString();
}

export default function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const feedMode: HomeFeedMode = params.get("feed") === "hot" ? "hot" : "dynamic";
  const sort = feedMode === "hot" ? "hot" : "new";
  const rawIdeaType = params.get("ideaType") || "";
  const selectedIdeaTypes = useMemo(() => {
    const raw = params.get("ideaTypes") || rawIdeaType || "";
    return Array.from(new Set(raw.split(",").map((item) => item.trim()).filter(isIdeaTypeKey)));
  }, [params, rawIdeaType]);
  const groupSlug = (params.get("group") || "world").trim().toLowerCase() || "world";
  const preferredGroupSlugs = useMemo(
    () => Array.from(new Set((params.get("preferredGroups") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))),
    [params]
  );

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [dismissedIdeaIds, setDismissedIdeaIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }]);
  const [recommendationPage, setRecommendationPage] = useState(0);
  const [recommendationPageSize, setRecommendationPageSize] = useState(RECOMMENDATION_PAGE_SIZE);
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [followingIdeas, setFollowingIdeas] = useState<Idea[]>([]);
  // 动态按钮：hover dropdown 开关 + 关注流最新几条（图标头像也取自第一条）
  const [feedHover, setFeedHover] = useState(false);
  const [feedPreview, setFeedPreview] = useState<(ApiIdea & { author?: FeedAuthor })[]>([]);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [tagRankBoards, setTagRankBoards] = useState<TagRankBoard[]>([]);
  const [tagRankLoading, setTagRankLoading] = useState(false);

  const visibleIdeas = useMemo(
    () => ideas.filter((idea) => !dismissedIdeaIds.includes(idea._id)),
    [ideas, dismissedIdeaIds]
  );
  const accessibleGroups = useMemo(
    () => groups.filter((group) => group.isWorld || group.joined),
    [groups]
  );
  const joinedGroups = useMemo(
    () => accessibleGroups.filter((group) => !group.isWorld),
    [accessibleGroups]
  );
  const featuredIdeas = useMemo(() => {
    const withImages = visibleIdeas.filter((idea) => getIdeaImageUrl(idea));
    return (withImages.length > 0 ? withImages : visibleIdeas).slice(0, 5);
  }, [visibleIdeas]);
  const recommendationPageCount = Math.max(1, Math.ceil(visibleIdeas.length / recommendationPageSize));
  const recommendationIdeas = visibleIdeas.slice(
    recommendationPage * recommendationPageSize,
    recommendationPage * recommendationPageSize + recommendationPageSize
  );
  const featuredIdea = featuredIdeas.length > 0 ? featuredIdeas[featuredIndex % featuredIdeas.length] : null;

  async function load() {
    try {
      setErr("");
      setLoading(true);

      const qs = new URLSearchParams({
        sort,
        page: "1",
        limit: "24",
        group: groupSlug,
      });

      if (selectedIdeaTypes.length > 0) qs.set("ideaTypes", selectedIdeaTypes.join(","));
      // 无类型筛选时让后端做类型分层混合：推荐板块能刷出全部类型（商业/反馈/引用），
      // 而不是被数量占优的日常/动态淹没
      else qs.set("mixIdeaTypes", "1");
      if (groupSlug === "world" && preferredGroupSlugs.length > 0) qs.set("preferredGroups", preferredGroupSlugs.join(","));

      const res = await apiFetch<{ ideas: Idea[]; totalPages: number; total: number }>(`/api/ideas?${qs.toString()}`);
      setIdeas(res.ideas || []);
    } catch (error: any) {
      const msg = humanizeError(error);
      toast.error(msg);
      setErr(msg);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [sort, selectedIdeaTypes.join(","), groupSlug, preferredGroupSlugs.join(",")]);

  useEffect(() => {
    setDismissedIdeaIds([]);
    setRecommendationPage(0);
    setFeaturedIndex(0);
  }, [sort, selectedIdeaTypes.join(","), groupSlug, preferredGroupSlugs.join(",")]);

  useEffect(() => {
    setRecommendationPage((currentPage) => Math.min(currentPage, recommendationPageCount - 1));
  }, [recommendationPageCount]);

  useEffect(() => {
    function updateRecommendationPageSize() {
      setRecommendationPageSize(window.innerWidth >= 1024 ? RECOMMENDATION_PAGE_SIZE : COMPACT_RECOMMENDATION_PAGE_SIZE);
    }

    updateRecommendationPageSize();
    window.addEventListener("resize", updateRecommendationPageSize);
    return () => window.removeEventListener("resize", updateRecommendationPageSize);
  }, []);

  useEffect(() => {
    if (featuredIdeas.length <= 1) return;
    const timer = window.setInterval(() => {
      setFeaturedIndex((currentIndex) => (currentIndex + 1) % featuredIdeas.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [featuredIdeas.length]);

  useEffect(() => {
    if (rawIdeaType && isIdeaTypeKey(rawIdeaType)) {
      const next = new URLSearchParams(params);
      next.delete("ideaType");
      next.set("ideaTypes", rawIdeaType);
      next.set("page", "1");
      setParams(next, { replace: true });
      return;
    }

    if (selectedIdeaTypes.length > 0) {
      try {
        localStorage.setItem(IDEA_TYPE_STORAGE_KEY, selectedIdeaTypes.join(","));
      } catch {
        // ignore persistence failure
      }
    }
  }, [rawIdeaType, selectedIdeaTypes.join(","), params, setParams]);

  useEffect(() => {
    if (params.get("group")) {
      try {
        localStorage.setItem(IDEA_GROUP_STORAGE_KEY, groupSlug);
      } catch {
        // ignore persistence failure
      }
      return;
    }

    try {
      const stored = String(localStorage.getItem(IDEA_GROUP_STORAGE_KEY) || "world").trim().toLowerCase() || "world";
      const next = new URLSearchParams(params);
      next.set("group", stored);
      next.set("page", "1");
      setParams(next, { replace: true });
    } catch {
      const next = new URLSearchParams(params);
      next.set("group", "world");
      next.set("page", "1");
      setParams(next, { replace: true });
    }
  }, [groupSlug, params, setParams]);

  useEffect(() => {
    let mounted = true;

    async function syncGroups() {
      try {
        const res = await listGroups();
        if (!mounted) return;
        const nextGroups = (res.groups || []).filter((group) => group.isWorld || group.joined);
        const fallbackGroups = [{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }];
        const resolvedGroups = nextGroups.length > 0 ? nextGroups : fallbackGroups;
        setGroups(resolvedGroups);

        if (!resolvedGroups.some((group) => group.slug === groupSlug)) {
          const next = new URLSearchParams(params);
          next.set("group", "world");
          next.set("page", "1");
          setParams(next, { replace: true });
        }
      } catch {
        if (!mounted) return;
        setGroups([{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }]);
      }
    }

    void syncGroups();

    return () => {
      mounted = false;
    };
  }, [groupSlug, params, setParams, user?._id]);

  useEffect(() => {
    let mounted = true;

    async function loadFollowingIdeas() {
      if (!user?._id) {
        setFollowingIdeas([]);
        return;
      }

      try {
        setFollowingLoading(true);
        const followingRes = await apiFetch<{ ok: true; following: FollowingUser[] }>(`/api/users/${user._id}/following?limit=12`);
        const followedUsers = (followingRes.following || []).slice(0, 8);
        if (followedUsers.length === 0) {
          if (mounted) setFollowingIdeas([]);
          return;
        }

        const ideaResults = await Promise.all(
          followedUsers.map((followedUser) =>
            apiFetch<{ ok: true; ideas: Idea[] }>(`/api/users/${followedUser._id}/ideas?limit=3`).catch(() => ({ ok: true, ideas: [] }))
          )
        );
        const mergedIdeas = ideaResults
          .flatMap((result) => result.ideas || [])
          .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime())
          .slice(0, 12);

        if (mounted) setFollowingIdeas(mergedIdeas);
      } catch {
        if (mounted) setFollowingIdeas([]);
      } finally {
        if (mounted) setFollowingLoading(false);
      }
    }

    void loadFollowingIdeas();

    return () => {
      mounted = false;
    };
  }, [user?._id]);

  useEffect(() => {
    let mounted = true;

    async function loadTagRankBoards() {
      try {
        setTagRankLoading(true);
        const res = await apiFetch<{ boards: TagRankBoard[] }>(`/api/tag-rank/leaderboards?sort=hottest&limit=8`);
        if (mounted) setTagRankBoards(res.boards || []);
      } catch {
        if (mounted) setTagRankBoards([]);
      } finally {
        if (mounted) setTagRankLoading(false);
      }
    }

    void loadTagRankBoards();

    return () => {
      mounted = false;
    };
  }, []);

  // 「动态/热门」按钮已改为 /feed、/hot 页面入口；feedMode 仅为兼容带 ?feed=hot 的旧链接保留。

  // 动态按钮的预览数据：关注流最新几条（头像 + hover dropdown 用）。未登录不拉。
  useEffect(() => {
    if (!user?._id) {
      setFeedPreview([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const res = await getFollowingFeed({ limit: 6 });
        if (mounted) setFeedPreview(res.ideas || []);
      } catch {
        if (mounted) setFeedPreview([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?._id]);

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
    try {
      localStorage.setItem(IDEA_TYPE_STORAGE_KEY, values.join(","));
    } catch {
      // ignore persistence failure
    }
  }

  function clearIdeaTypes() {
    const next = new URLSearchParams(params);
    next.delete("ideaType");
    next.delete("ideaTypes");
    next.set("page", "1");
    setParams(next);
    try {
      localStorage.removeItem(IDEA_TYPE_STORAGE_KEY);
    } catch {
      // ignore persistence failure
    }
  }

  function getIdeaTypeOption(type?: string) {
    return IDEA_TYPE_OPTIONS.find((item) => item.key === type);
  }

  function getIdeaTypeTitle(type?: string) {
    if (!type || !isIdeaTypeKey(type)) return "";
    return t(`idea.createMode${type.charAt(0).toUpperCase()}${type.slice(1)}Title`);
  }

  function updateGroup(nextGroup: string) {
    const next = new URLSearchParams(params);
    next.set("group", nextGroup);
    next.set("page", "1");
    if (nextGroup !== "world") next.delete("preferredGroups");
    setParams(next);
    try {
      localStorage.setItem(IDEA_GROUP_STORAGE_KEY, nextGroup);
    } catch {
      // ignore persistence failure
    }
  }

  function togglePreferredGroup(slug: string) {
    const next = new URLSearchParams(params);
    const current = new Set(preferredGroupSlugs);
    if (current.has(slug)) current.delete(slug);
    else current.add(slug);
    const values = Array.from(current);
    if (values.length > 0) next.set("preferredGroups", values.join(","));
    else next.delete("preferredGroups");
    next.set("group", "world");
    next.set("page", "1");
    setParams(next);
  }

  function getIdeaImageUrl(idea?: Idea | null) {
    return toHttpsUrl(idea?.coverImageUrl || idea?.imageUrls?.[0]);
  }

  function renderIdeaTypeBadge(idea: Idea, compact = false) {
    if (!idea.ideaType) return null;
    const option = getIdeaTypeOption(idea.ideaType);
    return (
      <span className={`inline-flex w-fit rounded-full border px-2.5 py-1 ${compact ? "text-[11px]" : "text-xs"} font-semibold ${option?.activeClass || "border-gray-700 text-gray-200"}`}>
        {option?.emoji} {getIdeaTypeTitle(idea.ideaType)}
      </span>
    );
  }

  function renderIdeaMeta(idea: Idea) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-300">
        {idea.externalSource ? (
          <span className="rounded-full border border-purple-700 bg-purple-900/20 px-2 py-1 text-purple-300">
            {getPlatformIcon(idea.externalSource.platform)} {idea.externalSource.platform}
          </span>
        ) : (
          <span className="rounded-full border border-gray-700 px-2 py-1">
            {idea.author?.username || t("home.unknownAuthor")}
          </span>
        )}
        <span className="rounded-full border border-cyan-700/60 bg-cyan-950/20 px-2 py-1 text-cyan-200">
          #{idea.groupName || idea.groupSlug || "world"}
        </span>
        <span className="ml-auto text-gray-400">
          ❤️ {idea.stats?.likeCount ?? 0} · 👀 {idea.stats?.viewCount ?? 0}
        </span>
      </div>
    );
  }

  function renderCompactIdeaCard(idea: Idea, variant: "right" | "row") {
    const imageUrl = getIdeaImageUrl(idea);
    if (variant === "right") {
      return (
        <Link
          key={idea._id}
          to={`/ideas/${idea._id}`}
          className="group flex min-h-0 flex-col justify-between rounded-xl border border-gray-800 bg-gray-900/80 p-3 transition hover:border-cyan-700/70 hover:bg-gray-900"
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-white">{idea.title}</h3>
              <span className="shrink-0 text-[11px] text-gray-500">{formatDate(idea.createdAt)}</span>
            </div>
            {idea.summary ? <p className="mt-1 line-clamp-1 text-xs leading-5 text-gray-400">{idea.summary}</p> : null}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {renderIdeaTypeBadge(idea, true)}
            <span className="text-xs text-gray-400">❤️ {idea.stats?.likeCount ?? 0}</span>
          </div>
        </Link>
      );
    }

    return (
      <Link
        key={idea._id}
        to={`/ideas/${idea._id}`}
        className={`group overflow-hidden rounded-xl border border-gray-800 bg-gray-900/80 transition hover:border-cyan-700/70 hover:bg-gray-900 ${variant === "row" ? "w-72 shrink-0" : ""}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" loading="lazy" decoding="async" className="h-28 w-full object-cover transition duration-300 group-hover:scale-105" />
        ) : (
          <div className="h-28 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,.22),transparent_28%),linear-gradient(135deg,#111827,#020617)]" />
        )}
        <div className="p-3">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-white">{idea.title}</h3>
            <span className="shrink-0 text-[11px] text-gray-500">{formatDate(idea.createdAt)}</span>
          </div>
          {idea.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-400">{idea.summary}</p> : null}
          <div className="mt-2 flex items-center justify-between gap-2">
            {renderIdeaTypeBadge(idea, true)}
            <span className="text-xs text-gray-400">❤️ {idea.stats?.likeCount ?? 0}</span>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="grid gap-3 lg:grid-cols-[auto,1fr]" data-tour="home-header">
        <div className="flex items-start gap-4">
          {/* 「动态」按钮：改为 /feed 动态页入口（不再切换 feed 排序）。
              图标 = 关注列表中最新发布动态的用户头像（无关注/未登录回退 Radio 图标）；
              hover 出最新关注动态 dropdown（B 站式：头像/名字/标题/相对时间）。 */}
          <div
            className="relative"
            onMouseEnter={() => setFeedHover(true)}
            onMouseLeave={() => setFeedHover(false)}
          >
            <Link to="/feed" className="group flex w-14 flex-col items-center gap-1.5 text-xs font-semibold">
              <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-gray-700 bg-gray-900 text-gray-300 transition group-hover:border-cyan-400 group-hover:bg-gray-800">
                {feedPreview[0]?.author?.avatarUrl ? (
                  <img src={feedPreview[0].author.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Radio className="h-6 w-6" />
                )}
              </span>
              <span className="text-gray-300 group-hover:text-white">{t("home.dynamic")}</span>
            </Link>

            {feedHover && feedPreview.length > 0 && (
              <div className="absolute left-0 top-full z-40 w-80 rounded-2xl border border-gray-800 bg-gray-900 p-2 shadow-xl">
                <p className="px-3 py-1 text-[11px] text-gray-500">{t("home.feedPreviewTitle")}</p>
                {feedPreview.map((idea) => (
                  <Link
                    key={idea._id}
                    to={`/ideas/${idea._id}`}
                    className="flex items-center gap-2.5 rounded-xl px-3 py-2 hover:bg-gray-800/70"
                  >
                    {idea.author?.avatarUrl ? (
                      <img src={idea.author.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full border border-gray-700 object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-xs font-semibold text-gray-200">
                        {(idea.author?.username || "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-gray-400">{idea.author?.displayName || idea.author?.username}</span>
                      <span className="block truncate text-sm text-gray-100">{idea.title}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-600">{formatRelativeTime(idea.createdAt)}</span>
                  </Link>
                ))}
                <Link to="/feed" className="block rounded-xl px-3 py-2 text-center text-xs text-cyan-300 hover:bg-gray-800/70">
                  {t("home.feedPreviewMore")} →
                </Link>
              </div>
            )}
          </div>

          {/* 「热门」按钮：改为 /hot 热门页入口 */}
          <Link to="/hot" className="group flex w-14 flex-col items-center gap-1.5 text-xs font-semibold">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-300 transition group-hover:border-rose-400 group-hover:bg-gray-800">
              <Flame className="h-6 w-6" />
            </span>
            <span className="text-gray-300 group-hover:text-white">{t("home.hot")}</span>
          </Link>
        </div>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/70 p-3" data-tour="home-filters">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link to="/tag-rank" className="rounded-full border border-indigo-700/70 bg-indigo-950/30 px-3 py-1.5 text-xs font-semibold text-indigo-200 hover:bg-indigo-900/40">
              {t("nav.tagRank")}
            </Link>
            {IDEA_TYPE_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleIdeaType(item.key)}
                className={`rounded-full border px-3 py-1.5 text-xs transition ${selectedIdeaTypes.includes(item.key) ? item.activeClass : item.inactiveClass}`}
              >
                {item.emoji} {getIdeaTypeTitle(item.key)}
              </button>
            ))}
            {selectedIdeaTypes.length > 0 ? (
              <button type="button" onClick={clearIdeaTypes} className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800">
                {t("common.clearFilters")}
              </button>
            ) : null}
            <select value={groupSlug} onChange={(event) => updateGroup(event.target.value)} className="rounded-full border border-gray-700 bg-gray-950 px-3 py-1 text-xs text-gray-200">
              {accessibleGroups.map((group) => (
                <option key={group.slug} value={group.slug}>{group.name}</option>
              ))}
            </select>
          </div>

          {groupSlug === "world" ? (
            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs" data-tour="home-preferred">
              <span className="text-gray-400">{t("home.preferredGroups")}</span>
              {joinedGroups.length === 0 ? (
                <span className="rounded-full border border-gray-800 px-3 py-1 text-gray-500">{t("home.noPreferredGroups")}</span>
              ) : joinedGroups.map((group) => (
                <button
                  key={group.slug}
                  type="button"
                  onClick={() => togglePreferredGroup(group.slug)}
                  className={`rounded-full border px-3 py-1 ${preferredGroupSlugs.includes(group.slug) ? "border-cyan-500 bg-cyan-500/15 text-cyan-100" : "border-gray-700 text-gray-300 hover:bg-gray-800"}`}
                >
                  {group.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {loading && <p className="mt-6 text-gray-300">{t("common.loading")}</p>}
      {err && <p className="mt-6 text-red-400">{t("common.error")}: {err}</p>}

      <section className="mt-4 grid gap-4 lg:grid-cols-[minmax(260px,.7fr)_minmax(0,1.3fr)]" data-tour="home-hero">
        <div className="relative h-[260px] self-start overflow-hidden rounded-2xl border border-gray-800 bg-gray-900 lg:h-[318px]">
          {featuredIdea ? (
            <Link to={`/ideas/${featuredIdea._id}`} className="block h-full">
              {getIdeaImageUrl(featuredIdea) ? (
                <img src={getIdeaImageUrl(featuredIdea)} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(34,211,238,.24),transparent_28%),radial-gradient(circle_at_80%_20%,rgba(244,114,182,.22),transparent_26%),linear-gradient(135deg,#111827,#020617)]" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                {renderIdeaTypeBadge(featuredIdea)}
                <h2 className="mt-3 max-w-2xl text-2xl font-bold leading-8 text-white">{featuredIdea.title}</h2>
                {featuredIdea.summary ? <p className="mt-2 line-clamp-2 max-w-2xl text-sm leading-6 text-gray-200">{featuredIdea.summary}</p> : null}
                {renderIdeaMeta(featuredIdea)}
              </div>
            </Link>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400">{t("home.noPublicIdeas")}</div>
          )}

          {featuredIdeas.length > 1 ? (
            <div className="absolute bottom-5 right-5 flex gap-1.5">
              {featuredIdeas.map((idea, index) => (
                <button
                  key={idea._id}
                  type="button"
                  onClick={() => setFeaturedIndex(index)}
                  className={`h-2 rounded-full transition ${index === featuredIndex % featuredIdeas.length ? "w-6 bg-white" : "w-2 bg-white/45 hover:bg-white/70"}`}
                  aria-label={`${t("home.featured")}${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>

        <div className="relative h-[260px] overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/70 p-3 pb-8 lg:h-[318px]">
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-3 lg:grid-cols-3">
            {recommendationIdeas.length === 0 && !loading ? <p className="text-sm text-gray-400">{t("home.noPublicIdeas")}</p> : recommendationIdeas.map((idea) => renderCompactIdeaCard(idea, "right"))}
          </div>
          {recommendationPageCount > 1 ? (
            <div className="absolute bottom-5 right-5 flex gap-1.5">
              {Array.from({ length: recommendationPageCount }).map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setRecommendationPage(index)}
                  className={`h-2 rounded-full transition ${index === recommendationPage ? "w-6 bg-white" : "w-2 bg-white/45 hover:bg-white/70"}`}
                  aria-label={`${t("home.featured")}${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="mt-6" data-tour="home-following">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{t("home.followingPosts")}</h2>
          {user?._id ? <Link to={`/users/${user._id}?tab=following`} className="text-sm text-cyan-300 hover:text-cyan-100">{t("home.more")}</Link> : null}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {followingLoading ? <p className="text-sm text-gray-400">{t("common.loading")}</p> : null}
          {!followingLoading && followingIdeas.length === 0 ? (
            <div className="w-full rounded-2xl border border-gray-800 bg-gray-900/70 p-5 text-sm text-gray-400">
              {user?._id ? t("home.noFollowingPosts") : t("home.loginForFollowingPosts")}
            </div>
          ) : followingIdeas.map((idea) => renderCompactIdeaCard(idea, "row"))}
        </div>
      </section>

      <section className="mt-6 rounded-2xl border border-gray-800 bg-gray-900/70 p-4" data-tour="home-tag-rank">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-white">{t("nav.tagRank")}</h2>
          <Link to="/tag-rank" className="rounded-full border border-gray-700 px-3 py-1 text-sm text-gray-200 hover:bg-gray-800">
            {t("home.more")}
          </Link>
        </div>
        {tagRankLoading ? <p className="text-sm text-gray-400">{t("tagRank.loadingLeaderboards")}</p> : null}
        {!tagRankLoading && tagRankBoards.length === 0 ? <p className="text-sm text-gray-400">{t("tagRank.noLeaderboards")}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tagRankBoards.map((board) => (
            <Link key={board._id} to={`/leaderboard/${board._id}`} className="rounded-xl border border-gray-800 bg-gray-950/50 p-3 transition hover:border-indigo-600/70 hover:bg-gray-950">
              <div className="line-clamp-2 font-semibold text-white">{board.tags?.join(", ") || t("nav.tagRank")}</div>
              <div className="mt-1 text-xs text-gray-400">{board.postsCount || 0} {t("leaderboard.nominations")}</div>
              <div className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">
                {board.entries?.slice(0, 3).map((entry) => entry.idea?.title || "").filter(Boolean).join(" · ") || formatDate(board.computedAt)}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
