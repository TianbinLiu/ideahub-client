/**
 * @file skins/XiaohongshuSkin.tsx - 仿小红书笔记评论区布局（模拟练习用，非真站）。
 * @category Component
 *
 * ★ 本次【新增】平台：插件的 detectPlatform 早就能识别 xiaohongshu.com / xhslink.com，
 *   但后端枚举里没有 → 抓回来的 platform 被静默降级成 generic。本次同时补齐
 *   「后端枚举 + 前端选项 + 专属皮肤」，避免加了枚举却只能 fallback。
 *
 * 相对其它皮肤的【布局】差异（不是配色差异）：
 *   · ★ 点赞是【右侧横排】：心形与数字并排贴在正文首行右侧
 *     （抖音是右侧【竖排】：心在上、数在下 —— 两者结构不同，别混）
 *   · ★ meta 行显式写「IP 属地 X」（抖音是 `时间 · 属地 · 回复` 的点号串）
 *   · ★ 楼中楼折叠行是【红色文案 + 前置短横线】：`—— 展开 N 条回复`
 *   · 头像：圆形 32
 *   · 顶部有笔记式的「共 N 条评论」计数条
 *   · 用户名独占一行、灰色；正文在下
 *   · 无楼层号、无卡片边框
 *
 * ⚠️ 不使用小红书的 logo / 商标图形；只用品牌色（红）与 lucide 中性图标做视觉致意。
 */
import { useState } from "react";
import { Heart } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { flattenReplies, pseudoRegion, pseudoTimeZh } from "./helpers";

const SUB_PREVIEW = 1;

function XhsRow({
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
        size={compact ? 24 : 32}
        ringClass="ring-1 ring-red-500/25"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="truncate text-[12px] text-gray-500">{comment.authorName || "匿名"}</span>
          {comment.isOP && (
            <span className="rounded-sm bg-red-500/15 px-1 py-px text-[10px] font-semibold leading-none text-red-300">
              作者
            </span>
          )}
          {comment.isAi && <AiTag />}
        </div>

        <p className={`mt-0.5 whitespace-pre-wrap break-words ${compact ? "text-[13px]" : "text-sm"} leading-5 text-gray-100`}>
          {replyToName && <span className="text-red-300">回复 @{replyToName}：</span>}
          {comment.text}
        </p>

        {/* ★ meta：时间 + 显式「IP 属地 X」（这是小红书的写法，与抖音的点号串不同） */}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-600">
          <span>{pseudoTimeZh(comment.id)}</span>
          <span>IP 属地 {pseudoRegion(comment.id)}</span>
          {onReplyTo && (
            <button
              type="button"
              onClick={() => onReplyTo(comment)}
              className="motion-safe:transition-colors hover:text-red-300"
            >
              回复
            </button>
          )}
        </div>
      </div>

      {/* ★ 右侧横排点赞：心形与数字并排 */}
      <span className="flex shrink-0 items-center gap-1 pt-0.5 text-[11px] text-gray-500">
        <Heart size={compact ? 12 : 14} />
        <span className="tabular-nums">{comment.likeCount ?? 0}</span>
      </span>
    </div>
  );
}

function XhsThread({
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
      <XhsRow comment={comment} compact={false} onReplyTo={onReplyTo} />

      {sub.length > 0 && (
        <div className="ml-[42px] mt-2 space-y-2">
          {shown.length > 0 && (
            <ul className="space-y-2">
              {shown.map(({ comment: r, replyTo }) => (
                <li key={r.id}>
                  <XhsRow
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
              className="flex items-center gap-2 text-[11px] font-medium text-red-400 motion-safe:transition-colors hover:text-red-300"
            >
              <span className="h-px w-4 bg-gray-700" />
              展开 {hiddenCount} 条回复
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function XiaohongshuSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="xiaohongshu" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-200">
          小红书 · 模拟
        </span>
        {topic && <span className="min-w-0 truncate text-xs text-gray-400">话题：{topic}</span>}
      </div>

      {/* 笔记式计数条 */}
      <div className="mb-3 border-b border-gray-800 pb-2 text-[12px] text-gray-400">
        共 <span className="tabular-nums">{topLevel.length}</span> 条评论
      </div>

      <ol className="space-y-4">
        {topLevel.map((c) => (
          <li key={c.id}>
            <XhsThread comment={c} getReplies={getReplies} onReplyTo={onReplyTo} />
          </li>
        ))}
      </ol>
    </section>
  );
}
