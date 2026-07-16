/**
 * @file ArenaGate.tsx - 卢本伟广场 · 路由守卫（需求 7）
 * @category Component
 * @i18n none
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建组件必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 *
 * 职责:
 * - 包住 /arena 及其【所有子路由】：checking → 过渡动画；missing → 门禁；installed → 放行
 *
 * ★为什么必须守在路由层:
 *   只在 navbar 的炸弹图标上拦是假的 —— 用户直接在地址栏敲 /arena、或点站内任何一条
 *   /arena/* 链接、或从收藏夹进来，都绕过了图标。守卫挂在 layout route 上才是每条路径都过。
 *
 * 依赖文件:
 * @uses ../hooks/useExtensionInstalled.ts - PING/PONG 探测
 * @uses ./ExtensionGateModal.tsx - 门禁 UI + 过渡动画
 *
 * 被使用于:
 * @used_in ./ArenaLayout.tsx - 由它把 /arena/* 整片包住
 */

import { useState, type ReactNode } from "react";
import ExtensionGateModal, { ArenaTransitionLoader } from "./ExtensionGateModal";
import { useExtensionInstalled } from "../hooks/useExtensionInstalled";

export default function ArenaGate({ children }: { children: ReactNode }) {
  const { status, version, recheck } = useExtensionInstalled();
  // 门禁一旦弹出就保持挂载（这个 latch 就是为此存在）：recheck 期间 status 会回到 "checking"，
  // 若此时按 status 切回加载动画，门禁会被卸载，用户勾好的「同意」也跟着没了 ——
  // 每重试一次就要重勾一次，很烦人。
  const [gateShown, setGateShown] = useState(false);
  const [passed, setPassed] = useState(false);

  // 渲染期直接改状态（React 官方的 "adjusting state while rendering" 写法）：
  // React 会丢弃本次输出并立刻用新状态重渲染，不落屏、不多跑一轮 effect 级联。
  // 用 effect 写反而会先渲染一帧「加载动画」再切成门禁，闪一下。
  if (status === "missing" && !gateShown) setGateShown(true);

  const showGate = gateShown || status === "missing";

  // 已装插件的正常访问：直接进，不拿过渡动画挡路
  if (passed || (status === "installed" && !showGate)) return <>{children}</>;

  if (!showGate) return <ArenaTransitionLoader label="正在检测插件…" />;

  return (
    <ExtensionGateModal
      status={status}
      version={version}
      onRecheck={recheck}
      onPass={() => setPassed(true)}
    />
  );
}
