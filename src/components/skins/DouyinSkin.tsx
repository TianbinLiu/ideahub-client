/**
 * @file skins/DouyinSkin.tsx - 仿抖音评论区布局（模拟练习用，非真站）。
 * @category Component
 *
 * ★ 本次【新增】平台：插件的 detectPlatform 早就能识别 douyin.com，但后端枚举里没有，
 *   抓回来的 platform 会被 normalizePlatform 静默降级成 generic，皮肤跟着退化。
 *   本次同时补齐「后端枚举 + 前端选项 + 专属皮肤」，避免加了枚举却只能 fallback。
 *
 * 相对其它皮肤的【布局】差异（不是配色差异）：
 *   · ★ 点赞是【右侧竖排】：心形在上、数字在下，贴在整行最右端并与首行顶部对齐。
 *     本项目里只有抖音是「图标在上、计数在下」的竖排点赞（小红书是右侧【横排】）。
 *   · 头像：圆形 36
 *   · 用户名独占一行、灰色小字（不是主色）—— 抖音把用户名做得比正文弱
 *   · 时间戳在正文下方的 meta 行，格式为 `时间 · 属地 · 回复`（点号分隔）
 *   · 楼中楼：拍平后不套底色块，折叠行是【一条横线 + 展开 N 条回复 ∨】
 *   · 无楼层号、无卡片边框
 *
 * ⚠️ 不使用抖音的 logo / 商标图形；只用品牌色（青/粉）与 lucide 中性图标做视觉致意。
 */
import { useState } from "react";
import { ChevronDown, Heart } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { flattenReplies, pseudoRegion, pseudoTimeZh } from "./helpers";

const SUB_PREVIEW = 2;

function DouyinRow({
  comment,
  compact,
  replyToName,
  onReplyTo,
}: {
  comment: SkinComment;
  compact: boolean;
  replyToName?: string;
  onReplyTo?: (c: ScenarioComment) => void;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <Avatar
        name={comment.authorName}
        url={comment.authorAvatar}
        shape="circle"
        size={compact ? 24 : 36}
        ringClass="ring-1 ring-cyan-400/25"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {/* 用户名弱化成灰色小字 —— 抖音的层级就是「正文重、名字轻」 */}
          <span className="truncate text-[12px] text-gray-500">{comment.authorName || "匿名"}</span>
          {comment.isOP && (
            <span className="rounded-sm bg-cyan-400/15 px-1 py-px text-[10px] font-semibold leading-none text-cyan-300">
              作者
            </span>
          )}
          {comment.isAi && <AiTag />}
        </div>

        <p className={`mt-0.5 whitespace-pre-wrap break-words ${compact ? "text-[13px]" : "text-sm"} leading-5 text-gray-100`}>
          {replyToName && <span className="text-cyan-300">回复 @{replyToName}：</span>}
          {comment.text}
        </p>

        {/* meta：时间 · 属地 · 回复（点号分隔，是抖音的写法） */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-gray-600">
          <span>{pseudoTimeZh(comment.id)}</span>
          <span aria-hidden="true">·</span>
          <span>{pseudoRegion(comment.id)}</span>
          {onReplyTo && (
            <>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => onReplyTo(comment)}
                className="motion-safe:transition-colors hover:text-gray-300"
              >
                回复
              </button>
            </>
          )}
        </div>
      </div>

      {/* ★ 右侧竖排点赞：心形在上、数字在下 */}
      <span className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5 text-gray-500">
        <Heart size={compact ? 12 : 14} />
        <span className="text-[10px] tabular-nums leading-none">{comment.likeCount ?? 0}</span>
      </span>
    </div>
  );
}

function DouyinThread({
  comment,
  getReplies,
  onReplyTo,
}: {
  comment: SkinComment;
  getReplies: (parentId: string) => SkinComment[];
  onReplyTo?: (c: ScenarioComment) => void;
}) {
  const sub = flattenReplies(comment.id, getReplies);
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? sub : sub.slice(0, SUB_PREVIEW);
  const hiddenCount = sub.length - shown.length;

  return (
    <div>
      <DouyinRow comment={comment} compact={false} onReplyTo={onReplyTo} />

      {sub.length > 0 && (
        <div className="ml-[46px] mt-2 space-y-2">
          {shown.length > 0 && (
            <ul className="space-y-2">
              {shown.map(({ comment: r, replyTo }) => (
                <li key={r.id}>
                  <DouyinRow
                    comment={r}
                    compact
                    replyToName={replyTo ? replyTo.authorName || "匿名" : undefined}
                    onReplyTo={onReplyTo}
                  />
                </li>
              ))}
            </ul>
          )}
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex items-center gap-2 text-[11px] text-gray-500 motion-safe:transition-colors hover:text-gray-300"
            >
              <span className="h-px w-5 bg-gray-700" />
              展开 {hiddenCount} 条回复
              <ChevronDown size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function DouyinSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="douyin" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-xs font-semibold text-cyan-200">
          抖音 · 模拟
        </span>
        {topic && <span className="min-w-0 truncate text-xs text-gray-400">话题：{topic}</span>}
      </div>

      <div className="mb-2 text-[12px] text-gray-500">
        评论 <span className="tabular-nums">{topLevel.length}</span>
      </div>

      <ol className="space-y-4">
        {topLevel.map((c) => (
          <li key={c.id}>
            <DouyinThread comment={c} getReplies={getReplies} onReplyTo={onReplyTo} />
          </li>
        ))}
      </ol>
    </section>
  );
}
