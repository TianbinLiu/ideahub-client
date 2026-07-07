import { useEffect, useRef, useState } from "react";
import "./SiteLive2D.css";
import { getMyComponents, type Live2DComponentSettings } from "../api";
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
const DEFAULT_REMOTE_MODEL_URL = "https://fastly.jsdelivr.net/gh/Live2D/CubismWebSamples/Samples/Resources/Hiyori/Hiyori.model3.json";
const DEFAULT_LIVE2D_SETTINGS: Live2DComponentSettings = {
  enabled: true,
  source: "remote",
  modelJsonUrl: DEFAULT_REMOTE_MODEL_URL,
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
  const latestConfigKeyRef = useRef("");
  const waifuConfigUrlRef = useRef<string | null>(null);
  const [isVisible, setIsVisible] = useState(getStoredVisibility);
  const [isEnabled, setIsEnabled] = useState(false);
  const [reopenSide, setReopenSide] = useState<ReopenSide>(getStoredReopenSide);

  useEffect(() => {
    const live2dWindow = window as Live2DWindow;
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

        const live2d = user?._id
          ? (await getMyComponents()).components.live2d
          : DEFAULT_LIVE2D_SETTINGS;
        if (disposed) return;

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

        const activeModelUrl = live2d.source === "uploaded" && live2d.uploadedModelJsonUrl
          ? live2d.uploadedModelJsonUrl
          : live2d.modelJsonUrl;
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
        window.requestAnimationFrame(() => {
          if (disposed) return;
          mountCloseToolButton(hideLive2D);
        });

        live2dWindow.__ideahubLive2dBootstrapped = true;
        live2dWindow.__ideahubLive2dConfigKey = nextConfigKey;
      } catch (error) {
        console.warn("[IdeaHub] Failed to initialize Live2D widget.", error);
      }
    }

    void syncLive2D();

    function handleComponentsUpdated() {
      void syncLive2D();
    }

    window.addEventListener("ideahub:components-updated", handleComponentsUpdated);
    return () => {
      disposed = true;
      window.removeEventListener("ideahub:components-updated", handleComponentsUpdated);
      teardownLive2D(live2dWindow);
      void disposeRuntimeConfig();
    };
  }, [authLoading, isVisible, user?._id]);

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

  if (!isEnabled) {
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