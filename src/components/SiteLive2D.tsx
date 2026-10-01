import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import "./SiteLive2D.css";
import { getMyComponents, type Live2DComponentSettings } from "../api";
import { activeLive2dModelUrl, isLive2dSampleModel, LIVE2D_SAMPLE_CREDIT } from "../live2d/sampleCredit";
import { OFFICIAL_MODEL_URL } from "../companion/modelSource";
import { useAuth } from "../authContext";

type WaifuTipsConfig = {
  mouseover: Array<{ selector: string; text: string | string[] }>;
  click: Array<{ selector: string; text: string | string[] }>;
  seasons: Array<{ date: string; text: string | string[] }>;
  time: Array<{ hour: string; text: string | string[] }>;
  message: Record<string, string | string[]>;
  models: Array<{ name: string; paths: string[]; message: string }>;
};

type Live2DWindow = Window & {
  initWidget?: (config: {
    waifuPath: string;
    cubism2Path: string;
    cubism5Path: string;
    tools: string[];
    modelId: number;
    drag: boolean;
    logLevel: "error" | "warn" | "info" | "trace";
  }) => void;
  __ideahubLive2dBootstrapped?: boolean;
  __ideahubLive2dLoading?: Promise<void>;
  __ideahubLive2dConfigKey?: string;
  __ideahubLive2dManager?: {
    destroy?: () => void;
  } | null;
};

const LIVE2D_BASE = "/live2d-widget";
const LIVE2D_SCRIPT_VERSION = "20260421-live2d-fix";
const LIVE2D_VISIBILITY_KEY = "ideahub-live2d-visible";
const LIVE2D_REOPEN_SIDE_KEY = "ideahub-live2d-reopen-side";
const LIVE2D_CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"></path></svg>';
// ★ 游客看到的是**官方看板娘小梦**（随站点打包的那份），与服务端给登录用户的默认值是同一个地址 ——
//   两边一致，登录前后配置键不变、挂件不必重建。
//   2026-09-18 之前这里是 Live2D 官方示例 Hiyori（从 jsDelivr 直链 CubismWebSamples）——按 Live2D 的
//   Free Material License，营收达到门槛的运营方不能把示例数据放在公开网站上，所以换成我们自己的模型。
const DEFAULT_LIVE2D_SETTINGS: Live2DComponentSettings = {
  enabled: true,
  source: "remote",
  modelJsonUrl: OFFICIAL_MODEL_URL,
  uploadedModelJsonUrl: "",
  uploadedBundleName: "",
};

type ReopenSide = "left" | "right";

const live2dStyleLoads = new Map<string, Promise<void>>();
const live2dScriptLoads = new Map<string, Promise<void>>();

function getStoredVisibility() {
  if (typeof window === "undefined") {
    return true;
  }

  const value = window.localStorage.getItem(LIVE2D_VISIBILITY_KEY);
  return value !== "hidden";
}

function setStoredVisibility(visible: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LIVE2D_VISIBILITY_KEY, visible ? "visible" : "hidden");
}

function getStoredReopenSide(): ReopenSide {
  if (typeof window === "undefined") {
    return "right";
  }

  return window.localStorage.getItem(LIVE2D_REOPEN_SIDE_KEY) === "left" ? "left" : "right";
}

function setStoredReopenSide(side: ReopenSide) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LIVE2D_REOPEN_SIDE_KEY, side);
}

function getReopenSideFromWidget(): ReopenSide {
  const widget = document.getElementById("waifu");
  if (!widget) {
    return getStoredReopenSide();
  }

  const rect = widget.getBoundingClientRect();
  const widgetCenterX = rect.left + rect.width / 2;
  return widgetCenterX <= window.innerWidth / 2 ? "left" : "right";
}

function removeWidgetDom() {
  document.getElementById("waifu")?.remove();
  document.getElementById("waifu-toggle")?.remove();
}

function teardownLive2D(live2dWindow: Live2DWindow) {
  try {
    live2dWindow.__ideahubLive2dManager?.destroy?.();
  } catch (error) {
    console.warn("[IdeaHub] Failed to destroy Live2D runtime.", error);
  }

  live2dWindow.__ideahubLive2dManager = null;
  live2dWindow.__ideahubLive2dBootstrapped = false;
  removeWidgetDom();
}

function mountCloseToolButton(onHide: () => void) {
  const toolContainer = document.getElementById("waifu-tool");
  if (!toolContainer) {
    return;
  }

  toolContainer.replaceChildren();

  const closeButton = document.createElement("span");
  closeButton.id = "waifu-tool-close";
  closeButton.innerHTML = LIVE2D_CLOSE_ICON;
  closeButton.setAttribute("role", "button");
  closeButton.setAttribute("aria-label", "Hide Live2D assistant");
  closeButton.title = "Hide Live2D assistant";
  closeButton.addEventListener("click", onHide);
  toolContainer.appendChild(closeButton);
}

/**
 * 开场物理收敛（旧挂件版）。
 *
 * ★★ 为什么要有（2026-09-18 量出来的）：默认模型换成小梦之后，小梦的物理摆锤链在旧挂件里开场会甩 ——
 *   无头 Chromium 逐帧采样，后发（VertexIndex 2，×24）头 0.5 秒**顶满量程 ±1**、1 秒后才回落，
 *   裙摆（×240）头 1 秒到 3.5（量程 ±10）。根因与首页 / App 客服那次一模一样：链尾输出是相邻两节的夹角 ×Scale，
 *   摆锤链初始笔直下垂，头几帧输入从 0 跳到当前姿态就瞬间弯折。首页运行时的修法在
 *   live2d/companionModel.ts（PHYSICS_SETTLE_STEPS / FRAMES），但旧挂件是另一套运行时（live2d-widget 内置的
 *   官方 Cubism 框架），那份修法够不着它 —— 这里对**同一个框架类 CubismPhysics** 用同一套参数：
 *   开场 SECONDS 秒内每次 evaluate 先按 1/30 秒多跑 STEPS 步，让链一直贴着当前姿态的平衡位置。
 * ⚠ 没有共用 companionModel 那两个常量：那个文件与 App 仓逐字同步（改它就得两仓一起改）；而且两边的覆盖时长
 *   本来就该不同（首页运行时的待机动作起步有淡入，6 帧就够；这里不够，见 WIDGET_PHYSICS_SETTLE_SECONDS）。
 * ⚠ 取物理对象走的是挂件包（public/live2d-widget/chunk/index2.js，随仓库一起提交的固定版本）里官方 Cubism
 *   示例框架的字段名（LAppDelegate._subdelegates → _live2dManager._models → 模型的 _physics）。换挂件包版本时要重新核对。
 *   取不到（Cubism 2 模型没有 physics3、模型加载失败）就什么都不做 —— 那不是这里该响的事。
 */
const WIDGET_PHYSICS_SETTLE_STEPS = 60;
/**
 * 收敛覆盖多久。★ 按**时间**不按帧数，而且比首页那份（6 帧）长得多：旧挂件里待机动作从第 0 帧起就在转头
 * （idle.motion3 的 AngleX 以约 4°/s 爬升），摆锤链在「从静止到开始动」这一下受到冲击 —— 只收敛 6 帧（约 0.1 秒）时
 * 实测头 0.5 秒是稳的，但 0.6–1.3 秒裙摆又甩到 3（量程 ±10）、后发到 0.55。覆盖到 1.5 秒，这段里每一帧都把链
 * 收敛到当前姿态的平衡位置，起步冲击就被吸收掉；之后恢复正常物理（稳态裙摆约 0.3）。
 */
const WIDGET_PHYSICS_SETTLE_SECONDS = 1.5;

type CubismPhysicsLike = {
  evaluate: (model: unknown, deltaTimeSeconds: number) => void;
  __ideahubSettled?: boolean;
};

/**
 * 收敛那段只该推进物理的**内部状态**（摆锤各节的位置/速度），不该往参数里写东西 —— 取出参数数组，
 * 多跑的每一步之前都把它恢复成本帧物理之前的样子，最后那一次正常 evaluate 才真正写输出。
 * ★ 为什么（2026-09-18 评审抓到）：CubismPhysics.evaluate 结尾的 interpolate 会把输出按 Weight 混进参数
 *   （cur×(1−w) + out×w）并写回。同一帧里连调 60 次，权重 <100 的输出会被反复混合、几乎盖掉动作对它的贡献；
 *   输出参数同时又是别的摆锤输入的装配，还会读到上一步刚写进去的输出，自我反馈。小梦不受影响
 *   （5 个输出权重都是 100、输入输出不重叠），但用户可以在设置页填任意 model3.json。
 * 取不到参数数组（形状对不上）就返回 null —— 那时宁可不收敛，也不冒险改坏参数。
 */
function parameterValuesOf(model: unknown): Float32Array | null {
  const core = (model as { getModel?: () => { parameters?: { values?: unknown } } } | null)?.getModel?.();
  const values = core?.parameters?.values;
  return values instanceof Float32Array ? values : null;
}

function widgetPhysics(live2dWindow: Live2DWindow): CubismPhysicsLike | null {
  type Vec<T> = { _ptr?: T[] };
  const manager = live2dWindow.__ideahubLive2dManager as
    | { cubism5model?: { _subdelegates?: Vec<{ _live2dManager?: { _models?: Vec<{ _physics?: unknown }> } }> } }
    | null
    | undefined;
  const physics = manager?.cubism5model?._subdelegates?._ptr?.[0]?._live2dManager?._models?._ptr?.[0]?._physics;
  if (!physics || typeof (physics as CubismPhysicsLike).evaluate !== "function") return null;
  return physics as CubismPhysicsLike;
}

function settleWidgetPhysicsOnOpen(live2dWindow: Live2DWindow, isDisposed: () => boolean) {
  const startedAt = Date.now();
  const poll = () => {
    if (isDisposed()) return;
    const physics = widgetPhysics(live2dWindow);
    if (physics) {
      if (physics.__ideahubSettled) return;
      physics.__ideahubSettled = true;
      const evaluate = physics.evaluate;
      let elapsed = 0;
      physics.evaluate = function (model, deltaTimeSeconds) {
        const values = elapsed < WIDGET_PHYSICS_SETTLE_SECONDS ? parameterValuesOf(model) : null;
        if (values) {
          // 力度随时间二次衰减到 0，而不是到点突然撤掉：实测突然撤掉那一下（链被松开时身体正在转）
          // 会让裙摆在 1–3 秒又甩到 1.3；逐渐放手则让自然摆动一点点接回来
          const left = 1 - elapsed / WIDGET_PHYSICS_SETTLE_SECONDS;
          const steps = Math.ceil(WIDGET_PHYSICS_SETTLE_STEPS * left * left);
          // ★ 每帧最多记 1/20 秒（2026-09-18 评审抓到）：挂件库的 deltaTime 没有上限，标签页在后台时模型加载完、
          //   切回来的第一帧 dt 就是整段后台时长 —— 不封顶的话 1.5 秒的窗口一帧就用完，开场甩原样回来。
          //   按「真正画出来的动画时长」计，封顶 1/20 秒相当于假设至少 20fps。
          elapsed += Math.min(Math.max(0, deltaTimeSeconds), 1 / 20);
          const before = values.slice();
          for (let i = 0; i < steps; i++) {
            values.set(before); // 见 parameterValuesOf 的 ★：多跑的每一步都从本帧物理之前的参数出发
            evaluate.call(this, model, 1 / 30);
          }
          values.set(before);
        }
        evaluate.call(this, model, deltaTimeSeconds);
      };
      return;
    }
    // 物理对象在模型 setup 时同步建好、贴图还在异步加载 —— 这时第一帧还没画，16ms 一轮足够赶在它前面
    if (Date.now() - startedAt < 20_000) window.setTimeout(poll, 16);
  };
  poll();
}

/**
 * 用到 Live2D 官方示例时（用户自己填了示例地址、或上传了示例包），把版权声明挂进 `#waifu` 里 ——
 * 放在挂件自己的 DOM 里而不是 React 这一侧：挂件能拖动（`drag: true`），声明要跟着模型走；
 * 挂件被 teardown 时整个 `#waifu` 一起移除，声明也跟着消失，不会留一句孤零零的字。
 * 样式见 SiteLive2D.css 的 `#waifu-credit`。判据与原文见 live2d/sampleCredit。
 */
function mountSampleCredit(modelUrl: string) {
  document.getElementById("waifu-credit")?.remove();
  if (!isLive2dSampleModel(modelUrl)) return;
  const waifu = document.getElementById("waifu");
  if (!waifu) {
    // 与 mountCloseToolButton 同一拍、同一个前提（initWidget 同步插入 #waifu）。真走到这里说明
    // 挂件库的时序变了 —— 示例数据会在没有声明的情况下露出，必须响（铁律八）
    console.warn("[IdeaHub] #waifu 不在，Live2D 示例模型的版权声明没挂上");
    return;
  }
  const credit = document.createElement("div");
  credit.id = "waifu-credit";
  credit.lang = "en"; // 原文照放、不翻译（见 sampleCredit.ts 的 ⚠）
  credit.textContent = LIVE2D_SAMPLE_CREDIT;
  waifu.appendChild(credit);
}

async function buildWaifuConfigUrl(activeModelUrl: string) {
  const response = await fetch(`${LIVE2D_BASE}/ideahub-waifu-tips.json`);
  const baseConfig = (await response.json()) as WaifuTipsConfig;
  const runtimeConfig: WaifuTipsConfig = {
    ...baseConfig,
    models: [
      {
        name: "IdeaHub Live2D",
        paths: [activeModelUrl],
        message: "当前使用的是你选择的 Live2D 模型。",
      },
    ],
  };

  const blob = new Blob([JSON.stringify(runtimeConfig)], { type: "application/json" });
  return URL.createObjectURL(blob);
}

function getConfigKey(settings: Live2DComponentSettings) {
  return JSON.stringify({
    enabled: settings.enabled,
    source: settings.source,
    modelJsonUrl: settings.modelJsonUrl,
    uploadedModelJsonUrl: settings.uploadedModelJsonUrl,
  });
}

function ensureStyle(href: string) {
  const existingLoad = live2dStyleLoads.get(href);
  if (existingLoad) {
    return existingLoad;
  }

  const existingLink = document.querySelector(`link[data-live2d-style="${href}"]`) as
    | HTMLLinkElement
    | null;
  if (existingLink?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  const loadPromise = new Promise<void>((resolve, reject) => {
    const link = existingLink ?? document.createElement("link");

    const cleanup = () => {
      link.removeEventListener("load", handleLoad);
      link.removeEventListener("error", handleError);
    };

    const handleLoad = () => {
      link.dataset.loaded = "true";
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      live2dStyleLoads.delete(href);
      reject(new Error(`Failed to load ${href}`));
    };

    link.addEventListener("load", handleLoad);
    link.addEventListener("error", handleError);

    if (!existingLink) {
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.live2dStyle = href;
      document.head.appendChild(link);
    }
  });

  live2dStyleLoads.set(href, loadPromise);
  return loadPromise;
}

function ensureModuleScript(src: string) {
  const existingLoad = live2dScriptLoads.get(src);
  if (existingLoad) {
    return existingLoad;
  }

  const existingScript = document.querySelector(`script[data-live2d-script="${src}"]`) as
    | HTMLScriptElement
    | null;
  if (existingScript?.dataset.loaded === "true") {
    return Promise.resolve();
  }

  const loadPromise = new Promise<void>((resolve, reject) => {
    const script = existingScript ?? document.createElement("script");

    const cleanup = () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    const handleLoad = () => {
      script.dataset.loaded = "true";
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      live2dScriptLoads.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    if (!existingScript) {
      script.type = "module";
      script.src = src;
      script.dataset.live2dScript = src;
      document.head.appendChild(script);
    }
  });

  live2dScriptLoads.set(src, loadPromise);
  return loadPromise;
}

export default function SiteLive2D() {
  const { user, loading: authLoading } = useAuth();
  // 首页有自己的看板娘舞台（CompanionStage + CompanionChat），右下角挂件在首页不出现，免得两个模型打架
  const { pathname } = useLocation();
  const onHome = pathname === "/";
  // ★ 手机上的落地页（App 分享链 /v/:id、下载、隐私、儿童安全）不挂看板娘：那几页的访客是
  //   点链接进来的陌生人，屏幕本来就只有一巴掌宽，模型会压在正文和底部下载条上
  //   （2026-09-05 实测），还要多拉一套 Live2D 运行时。桌面上照旧。
  const onLandingPhone =
    /^\/(v\/|download$|child-safety$|privacy$)/.test(pathname) &&
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 767px)").matches;
  const latestConfigKeyRef = useRef("");
  const waifuConfigUrlRef = useRef<string | null>(null);
  // 缓存已拉取的组件数据（按 userId 归属），显隐切换时复用，避免每次都重新请求 getMyComponents()
  const cachedLive2dRef = useRef<{ userId: string | undefined; settings: Live2DComponentSettings } | null>(null);
  const [isVisible, setIsVisible] = useState(getStoredVisibility);
  const [isEnabled, setIsEnabled] = useState(false);
  const [reopenSide, setReopenSide] = useState<ReopenSide>(getStoredReopenSide);

  useEffect(() => {
    const live2dWindow = window as Live2DWindow;
    // ★ 看板娘是这个 effect 直接挂进 document 的，下面 return null 只管 React 那一小块 ——
    //   所以"不出现"的门必须开在这里，不能只靠渲染分支
    if (onHome || onLandingPhone) {
      teardownLive2D(live2dWindow);
      latestConfigKeyRef.current = "";
      return;
    }
    let disposed = false;

    async function disposeRuntimeConfig() {
      if (waifuConfigUrlRef.current) {
        URL.revokeObjectURL(waifuConfigUrlRef.current);
        waifuConfigUrlRef.current = null;
      }
    }

    async function syncLive2D() {
      try {
        if (authLoading) {
          setIsEnabled(false);
          teardownLive2D(live2dWindow);
          return;
        }

        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => resolve());
        });
        if (disposed) return;

        // 仅在用户身份变化或缓存为空时才真正拉取组件数据；显隐切换（isVisible）复用缓存，不再触发网络请求
        const currentUserId = user?._id;
        let cached = cachedLive2dRef.current;
        if (!cached || cached.userId !== currentUserId) {
          const settings = currentUserId
            ? (await getMyComponents()).components.live2d
            : DEFAULT_LIVE2D_SETTINGS;
          if (disposed) return;
          cached = { userId: currentUserId, settings };
          cachedLive2dRef.current = cached;
        }
        const live2d = cached.settings;

        setIsEnabled(live2d.enabled);
        const nextConfigKey = getConfigKey(live2d);
        if (
          isVisible &&
          nextConfigKey === latestConfigKeyRef.current &&
          live2dWindow.__ideahubLive2dBootstrapped
        ) {
          return;
        }

        latestConfigKeyRef.current = nextConfigKey;

        if (!live2d.enabled || !isVisible) {
          teardownLive2D(live2dWindow);
          live2dWindow.__ideahubLive2dBootstrapped = false;
          live2dWindow.__ideahubLive2dConfigKey = nextConfigKey;
          return;
        }

        await Promise.all([
          ensureStyle(`${LIVE2D_BASE}/waifu.css`),
          ensureModuleScript(`${LIVE2D_BASE}/waifu-tips.js?v=${LIVE2D_SCRIPT_VERSION}`),
        ]);
        if (disposed) return;

        if (typeof live2dWindow.initWidget !== "function") {
          throw new Error("initWidget is not available after loading Live2D assets.");
        }

        const activeModelUrl = activeLive2dModelUrl(live2d);
        await disposeRuntimeConfig();
        waifuConfigUrlRef.current = await buildWaifuConfigUrl(activeModelUrl);
        if (disposed) return;

        teardownLive2D(live2dWindow);
        localStorage.removeItem("waifu-display");
        live2dWindow.initWidget({
          waifuPath: waifuConfigUrlRef.current,
          cubism2Path: `${LIVE2D_BASE}/live2d.min.js`,
          cubism5Path: "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
          tools: [],
          modelId: 0,
          drag: true,
          logLevel: "error",
        });
        document.getElementById("waifu-toggle")?.remove();
        settleWidgetPhysicsOnOpen(live2dWindow, () => disposed);
        window.requestAnimationFrame(() => {
          if (disposed) return;
          mountCloseToolButton(hideLive2D);
          mountSampleCredit(activeModelUrl);
        });

        live2dWindow.__ideahubLive2dBootstrapped = true;
        live2dWindow.__ideahubLive2dConfigKey = nextConfigKey;
      } catch (error) {
        console.warn("[IdeaHub] Failed to initialize Live2D widget.", error);
      }
    }

    void syncLive2D();

    function handleComponentsUpdated() {
      // 组件配置刚被用户改动，清空缓存以便本次同步重新拉取最新设置
      cachedLive2dRef.current = null;
      void syncLive2D();
    }

    window.addEventListener("ideahub:components-updated", handleComponentsUpdated);
    return () => {
      disposed = true;
      window.removeEventListener("ideahub:components-updated", handleComponentsUpdated);
      teardownLive2D(live2dWindow);
      void disposeRuntimeConfig();
    };
  }, [authLoading, isVisible, onHome, onLandingPhone, user?._id]);

  function hideLive2D() {
    const nextSide = getReopenSideFromWidget();
    setStoredReopenSide(nextSide);
    setReopenSide(nextSide);
    setStoredVisibility(false);
    setIsVisible(false);
  }

  function showLive2D() {
    setStoredVisibility(true);
    setIsVisible(true);
  }

  if (!isEnabled || onHome || onLandingPhone) {
    return null;
  }

  return (
    <>
      {!isVisible ? (
        <button
          type="button"
          className={`site-live2d-reopen site-live2d-reopen-${reopenSide}`}
          onClick={showLive2D}
          aria-label="Show Live2D assistant"
          title="Show Live2D assistant"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512" aria-hidden="true">
            <path d="M96 64a64 64 0 1 1 128 0A64 64 0 1 1 96 64zm48 320l0 96c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-192.2L59.1 321c-9.4 15-29.2 19.4-44.1 10S-4.5 301.9 4.9 287l39.9-63.3C69.7 184 113.2 160 160 160s90.3 24 115.2 63.6L315.1 287c9.4 15 4.9 34.7-10 44.1s-34.7 4.9-44.1-10L240 287.8 240 480c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-96-32 0z" />
          </svg>
        </button>
      ) : null}
    </>
  );
}