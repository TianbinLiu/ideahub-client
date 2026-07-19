import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { apiFetch } from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type IdeaLite = {
  _id: string;
  title: string;
  tags?: string[];
  createdAt?: string;
  ideaType?: "business" | "feedback" | "external" | "daily" | "dynamic";
};

type IdeaTypeKey = "business" | "feedback" | "external" | "daily" | "dynamic";

type DotPoint = {
  id: string;
  x: number;
  y: number;
  clusterKey: string;
  idea: IdeaLite;
};

type DotTooltip = {
  x: number;
  y: number;
  title: string;
  tags: string[];
};

type Cluster = {
  key: string;
  label: string;
  cx: number;
  cy: number;
  r: number;
  count: number;
  relatedTags: string[];
  ideas: IdeaLite[];
  subClusters?: Cluster[];
};

type NormalizedIdea = IdeaLite & { tags: string[]; ts: number };

type TimeWindowKey = "7d" | "30d" | "90d" | "180d" | "365d";

const TIME_WINDOWS: Array<{ key: TimeWindowKey; days: number }> = [
  { key: "7d", days: 7 },
  { key: "30d", days: 30 },
  { key: "90d", days: 90 },
  { key: "180d", days: 180 },
  { key: "365d", days: 365 },
];

const IDEA_TYPE_OPTIONS: Array<{ key: IdeaTypeKey; emoji: string; activeClass: string }> = [
  { key: "business", emoji: "💼", activeClass: "border-emerald-500 text-emerald-200 bg-emerald-900/30" },
  { key: "feedback", emoji: "🛠", activeClass: "border-sky-500 text-sky-200 bg-sky-900/30" },
  { key: "external", emoji: "🔗", activeClass: "border-fuchsia-500 text-fuchsia-200 bg-fuchsia-900/30" },
  { key: "daily", emoji: "📝", activeClass: "border-amber-500 text-amber-200 bg-amber-900/30" },
  { key: "dynamic", emoji: "📣", activeClass: "border-cyan-500 text-cyan-200 bg-cyan-900/30" },
];

const IDEA_TYPE_STORAGE_KEY = "preferredHomeIdeaType";

function isIdeaTypeKey(value: string): value is IdeaTypeKey {
  return IDEA_TYPE_OPTIONS.some((item) => item.key === value);
}

const MAP_CENTER = { x: 50, y: 50 };

const GENERIC_TAGS = new Set([
  "idea",
  "ideas",
  "post",
  "posts",
  "daily",
  "dynamic",
  "business",
  "feedback",
  "external",
  "untagged",
  "uncategorized",
  "other",
  "想法",
  "帖子",
  "动态",
  "日常",
  "商业",
  "反馈",
  "外链",
  "其他",
]);

const TOPIC_CATEGORIES = [
  {
    key: "ai-tech",
    aliases: ["ai", "人工智能", "machine learning", "机器学习", "ml", "llm", "gpt", "科技", "技术", "programming", "coding", "code", "software", "app", "saas", "automation", "自动化", "工具", "效率"],
  },
  {
    key: "product-business",
    aliases: ["product", "产品", "business", "商业", "startup", "创业", "market", "marketing", "增长", "运营", "finance", "投资", "monetize", "商业化", "company"],
  },
  {
    key: "games",
    aliases: ["game", "games", "gaming", "游戏", "steam", "手游", "roguelike", "rpg", "moba", "fps", "minecraft", "overwatch", "电竞"],
  },
  {
    key: "creative-writing",
    aliases: ["novel", "story", "writing", "write", "写作", "小说", "文学", "剧情", "script", "剧本", "文案", "worldbuilding", "短篇"],
  },
  {
    key: "design-art",
    aliases: ["design", "ui", "ux", "视觉", "设计", "art", "绘画", "插画", "美术", "aesthetic", "template", "frontend", "前端"],
  },
  {
    key: "media-social",
    aliases: ["video", "media", "bilibili", "youtube", "小红书", "抖音", "tiktok", "twitter", "x", "social", "社区", "内容", "creator", "自媒体", "平台"],
  },
  {
    key: "education-research",
    aliases: ["learn", "learning", "education", "study", "学习", "教育", "研究", "论文", "课程", "知识", "教程", "读书", "academic"],
  },
  {
    key: "life-community",
    aliases: ["life", "daily", "生活", "日常", "community", "社群", "圈子", "健康", "旅行", "心理", "habit", "习惯"],
  },
  {
    key: "feedback-bugs",
    aliases: ["bug", "bugs", "feedback", "反馈", "网站建议", "suggestion", "issue", "问题", "fix", "error", "错误"],
  },
];

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hashString(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function normalizeTags(rawTags?: string[]) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of rawTags || []) {
    const tag = String(raw || "").trim().replace(/^#/, "").toLowerCase();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

function isGenericTag(tag: string) {
  return GENERIC_TAGS.has(tag);
}

function tagMatchesAlias(tag: string, alias: string) {
  const normalizedAlias = alias.toLowerCase();
  if (tag === normalizedAlias) return true;
  if (normalizedAlias.length <= 2) return false;
  return tag.includes(normalizedAlias) || normalizedAlias.includes(tag);
}

function getCategoryByKey(key: string) {
  return TOPIC_CATEGORIES.find((category) => category.key === key) || null;
}

function getCategoryLabel(key: string, t: TFunction) {
  const category = getCategoryByKey(key);
  if (!category) return key;
  return t(`tagMapCat.${category.key}`);
}

function pickRepresentativeTag(tags: string[], countMap: Map<string, number>, excluded = new Set<string>()) {
  const useful = tags.filter((tag) => !isGenericTag(tag) && !excluded.has(tag));
  const candidates = useful.length ? useful : tags.filter((tag) => !excluded.has(tag));
  if (!candidates.length) return "other";

  const indexed = candidates.map((tag, index) => ({ tag, index, count: countMap.get(tag) || 0 }));
  indexed.sort((a, b) => {
    const aReusable = a.count > 1 ? 1 : 0;
    const bReusable = b.count > 1 ? 1 : 0;
    if (bReusable !== aReusable) return bReusable - aReusable;
    if (b.count !== a.count) return b.count - a.count;
    return a.index - b.index;
  });
  return indexed[0]?.tag || "other";
}

function classifyTopLevel(idea: NormalizedIdea, globalTagCount: Map<string, number>) {
  if (idea.ideaType === "feedback") return { key: "cat:feedback-bugs", labelKey: "feedback-bugs" };
  if (idea.ideaType === "business") return { key: "cat:product-business", labelKey: "product-business" };
  if (idea.ideaType === "external") return { key: "cat:media-social", labelKey: "media-social" };

  const titleText = String(idea.title || "").toLowerCase();
  const scored = TOPIC_CATEGORIES.map((category) => {
    let score = 0;
    for (const tag of idea.tags) {
      for (const alias of category.aliases) {
        if (tag === alias.toLowerCase()) score += 8;
        else if (tagMatchesAlias(tag, alias)) score += 4;
      }
    }
    for (const alias of category.aliases) {
      const normalizedAlias = alias.toLowerCase();
      if (normalizedAlias.length > 2 && titleText.includes(normalizedAlias)) score += 1.5;
    }
    return { category, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best && best.score >= 4) {
    return { key: `cat:${best.category.key}`, labelKey: best.category.key };
  }

  const tag = pickRepresentativeTag(idea.tags, globalTagCount);
  return { key: `tag:${tag}`, labelKey: tag };
}

function buildExcludedAliases(categoryKey: string) {
  const category = getCategoryByKey(categoryKey.replace(/^cat:/, ""));
  if (!category) return new Set<string>();
  return new Set(category.aliases.map((alias) => alias.toLowerCase()));
}

function getClusterLabel(key: string, t: TFunction) {
  if (key === "other") return t("tagMapCat.other");
  if (key.startsWith("cat:")) return getCategoryLabel(key.slice(4), t);
  if (key.startsWith("tag:")) return `#${key.slice(4)}`;
  return key;
}

export default function TagMapPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const rawIdeaType = params.get("ideaType") || "";
  const ideaType: IdeaTypeKey = isIdeaTypeKey(rawIdeaType) ? rawIdeaType : "daily";
  const backHomeHref = `/${ideaType ? `?ideaType=${encodeURIComponent(ideaType)}` : ""}`;
  const isZh = String(i18n.resolvedLanguage || i18n.language || "").toLowerCase().startsWith("zh");

  const [ideas, setIdeas] = useState<IdeaLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [timeWindow, setTimeWindow] = useState<TimeWindowKey>("30d");
  const [zoomPath, setZoomPath] = useState<string[]>([]); // 当前层级路径
  const [dotTooltip, setDotTooltip] = useState<DotTooltip | null>(null);
  const [isDesktopHover, setIsDesktopHover] = useState(true);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  function updateIdeaType(nextType: IdeaTypeKey) {
    const next = new URLSearchParams(params);
    next.set("ideaType", nextType);
    setParams(next, { replace: true });
    setZoomPath([]);
    setDotTooltip(null);
    try {
      localStorage.setItem(IDEA_TYPE_STORAGE_KEY, nextType);
    } catch (e) {
      // ignore storage failures
    }
  }

  function updateTimeWindow(nextWindow: TimeWindowKey) {
    setTimeWindow(nextWindow);
    // 时间窗变化会重算聚类，旧的下钻路径可能失效，复位 zoomPath 避免面包屑与地图脱节（与 updateIdeaType 一致）
    setZoomPath([]);
  }

  useEffect(() => {
    if (isIdeaTypeKey(rawIdeaType)) return;
    try {
      const stored = String(localStorage.getItem(IDEA_TYPE_STORAGE_KEY) || "").trim();
      if (isIdeaTypeKey(stored)) {
        const next = new URLSearchParams(params);
        next.set("ideaType", stored);
        setParams(next, { replace: true });
        return;
      }
    } catch (e) {
      // ignore storage failures
    }

    const next = new URLSearchParams(params);
    next.set("ideaType", "daily");
    setParams(next, { replace: true });
  }, [rawIdeaType, params, setParams]);

  useEffect(() => {
    async function loadIdeas() {
      try {
        setLoading(true);
        setErr("");
        const qs = new URLSearchParams({ sort: "new", page: "1", limit: "240" });
        qs.set("ideaType", ideaType);
        const res = await apiFetch<{ ideas: IdeaLite[] }>(`/api/ideas?${qs.toString()}`);
        setIdeas(res.ideas || []);
      } catch (e: any) {
        const msg = humanizeError(e);
        setErr(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    }
    loadIdeas();
  }, [ideaType]);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setIsDesktopHover(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const filteredIdeas = useMemo(() => {
    if (!ideas.length) return [] as IdeaLite[];
    const selected = TIME_WINDOWS.find((w) => w.key === timeWindow) || TIME_WINDOWS[1];
    const now = Date.now();
    const cutoff = now - selected.days * 24 * 60 * 60 * 1000;
    return ideas.filter((it) => {
      const ts = new Date(it.createdAt || 0).getTime() || 0;
      return ts >= cutoff;
    });
  }, [ideas, timeWindow]);

  const mapRenderKey = useMemo(() => {
    const lastId = filteredIdeas[0]?._id || "none";
    return `${timeWindow}-${filteredIdeas.length}-${lastId}`;
  }, [filteredIdeas, timeWindow]);

  const { points, clusters, currentCluster } = useMemo(() => {
    if (!filteredIdeas.length) return { points: [] as DotPoint[], clusters: [] as Cluster[], currentCluster: null };

    const normalized: NormalizedIdea[] = filteredIdeas.map((it) => {
      const tags = normalizeTags(it.tags);
      const ts = new Date(it.createdAt || 0).getTime() || 0;
      return { ...it, tags, ts };
    });

    const globalTagCount = new Map<string, number>();
    normalized.forEach((it) => {
      const uniq = new Set(it.tags);
      uniq.forEach((tag) => {
        globalTagCount.set(tag, (globalTagCount.get(tag) || 0) + 1);
      });
    });

    function makeClusterKey(idea: NormalizedIdea, items: NormalizedIdea[], depth: number, parentKey?: string) {
      if (depth === 0) return classifyTopLevel(idea, globalTagCount).key;

      const localTagCount = new Map<string, number>();
      items.forEach((item) => {
        item.tags.forEach((tag) => localTagCount.set(tag, (localTagCount.get(tag) || 0) + 1));
      });
      const excluded = parentKey ? buildExcludedAliases(parentKey) : new Set<string>();
      const tag = pickRepresentativeTag(idea.tags, localTagCount, excluded);
      return `tag:${tag}`;
    }

    function collapseClusterOverflow(byCluster: Map<string, NormalizedIdea[]>, maxVisible = 14) {
      const keys = [...byCluster.keys()].sort((a, b) => {
        const c1 = byCluster.get(a)?.length || 0;
        const c2 = byCluster.get(b)?.length || 0;
        if (c2 !== c1) return c2 - c1;
        return getClusterLabel(a, t).localeCompare(getClusterLabel(b, t));
      });

      if (keys.length <= maxVisible) return keys;

      const visible = keys.slice(0, maxVisible - 1);
      const overflow = keys.slice(maxVisible - 1).flatMap((key) => byCluster.get(key) || []);
      byCluster.set("other", [...(byCluster.get("other") || []), ...overflow]);
      return [...visible.filter((key) => key !== "other"), "other"];
    }

    function findClusterKeyForIdea(clustersToSearch: Cluster[], ideaId: string, fallback: string) {
      const cluster = clustersToSearch.find((item) => item.ideas.some((idea) => idea._id === ideaId));
      return cluster?.key || fallback;
    }

    // 构建层级聚类：顶层用语义大类，子层用局部代表标签。
    function buildClusters(items: NormalizedIdea[], depth: number = 0, parentKey?: string): Cluster[] {
      if (items.length === 0) return [];
      
      const byCluster = new Map<string, NormalizedIdea[]>();
      items.forEach((it) => {
        const key = makeClusterKey(it, items, depth, parentKey);
        const arr = byCluster.get(key) || [];
        arr.push(it);
        byCluster.set(key, arr);
      });

      const limitedKeys = collapseClusterOverflow(byCluster, depth === 0 ? 14 : 10);
      const centers = new Map<string, { x: number; y: number }>();
      limitedKeys.forEach((key, idx) => {
        const angle = (Math.PI * 2 * idx) / Math.max(1, limitedKeys.length);
        const ring = 16 + (idx % 4) * 6 + Math.floor(idx / 4) * 5;
        const jitter = (hashString(key) % 100) / 100;
        const r = ring + jitter * 3;
        centers.set(key, {
          x: MAP_CENTER.x + Math.cos(angle) * r,
          y: MAP_CENTER.y + Math.sin(angle) * r,
        });
      });

      return limitedKeys.map((key) => {
        const members = byCluster.get(key) || [];
        if (!members.length) return null;

        const center = centers.get(key) || MAP_CENTER;
        const localTagCount = new Map<string, number>();
        members.forEach((m) => {
          (m.tags || []).forEach((tag) => {
            localTagCount.set(tag, (localTagCount.get(tag) || 0) + 1);
          });
        });

        const relatedTags = [...localTagCount.entries()]
          .filter(([tag]) => !isGenericTag(tag))
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([tag]) => tag);

        const subClusters = depth < 1 && members.length > 6
          ? buildClusters(members, depth + 1, key)
          : [];

        return {
          key,
          label: getClusterLabel(key, t),
          cx: center.x,
          cy: center.y,
          r: clamp(4 + Math.sqrt(members.length) * 1.8, 5, 13),
          count: members.length,
          relatedTags: relatedTags.length ? relatedTags : [key],
          ideas: members,
          subClusters: subClusters.length > 0 ? subClusters : undefined,
        };
      }).filter(Boolean) as Cluster[];
    }

    const allClusters = buildClusters(normalized);

    // 根据 zoomPath 找到当前显示的集群
    let currentCluster: Cluster | null = null;
    let displayClusters = allClusters;
    let displayIdeas = normalized;

    if (zoomPath.length > 0) {
      for (const pathKey of zoomPath) {
        const found = displayClusters.find(c => c.key === pathKey);
        if (found) {
          currentCluster = found;
          displayClusters = found.subClusters || [];
          // 将 ideas 转换为 normalized 格式
          displayIdeas = found.ideas.map(it => {
            const tags = (it.tags || []).map((x) => x.trim().toLowerCase()).filter(Boolean);
            const ts = new Date(it.createdAt || 0).getTime() || 0;
            return { ...it, tags, ts };
          });
        } else {
          break;
        }
      }
    }

    // 如果当前在某个集群内部，显示该集群的 ideas 作为点
    const points: DotPoint[] = [];
    if (currentCluster) {
      const sortedByTime = [...displayIdeas].sort((a, b) => b.ts - a.ts);

      sortedByTime.forEach((it) => {
        const seed = hashString(it._id);
        const angle = ((seed % 360) * Math.PI) / 180;
        const radius = 8 + ((hashString(`${it._id}:radius`) % 1000) / 1000) * 35;
        const x = clamp(MAP_CENTER.x + Math.cos(angle) * radius, 5, 95);
        const y = clamp(MAP_CENTER.y + Math.sin(angle) * radius, 5, 95);

        points.push({ 
          id: it._id, 
          x, 
          y, 
          clusterKey: currentCluster.key,
          idea: it 
        });
      });
    } else {
      // 顶层视图：显示所有 ideas 的点
      const sortedByTime = [...normalized].sort((a, b) => b.ts - a.ts);
      const total = Math.max(1, sortedByTime.length - 1);

      sortedByTime.forEach((it, index) => {
        const recency = index / total;
        const rawKey = classifyTopLevel(it, globalTagCount).key;
        const key = findClusterKeyForIdea(allClusters, it._id, rawKey);
        const clusterCenter = allClusters.find(c => c.key === key);
        const center = clusterCenter ? { x: clusterCenter.cx, y: clusterCenter.cy } : MAP_CENTER;

        const seed = hashString(it._id);
        const angle = ((seed % 360) * Math.PI) / 180;
        const rawRadius = 6 + recency * 40;
        const baseX = MAP_CENTER.x + Math.cos(angle) * rawRadius;
        const baseY = MAP_CENTER.y + Math.sin(angle) * rawRadius;

        const attract = 0.58;
        const x = clamp(baseX * (1 - attract) + center.x * attract, 3, 97);
        const y = clamp(baseY * (1 - attract) + center.y * attract, 3, 97);

        points.push({ 
          id: it._id, 
          x, 
          y, 
          clusterKey: key,
          idea: it 
        });
      });
    }

    return { points, clusters: displayClusters, currentCluster };
  }, [filteredIdeas, zoomPath, isZh]);

  function handleClusterClick(clusterKey: string, e: React.MouseEvent) {
    e.stopPropagation();
    setZoomPath([...zoomPath, clusterKey]);
  }

  function handleIdeaClick(ideaId: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
      return;
    }
    nav(`/ideas/${ideaId}`);
  }

  function handleDotHover(e: React.MouseEvent<SVGCircleElement>, idea: IdeaLite) {
    if (!isDesktopHover) return;
    const svg = (e.currentTarget.ownerSVGElement || e.currentTarget) as SVGElement;
    const rect = svg.getBoundingClientRect();
    const tags = (idea.tags || []).map((x) => x.trim()).filter(Boolean);
    setDotTooltip({
      x: e.clientX - rect.left + 10,
      y: e.clientY - rect.top - 10,
      title: idea.title,
      tags,
    });
  }

  function clearDotHover() {
    setDotTooltip(null);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleDotTouchStart(e: React.TouchEvent<SVGCircleElement>, idea: IdeaLite) {
    if (isDesktopHover) return;
    e.stopPropagation();
    clearLongPressTimer();
    longPressTriggeredRef.current = false;

    const touch = e.touches[0];
    if (!touch) return;

    longPressTimerRef.current = window.setTimeout(() => {
      const svg = (e.currentTarget.ownerSVGElement || e.currentTarget) as SVGElement;
      const rect = svg.getBoundingClientRect();
      const tags = (idea.tags || []).map((x) => x.trim()).filter(Boolean);
      setDotTooltip({
        x: touch.clientX - rect.left + 10,
        y: touch.clientY - rect.top - 10,
        title: idea.title,
        tags,
      });
      longPressTriggeredRef.current = true;
    }, 450);
  }

  function handleDotTouchMove(e: React.TouchEvent<SVGCircleElement>, idea: IdeaLite) {
    if (isDesktopHover || !longPressTriggeredRef.current) return;
    e.stopPropagation();
    const touch = e.touches[0];
    if (!touch) return;
    const svg = (e.currentTarget.ownerSVGElement || e.currentTarget) as SVGElement;
    const rect = svg.getBoundingClientRect();
    const tags = (idea.tags || []).map((x) => x.trim()).filter(Boolean);
    setDotTooltip({
      x: touch.clientX - rect.left + 10,
      y: touch.clientY - rect.top - 10,
      title: idea.title,
      tags,
    });
  }

  function handleDotTouchEnd(e: React.TouchEvent<SVGCircleElement>) {
    if (isDesktopHover) return;
    e.stopPropagation();
    clearLongPressTimer();
  }

  function handleBackgroundClick() {
    if (zoomPath.length > 0) {
      setZoomPath(zoomPath.slice(0, -1));
    }
    clearDotHover();
  }

  function navigateToBreadcrumb(index: number) {
    setZoomPath(zoomPath.slice(0, index));
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between gap-3" data-tour="tagmap-header">
        <div>
          <h1 className="text-2xl font-bold text-white">{t("tagMap.title")}</h1>
        </div>
        <Link
          to={backHomeHref}
          className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
        >
          {t("tagMap.backHome")}
        </Link>
      </div>

      <div className="mt-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-3" data-tour="tagmap-controls">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-gray-300">{t("tagMap.ideaTypeLabel")}</span>
            <span className="text-xs text-cyan-300">
              {t(`idea.createMode${ideaType.charAt(0).toUpperCase()}${ideaType.slice(1)}Title`)}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {IDEA_TYPE_OPTIONS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => updateIdeaType(item.key)}
                className={`rounded-full border px-3 py-1 text-xs ${ideaType === item.key ? item.activeClass : "border-gray-700 text-gray-300 hover:bg-gray-800"}`}
              >
                {item.emoji} {t(`idea.createMode${item.key.charAt(0).toUpperCase()}${item.key.slice(1)}Title`)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-gray-300">{t("tagMap.timeWindowLabel")}</span>
          <span className="text-xs text-cyan-300">{t(`tagMap.window.${timeWindow}`)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={TIME_WINDOWS.length - 1}
          step={1}
          value={TIME_WINDOWS.findIndex((w) => w.key === timeWindow)}
          onChange={(e) => {
            const idx = clamp(parseInt(e.target.value, 10) || 0, 0, TIME_WINDOWS.length - 1);
            updateTimeWindow(TIME_WINDOWS[idx].key);
          }}
          className="mt-3 w-full accent-cyan-400"
          aria-label={t("tagMap.timeWindowLabel")}
        />
        <div className="mt-2 grid grid-cols-5 gap-1">
          {TIME_WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => updateTimeWindow(w.key)}
              className={`rounded-md px-1.5 py-1 text-[11px] md:text-xs border ${
                timeWindow === w.key
                  ? "border-cyan-500 text-cyan-200 bg-cyan-900/30"
                  : "border-gray-700 text-gray-400 hover:bg-gray-800"
              }`}
            >
              {t(`tagMap.window.${w.key}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-3xl border border-cyan-900/60 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.16)_0%,rgba(15,23,42,0.96)_55%,rgba(2,6,23,1)_100%)] p-3 md:p-5" data-tour="tagmap-map">
        {loading && <div className="text-gray-300 text-sm">{t("common.loading")}</div>}
        {err && <div className="text-red-400 text-sm">{t("common.error")}: {err}</div>}
        {!loading && !err && points.length === 0 && (
          <div className="text-gray-400 text-sm">{t("tagMap.empty")}</div>
        )}

        {!loading && !err && points.length > 0 && (
          <div className="relative">
            {/* 面包屑导航 */}
            {zoomPath.length > 0 && (
              <div className="mb-3 flex items-center gap-2 text-sm">
                <button
                  onClick={() => setZoomPath([])}
                  className="text-cyan-400 hover:text-cyan-300 hover:underline"
                >
                  🏠 {t("tagMap.home")} 
                </button>
                {zoomPath.map((key, index) => (
                  <span key={key} className="flex items-center gap-2">
                    <span className="text-gray-500">/</span>
                    <button
                      onClick={() => navigateToBreadcrumb(index + 1)}
                      className="text-cyan-300 hover:text-cyan-200 hover:underline"
                    >
                      {/* 面包屑显示友好标签而非原始 key（如 cat:product-business），复用同页 getClusterLabel */}
                      {getClusterLabel(key, t)}
                    </button>
                  </span>
                ))}
                {currentCluster && (
                  <span className="ml-2 text-xs text-gray-400">
                    ({t("tagMapCat.ideasCount", { count: currentCluster.count })})
                  </span>
                )}
              </div>
            )}

            <svg 
              key={mapRenderKey + '-' + zoomPath.join('-')} 
              viewBox="0 0 100 100" 
              className="w-full h-[64vh] min-h-[420px] cursor-pointer"
              onClick={handleBackgroundClick}
              onMouseLeave={clearDotHover}
              onTouchStart={clearDotHover}
            >
              <defs>
                <filter id="clusterGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                  <feMerge>
                    <feMergeNode in="coloredBlur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              <circle cx="50" cy="50" r="2.5" fill="#67e8f9" opacity="0.9" />

              {/* Ideas 小点 */}
              {points.map((pt, idx) => {
                const dx = pt.x - MAP_CENTER.x;
                const dy = pt.y - MAP_CENTER.y;
                const startX = clamp(MAP_CENTER.x + dx * 1.55, -10, 110);
                const startY = clamp(MAP_CENTER.y + dy * 1.55, -10, 110);
                return (
                  <g key={pt.id}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={currentCluster ? "1.2" : "0.55"}
                      fill={currentCluster ? "#60a5fa" : "#93c5fd"}
                      opacity={currentCluster ? "0.85" : "0.72"}
                      className="cursor-pointer hover:opacity-100 transition-opacity"
                      onClick={(e) => handleIdeaClick(pt.id, e)}
                      onMouseEnter={(e) => handleDotHover(e, pt.idea)}
                      onMouseMove={(e) => handleDotHover(e, pt.idea)}
                      onMouseLeave={clearDotHover}
                      onTouchStart={(e) => handleDotTouchStart(e, pt.idea)}
                      onTouchMove={(e) => handleDotTouchMove(e, pt.idea)}
                      onTouchEnd={handleDotTouchEnd}
                      onTouchCancel={handleDotTouchEnd}
                    >
                      <animate attributeName="cx" from={String(startX)} to={String(pt.x)} dur="900ms" begin={`${Math.min(idx * 8, 280)}ms`} fill="freeze" />
                      <animate attributeName="cy" from={String(startY)} to={String(pt.y)} dur="900ms" begin={`${Math.min(idx * 8, 280)}ms`} fill="freeze" />
                      <animate attributeName="opacity" from="0.05" to={currentCluster ? "0.85" : "0.72"} dur="650ms" begin={`${Math.min(idx * 8, 280)}ms`} fill="freeze" />
                    </circle>
                    {currentCluster && (
                      <title>{pt.idea.title}</title>
                    )}
                  </g>
                );
              })}

              {/* Cluster 气泡 */}
              {clusters.map((c, idx) => {
                const dx = c.cx - MAP_CENTER.x;
                const dy = c.cy - MAP_CENTER.y;
                const startCx = clamp(MAP_CENTER.x + dx * 1.38, -10, 110);
                const startCy = clamp(MAP_CENTER.y + dy * 1.38, -10, 110);
                const hasSubClusters = c.subClusters && c.subClusters.length > 0;
                
                return (
                  <g key={c.key}>
                    <circle
                      cx={c.cx}
                      cy={c.cy}
                      r={c.r}
                      className="cursor-pointer hover:opacity-100 transition-opacity"
                      fill={hasSubClusters ? "rgba(14,165,233,0.28)" : "rgba(14,165,233,0.2)"}
                      stroke={hasSubClusters ? "rgba(125,211,252,1)" : "rgba(125,211,252,0.9)"}
                      strokeWidth={hasSubClusters ? "0.5" : "0.35"}
                      filter="url(#clusterGlow)"
                      onClick={(e) => handleClusterClick(c.key, e)}
                    >
                      <animate attributeName="cx" from={String(startCx)} to={String(c.cx)} dur="820ms" begin={`${120 + idx * 40}ms`} fill="freeze" />
                      <animate attributeName="cy" from={String(startCy)} to={String(c.cy)} dur="820ms" begin={`${120 + idx * 40}ms`} fill="freeze" />
                      <animate attributeName="r" from="1" to={String(c.r)} dur="820ms" begin={`${120 + idx * 40}ms`} fill="freeze" />
                    </circle>
                    <text
                      x={c.cx}
                      y={c.cy - 0.2}
                      textAnchor="middle"
                      fill="#e0f2fe"
                      fontSize="1.4"
                      className="pointer-events-none select-none"
                    >
                      {c.label}
                    </text>
                    <text
                      x={c.cx}
                      y={c.cy + 1.8}
                      textAnchor="middle"
                      fill="#bae6fd"
                      fontSize="1.1"
                      className="pointer-events-none select-none"
                    >
                      {c.count}
                    </text>
                    {c.relatedTags.length > 0 && (
                      <text
                        x={c.cx}
                        y={c.cy + 3.3}
                        textAnchor="middle"
                        fill="#67e8f9"
                        fontSize="0.75"
                        className="pointer-events-none select-none"
                      >
                        {c.relatedTags.slice(0, 2).map((tag) => `#${tag}`).join(" ")}
                      </text>
                    )}
                    {hasSubClusters && (
                      <text
                        x={c.cx}
                        y={c.cy + 4.5}
                        textAnchor="middle"
                        fill="#86efac"
                        fontSize="0.9"
                        className="pointer-events-none select-none"
                      >
                        📁
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {dotTooltip && (
              <div
                className="pointer-events-none absolute z-50 max-w-[320px] rounded-lg border border-cyan-700/80 bg-slate-950/95 px-3 py-2 text-xs shadow-[0_8px_30px_rgba(8,145,178,0.35)]"
                style={{
                  left: `${dotTooltip.x}px`,
                  top: `${dotTooltip.y}px`,
                  transform: "translate(0, -100%)",
                }}
              >
                <div className="mb-1 line-clamp-2 text-cyan-100">{dotTooltip.title}</div>
                <div className="text-cyan-300">
                  {dotTooltip.tags.length
                    ? dotTooltip.tags.map((tag) => `#${tag}`).join(" ")
                    : "#untagged"}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
