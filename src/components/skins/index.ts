/**
 * @file skins/index.ts - 平台 → 皮肤组件的注册表。
 * @category Component
 *
 * ★★ 这张表【只做一件事】：把 platform 字符串映射到一个组件。
 *   它【不是】样式配置表 —— value 是组件，不是 { color, label, icon } 这种字段包。
 *   上一版的 PLATFORM_SKIN 表把 zhihu 指向 bilibili 皮肤、instagram 指向 weibo 皮肤
 *   （「复用」相近皮肤），审计判定为「不是专属皮肤」。本表【禁止别名复用】：
 *   每个 platform 必须指向它自己的组件，不许两个 key 指向同一个皮肤。
 *
 * 🔄 新增平台时必须【三处同改】，缺一个就会退化：
 *   1. 这里加皮肤组件（否则 fallback 到 GenericSkin，白加）
 *   2. server/src/models/Scenario.js 的 SCENARIO_PLATFORMS 加枚举（否则后端静默降级为 generic）
 *   3. client/src/pages/ScenarioEditorPage.tsx 的 PLATFORM_OPTIONS 加选项（否则用户选不到）
 *   另外若插件也要认这个域名，见 server/src/controllers/scenario.controller.js 的 platformFromHost 注释。
 */
import type { ComponentType } from "react";
import type { SkinProps } from "./types";
import BilibiliSkin from "./BilibiliSkin";
import WeiboSkin from "./WeiboSkin";
import TiebaSkin from "./TiebaSkin";
import ZhihuSkin from "./ZhihuSkin";
import InstagramSkin from "./InstagramSkin";
import DouyinSkin from "./DouyinSkin";
import XiaohongshuSkin from "./XiaohongshuSkin";
import GenericSkin from "./GenericSkin";

/** 每个 platform 一个【专属】组件；不存在别名复用。 */
export const SKIN_COMPONENTS = {
  bilibili: BilibiliSkin,
  weibo: WeiboSkin,
  tieba: TiebaSkin,
  zhihu: ZhihuSkin,
  instagram: InstagramSkin,
  douyin: DouyinSkin,
  xiaohongshu: XiaohongshuSkin,
  generic: GenericSkin,
} satisfies Record<string, ComponentType<SkinProps>>;

/** 有专属皮肤的平台 key。 */
export type SkinPlatform = keyof typeof SKIN_COMPONENTS;

/**
 * platform → 皮肤组件。未知平台走 GenericSkin（与后端 normalizePlatform 的 generic 兜底一致）。
 * 大小写不敏感：后端存的是小写，但预览页可能拿到用户手填的值。
 */
export function resolveSkin(platform: string): ComponentType<SkinProps> {
  const key = String(platform || "").trim().toLowerCase();
  return (SKIN_COMPONENTS as Record<string, ComponentType<SkinProps>>)[key] ?? GenericSkin;
}
