/**
 * @file chatSkins/index.ts - 聊天平台 → 聊天皮肤组件的注册表（sceneKind==='chat' 专用）。
 * @category Component
 *
 * 与评论皮肤注册表 ../skins/index.ts 同一条纪律：
 *   · 这张表只做「platform 字符串 → 组件」的映射，value 是组件、不是样式字段包；
 *   · 【禁止别名复用】：每个 platform 指向它自己的组件，不许两个 key 指向同一个皮肤。
 *
 * 🔄 新增聊天平台时必须【三处同改】，缺一个就会退化：
 *   1. 这里加聊天皮肤组件（否则 fallback 到 GenericChatSkin，白加）
 *   2. server/src/models/Scenario.js 的 SCENARIO_PLATFORMS 加枚举（否则后端静默降级为 generic）
 *   3. client/src/pages/ScenarioEditorPage.tsx 的 CHAT_PLATFORM_OPTIONS 加选项（否则用户选不到）
 *   （评论皮肤那条「platformFromHost 认域名」对聊天平台 N/A：聊天场景不走「贴 URL 抓评论」。）
 */
import type { ComponentType } from "react";
import type { ChatSkinProps } from "./types";
import WechatChatSkin from "./WechatChatSkin";
import QqChatSkin from "./QqChatSkin";
import GenericChatSkin from "./GenericChatSkin";

/** 每个聊天平台一个【专属】组件；不存在别名复用。 */
export const CHAT_SKIN_COMPONENTS = {
  wechat: WechatChatSkin,
  qq: QqChatSkin,
  generic: GenericChatSkin,
} satisfies Record<string, ComponentType<ChatSkinProps>>;

/** 有专属聊天皮肤的平台 key。 */
export type ChatSkinPlatform = keyof typeof CHAT_SKIN_COMPONENTS;

/**
 * platform → 聊天皮肤组件。未知平台走 GenericChatSkin（与后端 normalizePlatform 的 generic 兜底一致）。
 * 大小写不敏感：后端存的是小写，但预览可能拿到用户手填的值。
 * 返回的永远是模块级常量组件（引用稳定），理由见 PlatformCommentView 里 resolveSkin 的注释。
 */
export function resolveChatSkin(platform: string): ComponentType<ChatSkinProps> {
  const key = String(platform || "").trim().toLowerCase();
  return (CHAT_SKIN_COMPONENTS as Record<string, ComponentType<ChatSkinProps>>)[key] ?? GenericChatSkin;
}
