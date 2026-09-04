/**
 * @file scenes.ts - 首页场景背景清单与本机偏好
 * @category Utility
 *
 * 背景图是 Seedream 生成后转 webp 的静态资源（public/backgrounds/，1920×1080 + 缩略图），
 * "default" = 不铺图，保留站点原本的深蓝底（bg-gray-950）。
 * 偏好只存 localStorage：这是纯观感设置，不值得占一个后端字段，也不该跨设备同步吓到用户。
 */

export type SceneKey = "default" | "tavern" | "bedroom" | "library" | "balcony" | "cafe" | "atelier";

export const SCENES: Array<{ key: SceneKey; image: string; thumb: string }> = [
  { key: "default", image: "", thumb: "" },
  { key: "tavern", image: "/backgrounds/tavern.webp", thumb: "/backgrounds/tavern-thumb.webp" },
  { key: "bedroom", image: "/backgrounds/bedroom.webp", thumb: "/backgrounds/bedroom-thumb.webp" },
  { key: "library", image: "/backgrounds/library.webp", thumb: "/backgrounds/library-thumb.webp" },
  { key: "balcony", image: "/backgrounds/balcony.webp", thumb: "/backgrounds/balcony-thumb.webp" },
  { key: "cafe", image: "/backgrounds/cafe.webp", thumb: "/backgrounds/cafe-thumb.webp" },
  { key: "atelier", image: "/backgrounds/atelier.webp", thumb: "/backgrounds/atelier-thumb.webp" },
];

const STORAGE_KEY = "ideahub-home-scene";

export function isSceneKey(value: unknown): value is SceneKey {
  return SCENES.some((scene) => scene.key === value);
}

export function readScene(): SceneKey {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isSceneKey(raw) ? raw : "default";
  } catch {
    return "default";
  }
}

export function saveScene(scene: SceneKey) {
  try {
    localStorage.setItem(STORAGE_KEY, scene);
  } catch {
    // 隐私模式等写不进去就算了，下次打开回默认
  }
}

export function sceneImage(scene: SceneKey) {
  return SCENES.find((item) => item.key === scene)?.image || "";
}
