import { useEffect, useRef } from "react";
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
};

const LIVE2D_BASE = "/live2d-widget";

function removeWidgetDom() {
  document.getElementById("waifu")?.remove();
  document.getElementById("waifu-toggle")?.remove();
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

  useEffect(() => {
    const live2dWindow = window as Live2DWindow;

    async function disposeRuntimeConfig() {
      if (waifuConfigUrlRef.current) {
        URL.revokeObjectURL(waifuConfigUrlRef.current);
        waifuConfigUrlRef.current = null;
      }
    }

    if (!user?._id) {
      removeWidgetDom();
      live2dWindow.__ideahubLive2dBootstrapped = false;
      live2dWindow.__ideahubLive2dConfigKey = "";
      latestConfigKeyRef.current = "";
      void disposeRuntimeConfig();
      return;
    }

    async function syncLive2D() {
      try {
        const res = await getMyComponents();
        const live2d = res.components.live2d;
        const nextConfigKey = getConfigKey(live2d);
        if (nextConfigKey === latestConfigKeyRef.current && live2dWindow.__ideahubLive2dBootstrapped) {
          return;
        }

        latestConfigKeyRef.current = nextConfigKey;

        if (!live2d.enabled) {
          removeWidgetDom();
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

        removeWidgetDom();
        localStorage.removeItem("waifu-display");
        live2dWindow.initWidget({
          waifuPath: waifuConfigUrlRef.current,
          cubism2Path: `${LIVE2D_BASE}/live2d.min.js`,
          cubism5Path: "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
          tools: ["hitokoto", "switch-model", "photo", "quit"],
          modelId: 0,
          drag: true,
          logLevel: "warn",
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
      void disposeRuntimeConfig();
    };
  }, [user?._id]);

  return null;
}