/**
 * @file skins/BilibiliSkin.tsx - 仿哔哩哔哩视频评论区布局（模拟练习用，非真站）。
 * @category Component
 *
 * 相对其它皮肤的【布局】差异（不是配色差异）：
 *   · 顶楼之间用【发丝分隔线】而不是卡片 —— B站评论是一条条流式的，没有卡片边框
 *   · 头像：圆形 40（楼中楼 24，明显更小）
 *   · 用户名在正文上方；「UP主」徽标紧跟用户名
 *   · 楼层号 `#N` 在用户名行【最右侧】
 *   · 操作区在正文下方，顺序固定为：时间 → 点赞 → 【点踩】→ 回复
 *     （★ 点踩是 B站 特有：本项目里只有 B站 和 知乎(反对) 有「负向」按钮）
 *   · 楼中楼：拍平进一个【灰底圆角块】，超过 3 条折叠为「共 N 条回复」
 *   · 楼中楼里用户名与正文【同一行、冒号分隔】（这是 B站 楼中楼的实际排版）
 *
 * ⚠️ 不使用 B站 的 logo / 商标图形；只用品牌色（粉/蓝）与 lucide 中性图标做视觉致意。
 */
import { useState } from "react";
import { ChevronDown, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { flattenReplies, pseudoTimeZh } from "./helpers";

/** 楼中楼默认最多露出 3 条，其余折叠（B站 就是这个数）。 */
const SUB_PREVIEW = 3;

function BiliFloor({
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
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? sub : sub.slice(0, SUB_PREVIEW);
  const hiddenCount = sub.length - shown.length;

  return (
    <div className="flex gap-3">
      <Avatar
        name={comment.authorName}
        url={comment.authorAvatar}
        shape="circle"
        size={40}
        ringClass="ring-1 ring-pink-500/30"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-sky-300">
            {comment.authorName || "匿名"}
          </span>
          {comment.isOP && (
            <span className="shrink-0 rounded-sm border border-pink-500/40 bg-pink-500/10 px-1 py-px text-[10px] font-semibold leading-none text-pink-300">
              UP主
            </span>
          )}
          {comment.isAi && <AiTag />}
          {/* 楼层号靠最右 —— B站 的 #N 就在这个位置 */}
          <span className="ml-auto shrink-0 text-[11px] tabular-nums text-gray-600">#{floor}</span>
        </div>

        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-6 text-gray-100">{comment.text}</p>

        {/* 时间在操作区【最左】，然后点赞 / 点踩 / 回复 */}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-gray-500">
          <span>{pseudoTimeZh(comment.id)}</span>
          <span className="flex items-center gap-1 text-pink-300">
            <ThumbsUp size={14} />
            <span className="tabular-nums">{comment.likeCount ?? 0}</span>
          </span>
          <span className="flex items-center gap-1" title="点踩">
            <ThumbsDown size={14} />
          </span>
          {onReplyTo && (
            <button
              type="button"
              onClick={() => onReplyTo(comment)}
              className="motion-safe:transition-colors hover:text-sky-300"
            >
              回复
            </button>
          )}
        </div>

        {sub.length > 0 && (
          <div className="mt-2 rounded-md bg-white/[0.04] px-3 py-2">
            <ul className="space-y-2">
              {shown.map(({ comment: r, replyTo }) => (
                <li key={r.id} className="flex gap-2">
                  <Avatar name={r.authorName} url={r.authorAvatar} shape="circle" size={24} />
                  <div className="min-w-0 flex-1">
                    {/* B站 楼中楼：用户名与正文同一行，冒号分隔 */}
                    <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-gray-200">
                      <span className="text-sky-300">{r.authorName || "匿名"}</span>
                      {r.isOP && <span className="ml-1 text-[10px] text-pink-300">UP主</span>}
                      {replyTo && (
                        <span className="text-gray-500">
                          {" "}
                          回复 <span className="text-sky-300">@{replyTo.authorName || "匿名"}</span>
                        </span>
                      )}
                      <span className="text-gray-500">：</span>
                      {r.text}
                      {r.isAi && (
                        <>
                          {" "}
                          <AiTag />
                        </>
                      )}
                    </p>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
                      <span>{pseudoTimeZh(r.id)}</span>
                      <span className="flex items-center gap-1">
                        <ThumbsUp size={12} />
                        <span className="tabular-nums">{r.likeCount ?? 0}</span>
                      </span>
                      {onReplyTo && (
                        <button
                          type="button"
                          onClick={() => onReplyTo(r)}
                          className="motion-safe:transition-colors hover:text-sky-300"
                        >
                          回复
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-2 flex items-center gap-0.5 text-[12px] text-sky-400 motion-safe:transition-colors hover:text-sky-300"
              >
                共 {sub.length} 条回复，点击查看
                <ChevronDown size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BilibiliSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="bilibili" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-pink-500/40 bg-pink-500/15 px-2 py-0.5 text-xs font-semibold text-pink-200">
          哔哩哔哩 · 模拟
        </span>
        {topic && <span className="min-w-0 truncate text-xs text-gray-400">话题：{topic}</span>}
      </div>

      <div className="mb-2 text-sm font-semibold text-gray-300">
        评论 <span className="tabular-nums text-gray-500">{topLevel.length}</span>
      </div>

      {/* 流式发丝线，而不是一张张卡片 */}
      <ol className="border-t border-white/5">
        {topLevel.map((c, i) => (
          <li key={c.id} className="border-b border-white/5 py-4">
            <BiliFloor comment={c} floor={i + 1} getReplies={getReplies} onReplyTo={onReplyTo} />
          </li>
        ))}
      </ol>
    </section>
  );
}
