/**
 * @file skins/InstagramSkin.tsx - 仿 Instagram 评论区布局（模拟练习用，非真站）。
 * @category Component
 *
 * ★ 本皮肤是审计点名的整改项之一：instagram 原来【借用 weibo 皮肤】（PLATFORM_SKIN.instagram = "weibo"），
 *   现在有自己独立的布局。
 *
 * 相对其它皮肤的【布局】差异（不是配色差异）：
 *   · ★★ 用户名与正文在【同一行、同一个 <p> 元素里】紧挨着（`username 正文正文…`）。
 *     这是 IG 最认得出的结构，也是本项目里【唯一】一个顶楼用户名不独占一行的皮肤。
 *     ——「查表式皮肤」根本表达不了这一条，这正是本次必须拆成独立组件的原因。
 *   · ★ 操作区极简：只有一个心形（贴在行的最右、与首行顶端对齐）+ 一行极小的 meta。
 *     没有转发、没有点踩、没有楼层、没有赞同/反对。
 *   · 头像：圆形 32
 *   · 时间戳：英文紧凑写法（`2h` / `3d`），在 meta 行【最左】
 *   · meta 行：time · N likes · Reply（IG 的 UI 是英文的，这本身就是它的辨识特征）
 *   · 楼中楼：不套任何容器/底色，直接缩进；折叠行是一条短横线 +「View replies (N)」
 *   · 无楼层号、无卡片边框（IG 评论是贴着背景的流式列表）
 *
 * ⚠️ 不使用 Instagram 的 logo / 商标图形；只用品牌色（粉紫渐变描边）与 lucide 中性图标做视觉致意。
 */
import { useState } from "react";
import { Heart } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { flattenReplies, pseudoTimeEn } from "./helpers";

const SUB_PREVIEW = 0; // IG 默认把所有回复折起来，点「View replies (N)」才展开

function IgLine({
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
    <div className="flex items-start gap-3">
      <Avatar
        name={comment.authorName}
        url={comment.authorAvatar}
        shape="circle"
        size={compact ? 24 : 32}
        ringClass="ring-2 ring-fuchsia-500/40"
      />

      <div className="min-w-0 flex-1">
        {/* ★★ 用户名 + 正文：同一行、同一个元素 */}
        <p className={`whitespace-pre-wrap break-words ${compact ? "text-[13px] leading-5" : "text-sm leading-5"} text-gray-200`}>
          <span className="font-semibold text-gray-50">{comment.authorName || "anonymous"}</span>
          {comment.isOP && <span className="ml-1 text-[10px] font-semibold text-fuchsia-300">creator</span>}
          {replyToName && <span className="ml-1 text-sky-300">@{replyToName}</span>}{" "}
          {comment.text}
          {comment.isAi && (
            <>
              {" "}
              <AiTag />
            </>
          )}
        </p>

        {/* meta 行：time · N likes · Reply（全英文、极小字号） */}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] font-medium text-gray-500">
          <span>{pseudoTimeEn(comment.id)}</span>
          <span className="tabular-nums">{comment.likeCount ?? 0} likes</span>
          {onReplyTo && (
            <button
              type="button"
              onClick={() => onReplyTo(comment)}
              className="motion-safe:transition-colors hover:text-gray-300"
            >
              Reply
            </button>
          )}
        </div>
      </div>

      {/* ★ 唯一的操作控件：右侧心形，与首行顶端对齐 */}
      <span className="mt-0.5 shrink-0 text-gray-500">
        <Heart size={compact ? 11 : 13} />
      </span>
    </div>
  );
}

function IgThread({
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
      <IgLine comment={comment} compact={false} onReplyTo={onReplyTo} />

      {sub.length > 0 && (
        <div className="ml-11 mt-2 space-y-2">
          {shown.length > 0 && (
            <ul className="space-y-2">
              {shown.map(({ comment: r, replyTo }) => (
                <li key={r.id}>
                  <IgLine
                    comment={r}
                    compact
                    replyToName={replyTo ? replyTo.authorName || "anonymous" : undefined}
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
              className="flex items-center gap-3 text-[11px] font-semibold text-gray-500 motion-safe:transition-colors hover:text-gray-300"
            >
              {/* IG 的折叠行就是一条短横线 + 文案 */}
              <span className="h-px w-6 bg-gray-700" />
              View replies ({sub.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function InstagramSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="instagram" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-fuchsia-500/40 bg-gradient-to-r from-fuchsia-500/15 to-orange-500/15 px-2 py-0.5 text-xs font-semibold text-fuchsia-200">
          Instagram · 模拟
        </span>
      </div>

      {topic && <p className="mb-3 min-w-0 truncate text-xs text-gray-400">{topic}</p>}

      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Comments</div>

      {/* 无卡片、无分隔线的流式列表 */}
      <ol className="space-y-4">
        {topLevel.map((c) => (
          <li key={c.id}>
            <IgThread comment={c} getReplies={getReplies} onReplyTo={onReplyTo} />
          </li>
        ))}
      </ol>
    </section>
  );
}
