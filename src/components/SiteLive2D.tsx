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
const LIVE2D_VISIBILITY_KEY = "ideahub-live2d-visible";
const LIVE2D_CLOSE_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512" aria-hidden="true"><path d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"></path></svg>';

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
  if (document.querySelector(`link[data-live2d-style=\"${href}\"]`)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.live2dStyle = href;
    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load ${href}`));
    document.head.appendChild(link);
  });
}

function ensureModuleScript(src: string) {
  if (document.querySelector(`script[data-live2d-script=\"${src}\"]`)) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.dataset.live2dScript = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

export default function SiteLive2D() {
  const { user } = useAuth();
  const latestConfigKeyRef = useRef("");
  const waifuConfigUrlRef = useRef<string | null>(null);
  const [isVisible, setIsVisible] = useState(getStoredVisibility);
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    const live2dWindow = window as Live2DWindow;

    async function disposeRuntimeConfig() {
      if (waifuConfigUrlRef.current) {
        URL.revokeObjectURL(waifuConfigUrlRef.current);
        waifuConfigUrlRef.current = null;
      }
    }

    if (!user?._id) {
      teardownLive2D(live2dWindow);
      live2dWindow.__ideahubLive2dBootstrapped = false;
      live2dWindow.__ideahubLive2dConfigKey = "";
      latestConfigKeyRef.current = "";
      setIsEnabled(false);
      void disposeRuntimeConfig();
      return;
    }

    async function syncLive2D() {
      try {
        const res = await getMyComponents();
        const live2d = res.components.live2d;
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
          ensureModuleScript(`${LIVE2D_BASE}/waifu-tips.js`),
        ]);

        if (typeof live2dWindow.initWidget !== "function") {
          throw new Error("initWidget is not available after loading Live2D assets.");
        }

        const activeModelUrl = live2d.source === "uploaded" && live2d.uploadedModelJsonUrl
          ? live2d.uploadedModelJsonUrl
          : live2d.modelJsonUrl;
        await disposeRuntimeConfig();
        waifuConfigUrlRef.current = await buildWaifuConfigUrl(activeModelUrl);

        teardownLive2D(live2dWindow);
        localStorage.removeItem("waifu-display");
        live2dWindow.initWidget({
          waifuPath: waifuConfigUrlRef.current,
          cubism2Path: `${LIVE2D_BASE}/live2d.min.js`,
          cubism5Path: "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
          tools: [],
          modelId: 0,
          drag: true,
          logLevel: "warn",
        });
        document.getElementById("waifu-toggle")?.remove();
        window.requestAnimationFrame(() => {
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
      window.removeEventListener("ideahub:components-updated", handleComponentsUpdated);
      teardownLive2D(live2dWindow);
      void disposeRuntimeConfig();
    };
  }, [isVisible, user?._id]);

  function hideLive2D() {
    setStoredVisibility(false);
    setIsVisible(false);
  }

  function showLive2D() {
    setStoredVisibility(true);
    setIsVisible(true);
  }

  if (!user?._id || !isEnabled) {
    return null;
  }

  return (
    <>
      {!isVisible ? (
        <button
          type="button"
          className="site-live2d-reopen"
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