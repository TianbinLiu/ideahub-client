/**
 * @file ExtensionGateModal.tsx - 卢本伟广场 · 插件门禁弹窗（需求 7 + 8a）
 * @category Component
 * @i18n none（广场系页面统一中文，与 ArenaPage / ExtensionSettingsPage 一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建组件必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 *
 * 职责（严格按需求顺序）:
 *   要求安装插件 → 免责说明 → 用户勾选同意 → 「去商店安装」→ 「我已装好，重新检测」
 * - 检测到已安装 → 过渡加载动画 → onPass()（守卫场景放行 / 导航栏场景跳 /arena）
 *
 * 两条不许违反的文案红线:
 * - ★不得谎称「一键安装」：Chrome 早在 2018 年就下线了网页内联安装（chrome.webstore.install），
 *   网页【没有能力】替用户装扩展。按钮只能是「去商店安装」，装完回来点重新检测。
 * - ★商店地址未配置时按钮置灰并说明「插件尚未上架」，不给死链：
 *   点了跳 404 比按钮是灰的更伤人。
 *
 * 免责说明为什么必须在勾选之前:
 * - 插件读的是用户浏览的页面内容。这属于「用户必须先知情、再自己决定」的事，
 *   所以同意勾选框放在说明之后，且未勾选前两个行动按钮都不可用。
 *
 * 依赖文件:
 * @uses ../config.ts - EXT_STORE_URL（已做 http/https 校验；"" = 未配置）
 * @uses ../hooks/useExtensionInstalled.ts - ExtensionStatus 类型
 *
 * 被使用于:
 * @used_in ./ArenaGate.tsx - 路由守卫（不可关闭）
 * @used_in ./Navbar.tsx - 炸弹入口（可关闭）
 */

import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, Puzzle, RefreshCw, ShieldCheck, X } from "lucide-react";
import { EXT_STORE_URL } from "../config";
import type { ExtensionStatus } from "../hooks/useExtensionInstalled";

/** 过渡动画时长：短到不烦人，长到能让「检测到了」这件事被看见 */
const TRANSITION_MS = 900;

/** 广场系过渡加载动画（门禁与守卫共用） */
export function ArenaTransitionLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6" role="status" aria-live="polite">
      <span className="relative inline-flex h-14 w-14 items-center justify-center">
        {/* 无障碍：prefers-reduced-motion 下不转圈，只留静态环 + 文案说明状态 */}
        <span className="absolute inset-0 rounded-full border-2 border-gray-800" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 motion-safe:animate-spin" />
        <Puzzle className="h-6 w-6 text-cyan-300" />
      </span>
      <p className="text-sm text-gray-300">{label}</p>
    </div>
  );
}

export type ExtensionGateModalProps = {
  status: ExtensionStatus;
  /** 插件自报版本号，检测到后展示，便于用户/客服确认装的是哪版 */
  version: string;
  onRecheck: () => void;
  /** 检测到已安装且过渡动画播完时触发 */
  onPass: () => void;
  /** 传了才可关闭（导航栏场景）；不传 = 不可关闭（路由守卫场景） */
  onClose?: () => void;
};

export default function ExtensionGateModal({
  status,
  version,
  onRecheck,
  onPass,
  onClose,
}: ExtensionGateModalProps) {
  const [agreed, setAgreed] = useState(false);
  const titleId = useId();
  const consentId = useId();

  // onPass 常被父组件写成内联箭头函数（每次渲染都是新引用）。放进 effect 依赖会让
  // 定时器被反复重建，过渡动画永远播不完 —— 用 ref 存最新引用，effect 只依赖 status。
  const onPassRef = useRef(onPass);
  useEffect(() => {
    onPassRef.current = onPass;
  });

  const installed = status === "installed";
  const checking = status === "checking";

  // 检测到已安装 → 播过渡动画 → 放行
  useEffect(() => {
    if (!installed) return;
    const timer = window.setTimeout(() => onPassRef.current(), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [installed]);

  // 可关闭场景下支持 Esc（不可关闭场景不注册：按 Esc 什么都不该发生）
  useEffect(() => {
    if (!onClose) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function openStore() {
    if (!EXT_STORE_URL) return;
    window.open(EXT_STORE_URL, "_blank", "noopener,noreferrer");
  }

  return (
    <div
      className="fixed inset-0 z-[2300] flex items-start justify-center bg-black/60 px-4 py-10 backdrop-blur-sm"
      role="presentation"
    >
      {/* 背景点击关闭：仅可关闭场景。守卫场景故意不给退路 —— 关掉就等于空手进广场 */}
      {onClose ? <div className="absolute inset-0" onClick={onClose} aria-hidden="true" /> : null}

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-gray-800 bg-gray-950 shadow-2xl"
      >
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-4 top-4 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 hover:bg-gray-900 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}

        {installed ? (
          <ArenaTransitionLoader label={version ? `已检测到插件 v${version}，正在进入广场…` : "已检测到插件，正在进入广场…"} />
        ) : (
          <div className="max-h-[80vh] overflow-y-auto p-6">
            {/* ① 要求安装插件 */}
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
                <Puzzle className="h-6 w-6" />
              </span>
              <div>
                <h2 id={titleId} className="text-lg font-bold text-white">
                  需要先安装浏览器插件
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">卢本伟广场的能力都跑在插件里</p>
              </div>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-gray-300">
              发言方案推荐、表情梗图插入、悬赏发言追踪都由插件在页面上完成。没有插件，广场里的功能只是一堆看不见效果的入口，
              所以这里先拦一道。
            </p>

            {/* ② 免责说明（必须在勾选之前） */}
            <section className="mt-5 rounded-2xl border border-amber-700/40 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <h3 className="text-sm font-semibold">安装前请知情</h3>
              </div>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-gray-300">
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                  <span>插件会<strong className="font-semibold text-amber-100">读取你浏览的页面内容</strong>，用来生成贴合当前语境的发言方案。</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                  <span>这些数据会用于<strong className="font-semibold text-amber-100">生成你的个人风格分析</strong>，让推荐越来越像你自己。</span>
                </li>
                <li className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                  <span>你可以<strong className="font-semibold text-amber-100">随时在插件设置里关闭</strong>（插件弹窗或 <span className="whitespace-nowrap">/arena/extension</span> 页面）。</span>
                </li>
              </ul>
            </section>

            {/* ③ 勾选同意 */}
            <label
              htmlFor={consentId}
              className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 p-4 hover:border-gray-700"
            >
              <input
                id={consentId}
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
              />
              <span className="text-sm text-gray-200">我已阅读并理解上述说明，同意安装并使用插件</span>
            </label>

            {/* ④ 去商店安装 + ⑤ 我已装好，重新检测 */}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={openStore}
                disabled={!agreed || !EXT_STORE_URL}
                title={EXT_STORE_URL ? "在新标签页打开插件商店" : "商店地址未配置（插件尚未上架）"}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
              >
                <ExternalLink className="h-4 w-4" /> 去商店安装
              </button>
              <button
                type="button"
                onClick={onRecheck}
                disabled={!agreed || checking}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-700 px-4 py-2.5 text-sm font-semibold text-gray-100 hover:bg-gray-900 disabled:cursor-not-allowed disabled:border-gray-800 disabled:text-gray-500"
              >
                <RefreshCw className={`h-4 w-4 ${checking ? "motion-safe:animate-spin" : ""}`} />
                {checking ? "检测中…" : "我已装好，重新检测"}
              </button>
            </div>

            {!EXT_STORE_URL ? (
              <p className="mt-2 text-xs text-amber-300/90">商店地址未配置（插件尚未上架）</p>
            ) : null}

            {status === "missing" && agreed ? (
              <p className="mt-2 text-xs text-gray-500">还是没检测到插件？装好后可能需要刷新本页，或确认插件在本站是启用状态。</p>
            ) : null}

            {/* 诚实说明：网页装不了扩展，别让用户以为点一下就完事 */}
            <div className="mt-5 flex gap-2 rounded-2xl border border-gray-800 bg-gray-900/40 p-4">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
              <p className="text-xs leading-relaxed text-gray-400">
                网页无法替你安装扩展（Chrome 已于 2018 年移除网页内联安装），只能由你在商店里手动点「添加至浏览器」。
                装好后回到本页点「我已装好，重新检测」，检测通过会自动放行。支持 Chrome / Edge 等 Chromium 内核浏览器。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
