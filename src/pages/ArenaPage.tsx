/**
 * @file ArenaPage.tsx - 卢本伟广场 · 主界面（需求 8b + 8d）
 * @category Page
 * @route /arena （经 ArenaLayout → ArenaGate 守卫，未装插件进不来）
 * @i18n none（广场系页面统一中文，与 ExtensionSettingsPage / ArenaProfilePage 一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - ★【只有三块】：情景模拟 / 赏金猎人 / 人格市场。此页是纯分发口，不承载任何功能实现。
 * - 悬浮某块 → 该块拉伸/高亮，其余变灰并被挤压；移到别块 → 上一块复原、被新块挤压。
 *
 * 这里【故意】没有的东西（都已各归其位，别再搬回来）:
 * - Hero / 数据概览 / 运作流程 / 页脚说明：噪音，删。
 * - 立场展开、素材库（创意工坊）→ 已在 /arena/extension；发言风格面板 → 已在 /arena/profile。
 *   两处都由 ArenaNavbar 的用户小菜单进入，此页不重复实现、也不再放入口。
 *
 * 动画实现口径（需求 8d）:
 * - 只过渡 flex-grow / filter / opacity / transform，【不】逐帧改 width：
 *   width 每帧都触发整行重排，块里还有文字，滚动一次就能看出掉帧；flex-grow 走的是同一套
 *   flex 分配，浏览器能合成得更省。
 * - 窄屏（< md）降级为纵向堆叠且完全不挤压：手机上把三块挤成一条缝没有任何意义。
 * - ★prefers-reduced-motion: reduce → 挤压/放大整个不发生（见 usePrefersReducedMotion 注释）。
 *
 * 依赖文件:
 * @uses ../hooks/usePrefersReducedMotion.ts - 无障碍：关掉挤压动画
 *
 * 被使用于:
 * @used_in ../App.tsx - 路由 /arena
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { ArrowRight, Store, Swords, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

type ArenaBlock = {
  key: string;
  to: string;
  titleKey: string;
  taglineKey: string;
  descKey: string;
  pointKeys: string[];
  icon: LucideIcon;
  /** Tailwind 类必须是完整字面量：拼接出来的类名会被 JIT 扫不到而不生成样式 */
  iconWrap: string;
  activeBorder: string;
  glow: string;
  bullet: string;
};

/** 左 / 中 / 右 —— 顺序即需求原文顺序 */
const BLOCKS: ArenaBlock[] = [
  {
    key: "simulate",
    to: "/arena/simulate",
    titleKey: "simulateTitle",
    taglineKey: "simulateTagline",
    descKey: "simulateDesc",
    pointKeys: ["simulatePoint1", "simulatePoint2", "simulatePoint3"],
    icon: Swords,
    iconWrap: "bg-cyan-500/10 text-cyan-300",
    activeBorder: "border-cyan-500/60",
    glow: "bg-cyan-500/10",
    bullet: "bg-cyan-400",
  },
  {
    key: "bounty",
    to: "/arena/bounty",
    titleKey: "bountyTitle",
    taglineKey: "bountyTagline",
    descKey: "bountyDesc",
    pointKeys: ["bountyPoint1", "bountyPoint2", "bountyPoint3"],
    icon: Target,
    iconWrap: "bg-amber-500/10 text-amber-300",
    activeBorder: "border-amber-500/60",
    glow: "bg-amber-500/10",
    bullet: "bg-amber-400",
  },
  {
    key: "persona",
    to: "/arena/persona",
    titleKey: "personaTitle",
    taglineKey: "personaTagline",
    descKey: "personaDesc",
    pointKeys: ["personaPoint1", "personaPoint2", "personaPoint3"],
    icon: Store,
    iconWrap: "bg-fuchsia-500/10 text-fuchsia-300",
    activeBorder: "border-fuchsia-500/60",
    glow: "bg-fuchsia-500/10",
    bullet: "bg-fuchsia-400",
  },
];

export default function ArenaPage() {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // 减少动态效果 → 永远当作「没有块被悬浮」：不放大、不挤压、不变灰。
  // 链接照常可点，功能一点不少，只是不动。
  const activeKey = reducedMotion ? null : hovered;

  return (
    <div className="mx-auto max-w-7xl p-4">
      <div className="flex flex-col gap-4 md:h-[clamp(420px,calc(100vh_-_9rem),620px)] md:flex-row">
        {BLOCKS.map((block) => {
          const Icon = block.icon;
          const isActive = activeKey === block.key;
          const isDimmed = activeKey !== null && !isActive;

          // 只有 md 以上才动：窄屏是纵向堆叠，挤压会把块挤没
          const flexClass = isActive
            ? "md:flex-[2.2_1_0%]"
            : isDimmed
              ? "md:flex-[0.7_1_0%]"
              : "md:flex-[1_1_0%]";

          return (
            <Link
              key={block.key}
              to={block.to}
              onMouseEnter={() => setHovered(block.key)}
              onMouseLeave={() => setHovered(null)}
              // 键盘用户也该看到同样的高亮，否则 Tab 过去完全没有反馈
              onFocus={() => setHovered(block.key)}
              onBlur={() => setHovered(null)}
              aria-label={`${t(`arena.landing.${block.titleKey}`)} · ${t(`arena.landing.${block.taglineKey}`)}`}
              className={[
                "group relative flex min-h-[180px] flex-col overflow-hidden rounded-3xl border bg-gray-900 p-6",
                "outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70",
                "transition-[flex-grow,filter,opacity,border-color] duration-500 ease-out motion-reduce:transition-none",
                "md:min-h-0",
                flexClass,
                isActive ? block.activeBorder : "border-gray-800",
                isDimmed ? "md:opacity-55 md:grayscale" : "opacity-100 grayscale-0",
              ].join(" ")}
            >
              <div
                className={[
                  "pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl",
                  "transition-opacity duration-500 motion-reduce:transition-none",
                  block.glow,
                  isActive ? "opacity-100" : "opacity-0",
                ].join(" ")}
                aria-hidden="true"
              />

              <div className="relative flex h-full flex-col">
                <span
                  className={[
                    "inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl",
                    "transition-transform duration-500 ease-out motion-reduce:transition-none",
                    block.iconWrap,
                    isActive ? "scale-110" : "scale-100",
                  ].join(" ")}
                >
                  <Icon className="h-6 w-6" />
                </span>

                <h2 className="mt-4 whitespace-nowrap text-2xl font-bold text-white">{t(`arena.landing.${block.titleKey}`)}</h2>
                <p className="mt-1 text-sm text-gray-400">{t(`arena.landing.${block.taglineKey}`)}</p>

                {/* 被挤窄的块里塞满字会挤成一团，淡出即可；宽度回来时再淡入 */}
                <div
                  className={[
                    "transition-opacity duration-300 motion-reduce:transition-none",
                    isDimmed ? "md:opacity-0" : "opacity-100",
                  ].join(" ")}
                >
                  <p className="mt-4 text-sm leading-relaxed text-gray-300">{t(`arena.landing.${block.descKey}`)}</p>
                  <ul className="mt-4 space-y-2 text-sm text-gray-300">
                    {block.pointKeys.map((pointKey) => (
                      <li key={pointKey} className="flex gap-2">
                        <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${block.bullet}`} />
                        <span>{t(`arena.landing.${pointKey}`)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-semibold text-white">
                  {t("arena.landing.enter")}
                  <ArrowRight
                    className={[
                      "h-4 w-4 transition-transform duration-300 motion-reduce:transition-none",
                      isActive ? "translate-x-1" : "translate-x-0",
                    ].join(" ")}
                  />
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
