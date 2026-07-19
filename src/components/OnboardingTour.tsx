import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";

type TourStep = {
  target: string;
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
};

type RectState = {
  top: number;
  left: number;
  width: number;
  height: number;
};

const TOUR_DEFINITIONS: Record<string, TourStep[]> = {
  homeFeed: [
    {
      target: "top-nav",
      titleZh: "顶部导航",
      titleEn: "Top Navigation",
      bodyZh: "在这里切换首页、圈子和通知，也可以随时重播指引。",
      bodyEn: "Switch between Home, Groups, and Notifications here. You can replay this guide anytime.",
    },
    {
      target: "home-filters",
      titleZh: "筛选信息流",
      titleEn: "Filter The Feed",
      bodyZh: "这里包含类别标签、标签排行入口和圈子选择；左侧可切换动态与热门。",
      bodyEn: "This area contains category tags, Tag Rank, and circle selection. Use the left buttons for Dynamic or Hot.",
    },
    {
      target: "home-preferred",
      titleZh: "优先圈子",
      titleEn: "Preferred Circles",
      bodyZh: "选择全部圈子时，可以点亮已加入圈子，让推荐优先展示它们。",
      bodyEn: "When viewing All, select joined circles to prioritize their posts in recommendations.",
    },
    {
      target: "home-hero",
      titleZh: "推荐区域",
      titleEn: "Recommendation Area",
      bodyZh: "左侧是滚动推荐图，右侧每次展示六条推荐帖子，可翻页查看下一组。",
      bodyEn: "The left side is a rotating featured area. The right side shows six recommended posts with paging.",
    },
    {
      target: "home-following",
      titleZh: "关注动态",
      titleEn: "Following Posts",
      bodyZh: "这里展示你关注的人发布的相关帖子。",
      bodyEn: "Posts from people you follow appear here.",
    },
    {
      target: "home-tag-rank",
      titleZh: "标签排行",
      titleEn: "Tag Rank",
      bodyZh: "这里展示两排标签排行推荐，点击更多进入完整标签排行页。",
      bodyEn: "This section shows two rows of Tag Rank recommendations. Click More to open the full Tag Rank page.",
    },
  ],
  groups: [
    {
      target: "groups-create",
      titleZh: "创建圈子",
      titleEn: "Create A Circle",
      bodyZh: "设置名称、可见性和口令，创建后你会自动成为创建者。",
      bodyEn: "Set the name, visibility, and optional code. You become the creator automatically.",
    },
    {
      target: "groups-discover",
      titleZh: "发现圈子",
      titleEn: "Discover Circles",
      bodyZh: "搜索公开或私有圈子，公开圈子可直接加入，私有圈子需要口令或邀请。",
      bodyEn: "Search public or private circles. Public circles are open; private circles need a code or invite.",
    },
    {
      target: "groups-list",
      titleZh: "圈子列表",
      titleEn: "Circle List",
      bodyZh: "查看成员数、加入状态，并进入已加入的圈子。",
      bodyEn: "Check member counts, join state, and open circles you have joined.",
    },
  ],
  groupDetail: [
    {
      target: "group-header",
      titleZh: "圈子概览",
      titleEn: "Circle Overview",
      bodyZh: "这里显示圈子名称、可见性、成员数和发布入口。",
      bodyEn: "This area shows the circle name, visibility, member count, and post entry point.",
    },
    {
      target: "group-tabs",
      titleZh: "频道切换",
      titleEn: "Channel Tabs",
      bodyZh: "在帖子、聊天群和设置之间切换；设置只对创建者或管理员开放。",
      bodyEn: "Switch between Posts, Chats, and Settings. Settings are visible only to creators or admins.",
    },
    {
      target: "group-content",
      titleZh: "频道内容",
      titleEn: "Channel Content",
      bodyZh: "当前频道的帖子、聊天群或管理工具会显示在这里。",
      bodyEn: "The selected channel's posts, chats, or management tools appear here.",
    },
  ],
  newIdea: [
    {
      target: "new-idea-mode",
      titleZh: "发布模式",
      titleEn: "Posting Mode",
      bodyZh: "当前模式决定表单字段和发布后的内容类型。",
      bodyEn: "The selected mode determines the form fields and final content type.",
    },
    {
      target: "new-idea-form",
      titleZh: "正文内容",
      titleEn: "Post Content",
      bodyZh: "填写标题、摘要、正文和标签；正文支持 @ 提及。",
      bodyEn: "Add title, summary, body, and tags. The body supports @ mentions.",
    },
    {
      target: "new-idea-media",
      titleZh: "图片资源",
      titleEn: "Media Uploads",
      bodyZh: "可上传封面和内容图片，让帖子在列表里更容易识别。",
      bodyEn: "Upload a cover or content images to make the post easier to recognize.",
    },
    {
      target: "new-idea-group",
      titleZh: "发布圈子",
      titleEn: "Target Circle",
      bodyZh: "选择帖子发布到全部圈子或你已加入的圈子。",
      bodyEn: "Choose whether the post goes to All or one of your joined circles.",
    },
    {
      target: "new-idea-submit",
      titleZh: "发布",
      titleEn: "Publish",
      bodyZh: "确认内容和可见性后发布帖子。",
      bodyEn: "Publish after confirming the content and visibility.",
    },
  ],
  tagMap: [
    {
      target: "top-nav",
      titleZh: "顶部导航",
      titleEn: "Top Navigation",
      bodyZh: "这里可以返回首页，也可以随时重新打开当前页面指引。",
      bodyEn: "Use this area to return home or replay the guide for the current page.",
    },
    {
      target: "tagmap-header",
      titleZh: "热点图谱",
      titleEn: "Heat Map",
      bodyZh: "热点图谱把每个帖子显示为小点，并把相近主题聚合成更大的热点区域。",
      bodyEn: "The heat map shows each post as a dot and groups related topics into larger hotspot regions.",
    },
    {
      target: "tagmap-controls",
      titleZh: "筛选范围",
      titleEn: "Filter Scope",
      bodyZh: "在这里切换帖子类型和时间范围，图谱会按当前范围重新计算。",
      bodyEn: "Switch the post category and time window here; the map recalculates for the selected scope.",
    },
    {
      target: "tagmap-map",
      titleZh: "热点区域",
      titleEn: "Hotspot Regions",
      bodyZh: "点击大的热点圈可放大查看内部帖子；点击小点会进入帖子详情；点击空白处返回上一层。",
      bodyEn: "Click a large hotspot to zoom in, click a dot to open the post, and click empty space to zoom out.",
    },
  ],
  search: [
    {
      target: "top-nav",
      titleZh: "顶部导航",
      titleEn: "Top Navigation",
      bodyZh: "顶部搜索会进入帖子搜索页，右侧图标入口用于导航和账号操作。",
      bodyEn: "The top search opens post search results. Right-side icons handle navigation and account actions.",
    },
    {
      target: "search-filters",
      titleZh: "搜索与排序",
      titleEn: "Search And Sort",
      bodyZh: "默认按 For You 排列；这里可以切换最新、热门和类别标签。圈子选择在顶部搜索栏里。",
      bodyEn: "For You is the default ranking. Use this row for New, Hot, and category tags; circle selection lives in the top search bar.",
    },
    {
      target: "search-category-tags",
      titleZh: "类别标签",
      titleEn: "Category Tags",
      bodyZh: "类别是特殊标签，可多选或不选；帖子卡片会显示自己的类别徽章。",
      bodyEn: "Categories are special tags. Select multiple or none; each post card shows its category badge.",
    },
    {
      target: "search-results",
      titleZh: "搜索结果",
      titleEn: "Search Results",
      bodyZh: "结果区显示符合当前筛选的帖子。点击卡片进入详情。",
      bodyEn: "Results matching the active filters appear here. Click a card to open details.",
    },
  ],
};

function safeGetItem(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in private or quota-limited browsing contexts.
  }
}

function getTourId(pathname: string) {
  if (pathname === "/") {
    return "homeFeed";
  }
  if (pathname === "/groups") return "groups";
  if (pathname === "/search") return "search";
  if (pathname.startsWith("/groups/")) return "groupDetail";
  if (pathname.startsWith("/ideas/new/")) return "newIdea";
  if (pathname === "/tag-map") return "tagMap";
  return "";
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function getViewportSize() {
  const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth || 1024;
  const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight || 768;
  return { width: Math.max(width, 320), height: Math.max(height, 420) };
}

function getTarget(step?: TourStep) {
  if (!step) return null;
  return document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null;
}

function findAvailableStep(steps: TourStep[], startIndex = 0) {
  for (let index = startIndex; index < steps.length; index += 1) {
    if (getTarget(steps[index])) return index;
  }
  for (let index = 0; index < startIndex; index += 1) {
    if (getTarget(steps[index])) return index;
  }
  return -1;
}

export default function OnboardingTour() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const tourId = useMemo(() => getTourId(location.pathname), [location.pathname]);
  const steps = useMemo(() => (tourId ? TOUR_DEFINITIONS[tourId] || [] : []), [tourId]);
  const [active, setActive] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<RectState | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const step = steps[stepIndex];
  const storageKey = tourId ? `ideahub:onboarding:${tourId}:seen` : "";

  const startTour = useCallback((force = false) => {
    if (!tourId || steps.length === 0) return;
    if (!force && storageKey && safeGetItem(storageKey) === "1") return;
    const firstStep = findAvailableStep(steps, 0);
    if (firstStep < 0) return;
    setStepIndex(firstStep);
    setActive(true);
  }, [steps, storageKey, tourId]);

  const finishTour = useCallback(() => {
    if (storageKey) safeSetItem(storageKey, "1");
    setActive(false);
    setRect(null);
  }, [storageKey]);

  const nextStep = useCallback(() => {
    const nextAvailable = findAvailableStep(steps, stepIndex + 1);
    if (nextAvailable < 0 || nextAvailable <= stepIndex) {
      finishTour();
      return;
    }
    setStepIndex(nextAvailable);
  }, [finishTour, stepIndex, steps]);

  useEffect(() => {
    function handleStart() {
      window.setTimeout(() => startTour(true), 80);
    }

    window.addEventListener("ideahub:onboarding:start", handleStart);
    return () => window.removeEventListener("ideahub:onboarding:start", handleStart);
  }, [startTour]);

  useEffect(() => {
    setActive(false);
    setRect(null);
    const timer = window.setTimeout(() => startTour(false), 450);
    return () => window.clearTimeout(timer);
  }, [location.key, startTour, tourId]);

  useEffect(() => {
    if (!active) return;

    function handleKeyDown(event: KeyboardEvent) {
      // 引导层监听的是 window 级 keydown。若焦点落在输入类元素或表单内，
      // 放行原生行为，避免打断叠加在其上层的登录框（AuthDialog，z-index 更高）的回车提交与输入。
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable ||
          target.closest("form"))
      ) {
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        finishTour();
      }
      if (event.key === "Enter" || event.key === "ArrowRight") {
        event.preventDefault();
        nextStep();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, finishTour, nextStep]);

  useEffect(() => {
    // 最小 a11y 改进：弹窗打开或切换步骤时把焦点移入引导卡片，方便键盘与读屏用户定位。
    // preventScroll 避免干扰对高亮目标的 scrollIntoView。
    if (!active) return;
    cardRef.current?.focus({ preventScroll: true });
  }, [active, stepIndex]);

  useEffect(() => {
    if (!active || !step) return;

    let frame = 0;
    const updateRect = () => {
      const target = getTarget(step);
      if (!target) {
        nextStep();
        return;
      }

      const nextRect = target.getBoundingClientRect();
      setRect({
        top: nextRect.top,
        left: nextRect.left,
        width: nextRect.width,
        height: nextRect.height,
      });
    };

    const target = getTarget(step);
    target?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    frame = window.requestAnimationFrame(() => {
      window.setTimeout(updateRect, 180);
    });

    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [active, stepIndex, tourId]);

  if (!active || !step) return null;

  const spotlight = rect
    ? {
        top: Math.max(rect.top - 8, 8),
        left: Math.max(rect.left - 8, 8),
        width: rect.width + 16,
        height: rect.height + 16,
      }
    : null;
  const viewport = getViewportSize();
  const cardWidth = Math.min(360, Math.max(288, viewport.width - 32));
  const rawCardTop = spotlight
    ? spotlight.top + spotlight.height + 18 + 250 < viewport.height
      ? spotlight.top + spotlight.height + 18
      : Math.max(18, spotlight.top - 250)
    : 96;
  const cardTop = clamp(rawCardTop, 16, Math.max(16, viewport.height - 270));
  const cardLeft = spotlight
    ? clamp(spotlight.left, 16, Math.max(16, viewport.width - cardWidth - 16))
    : clamp((viewport.width - cardWidth) / 2, 16, Math.max(16, viewport.width - cardWidth - 16));
  const isLast = stepIndex >= steps.length - 1 || findAvailableStep(steps, stepIndex + 1) <= stepIndex;
  const isZh = String(i18n.resolvedLanguage || i18n.language || "").toLowerCase().startsWith("zh");
  const title = isZh ? step.titleZh : step.titleEn;
  const body = isZh ? step.bodyZh : step.bodyEn;
  const skipLabel = isZh ? "跳过" : "Skip";
  const nextLabel = isZh ? "继续" : "Next";
  const doneLabel = isZh ? "完成" : "Done";

  return (
    <div className="fixed inset-0 z-[2200]" role="presentation">
      <div className="absolute inset-0 bg-black/20" aria-hidden="true" />
      {spotlight ? (
        <div
          className="absolute rounded-2xl border border-cyan-300/80 bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.72)] transition-all duration-200"
          style={spotlight}
          aria-hidden="true"
        />
      ) : (
        <div className="absolute inset-0 bg-black/70" aria-hidden="true" />
      )}
      <div
        ref={cardRef}
        tabIndex={-1}
        className="absolute rounded-2xl border border-cyan-500/60 bg-gray-950 p-4 text-gray-100 shadow-2xl outline-none"
        style={{ top: cardTop, left: cardLeft, width: cardWidth }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-tour-title"
        aria-describedby="onboarding-tour-body"
      >
        <div className="text-[11px] uppercase tracking-wide text-cyan-300">
          {stepIndex + 1} / {steps.length}
        </div>
        <h2 id="onboarding-tour-title" className="mt-2 text-lg font-semibold text-white">{title}</h2>
        <p id="onboarding-tour-body" className="mt-3 text-sm leading-6 text-gray-200">{body}</p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={finishTour}
            className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-300 hover:bg-gray-900"
          >
            {skipLabel}
          </button>
          <button
            type="button"
            onClick={isLast ? finishTour : nextStep}
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200"
          >
            {isLast ? doneLabel : nextLabel}
          </button>
        </div>
      </div>
    </div>
  );
}