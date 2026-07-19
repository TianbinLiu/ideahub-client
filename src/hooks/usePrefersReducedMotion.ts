/**
 * @file usePrefersReducedMotion.ts - 读取用户的「减少动态效果」系统偏好
 * @category Hook
 * @i18n none
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 的 hooks 章节
 *
 * 职责:
 * - 返回 prefers-reduced-motion: reduce 是否命中，并跟随系统设置变化实时更新
 *
 * 为什么用 JS 读而不是只写 motion-reduce: 类:
 * - 广场主界面的挤压效果要的是「整个效果不存在」，不是「效果瞬间完成」。用 Tailwind 的
 *   motion-reduce: 覆盖要靠 !important 压同优先级的 md: 类，容易被后来的改动悄悄压回去；
 *   在 JS 里直接不进入 active/dimmed 分支，读代码的人一眼就知道是关掉了。
 * - 前庭功能障碍用户会被大幅缩放/位移诱发眩晕，这个偏好不是装饰性开关。
 *
 * 为什么是 useSyncExternalStore:
 * - matchMedia 是典型的「React 之外的状态源」。用 useState+useEffect 订阅会在首帧后
 *   多跑一轮渲染，还得自己处理「mount 前偏好就变了」的对齐；useSyncExternalStore 是
 *   React 给这类外部源的正规入口，首帧就拿到正确值。
 * - 本项目是纯客户端 Vite SPA（无 SSR），故不需要传 getServerSnapshot。
 *
 * 被使用于:
 * @used_in ../pages/ArenaPage.tsx - 三块主界面的悬浮挤压动画
 */

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

/** 返回 boolean 这种原始值，快照才能按值比较，不会每次都被判定成“变了”而重渲染 */
function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot);
}

export default usePrefersReducedMotion;
