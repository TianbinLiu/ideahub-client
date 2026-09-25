/**
 * @file chatContext.ts - 对话记忆的纯逻辑：上下文用量的显示、老服务端识别
 * @category Utility
 *
 * 用量环（CompanionChat）与「小梦记得的事」面板（CompanionMemoryPanel）共用；规则只写这一处。
 * 上下文用量的含义见 app 仓 docs/api-contract.md「对话记忆」：used = 上一轮 prompt + completion tokens，
 * budget 是产品预算（陪聊 32k），level 由服务端算好（ok / warn ≥60% / compact ≥75% / full）。
 */
import type { ChatContext, ChatContextLevel } from "../api";

/** 850 → "850"；1234 → "1.2k"；32000 → "32k" */
export function formatTokens(n: number): string {
  const v = Math.max(0, Math.round(Number(n) || 0));
  if (v < 1000) return String(v);
  if (v < 10000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(v / 1000)}k`;
}

/** 0～100 的整数百分比（超预算也封顶 100，环不画出界） */
export function contextPercent(ctx: ChatContext | null | undefined): number {
  if (!ctx || !(ctx.budget > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((ctx.used / ctx.budget) * 100)));
}

/** 用量环 / 进度条的颜色（tailwind 类名）：ok 青、warn 黄、compact 橙、full 红 */
export function contextTone(level: ChatContextLevel | undefined): { stroke: string; text: string; bar: string } {
  switch (level) {
    case "warn":
      return { stroke: "stroke-amber-300", text: "text-amber-200", bar: "bg-amber-300" };
    case "compact":
      return { stroke: "stroke-orange-400", text: "text-orange-200", bar: "bg-orange-400" };
    case "full":
      return { stroke: "stroke-rose-400", text: "text-rose-200", bar: "bg-rose-400" };
    default:
      return { stroke: "stroke-cyan-300", text: "text-cyan-200", bar: "bg-cyan-300" };
  }
}

/**
 * 老服务端（还不认 { message, threadId }）对新写法的回应：400 VALIDATION_ERROR，且 zod 抱怨的是缺 `messages`。
 * 认出来就退回旧写法（客户端自带历史）—— 网站与服务端分开部署，先后顺序不能指望。
 * 新服务端对合法的新写法不会回这个（两种都给 / 都不给的 400 是 path 为空的 refine 错误）。
 */
export function isLegacyChatRejection(error: unknown): boolean {
  const e = error as { status?: number; code?: string; details?: unknown } | null;
  if (!e || e.status !== 400 || e.code !== "VALIDATION_ERROR" || !Array.isArray(e.details)) return false;
  return e.details.some((issue) => Array.isArray((issue as { path?: unknown[] })?.path) && (issue as { path: unknown[] }).path[0] === "messages");
}
