/**
 * @file skins/TiebaSkin.tsx - 仿百度贴吧楼层布局（模拟练习用，非真站）。
 * @category Component
 *
 * 相对其它皮肤的【布局】差异（不是配色差异）：
 *   · ★ 方头像（rounded-[4px]，44px）—— 本项目里【只有】贴吧是方头像，其余全是圆头像
 *   · ★ 「N楼」楼层号 —— 中文「楼」字，与 B站 的 `#N` 明显不同
 *   · ★ 时间戳【右对齐】，和楼层号一起贴在楼层头条的最右侧
 *     （其它平台的时间都在正文下方的操作行里）
 *   · 楼层头条与正文之间有一条【横向分隔线】，正文另起一整块 —— 贴吧的「一层一层」感
 *   · 操作区（回复）【右对齐】在楼层底部，也和其它平台的左对齐相反
 *   · 楼中楼：拍平成细列表，每条前缀「回复 @某人 ：」，靠左细描边
 *
 * ⚠️ 不使用贴吧/百度的 logo / 商标图形；只用品牌色（蓝）与 lucide 中性图标做视觉致意。
 */
import { MessageSquare, ThumbsUp } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { flattenReplies, pseudoTimeZh } from "./helpers";

function TiebaFloor({
  comment,
  floor,
  getReplies,
  onReplyTo,
}: {
  comment: SkinComment;
  floor: number;
  getReplies: (parentId: string) => SkinComment[];
  onReplyTo?: (c: ScenarioComment) => void;
}) {
  const sub = flattenReplies(comment.id, getReplies);

  return (
    <div className="rounded-md border border-blue-500/15 bg-gray-900">
      {/* 楼层头条：左 = 方头像 + 用户名 + 楼主；右 = 时间 + N楼 */}
      <div className="flex items-center gap-3 border-b border-blue-500/10 px-4 py-2.5">
        <Avatar name={comment.authorName} url={comment.authorAvatar} shape="square" size={44} ringClass="ring-1 ring-blue-500/25" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-blue-300">{comment.authorName || "匿名"}</span>
          {comment.isOP && (
            <span className="rounded border border-blue-500/30 bg-blue-600/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-200">
              楼主
            </span>
          )}
          {comment.isAi && <AiTag />}
        </div>
        {/* ★ 时间与楼层号右对齐 */}
        <div className="flex shrink-0 items-center gap-2 text-[11px] text-gray-500">
          <span>{pseudoTimeZh(comment.id)}</span>
          <span className="tabular-nums text-blue-400/80">{floor}楼</span>
        </div>
      </div>

      {/* 正文另起一整块（贴吧的一层一层感） */}
      <p className="whitespace-pre-wrap break-words px-4 py-3 text-sm leading-7 text-gray-100">{comment.text}</p>

      {/* ★ 操作区右对齐 */}
      <div className="flex items-center justify-end gap-4 px-4 pb-2.5 text-xs text-gray-500">
        <span className="flex items-center gap-1 text-blue-300">
          <ThumbsUp size={13} />
          <span className="tabular-nums">{comment.likeCount ?? 0}</span>
        </span>
        {onReplyTo && (
          <button
            type="button"
            onClick={() => onReplyTo(comment)}
            className="flex items-center gap-1 motion-safe:transition-colors hover:text-blue-300"
          >
            <MessageSquare size={13} /> 回复
            {sub.length > 0 && <span className="tabular-nums">({sub.length})</span>}
          </button>
        )}
      </div>

      {sub.length > 0 && (
        <ul className="mx-4 mb-3 space-y-1.5 border-l-2 border-blue-500/20 pl-3">
          {sub.map(({ comment: r, replyTo }) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-1 text-[12px] leading-5">
              <span className="text-blue-300">{r.authorName || "匿名"}</span>
              {r.isOP && <span className="text-[10px] text-blue-400">(楼主)</span>}
              {replyTo && (
                <>
                  <span className="text-gray-500">回复</span>
                  <span className="text-blue-300">@{replyTo.authorName || "匿名"}</span>
                </>
              )}
              <span className="text-gray-500">：</span>
              <span className="min-w-0 whitespace-pre-wrap break-words text-gray-300">{r.text}</span>
              {r.isAi && <AiTag />}
              <span className="ml-auto shrink-0 text-[10px] text-gray-600">{pseudoTimeZh(r.id)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TiebaSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="tieba" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-blue-500/40 bg-blue-600/15 px-2 py-0.5 text-xs font-semibold text-blue-200">
          贴吧 · 模拟
        </span>
        {topic && <span className="min-w-0 truncate text-xs text-gray-400">话题：{topic}</span>}
      </div>

      {/* 贴吧式帖子头：标题 + 共 N 层 */}
      <div className="mb-2 flex items-center justify-between rounded-t-md border border-blue-500/15 bg-blue-950/20 px-4 py-2">
        <span className="min-w-0 truncate text-sm font-semibold text-blue-100">{topic || "本帖讨论"}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-blue-300/70">共 {topLevel.length} 层</span>
      </div>

      <ol className="space-y-2">
        {topLevel.map((c, i) => (
          <li key={c.id}>
            <TiebaFloor comment={c} floor={i + 1} getReplies={getReplies} onReplyTo={onReplyTo} />
          </li>
        ))}
      </ol>
    </section>
  );
}
