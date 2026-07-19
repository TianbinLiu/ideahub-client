/**
 * @file skins/GenericSkin.tsx - 通用评论区皮肤（platform=generic / 未知平台的兜底）。
 * @category Component
 *
 * 布局取向：【不模仿任何具体平台】，走本站自己的深色卡片风。
 *   · 头像：圆形 36
 *   · 用户名在正文【上方】另起一行
 *   · 操作区：点赞 + 回复，在正文下方左侧
 *   · 无楼层号
 *   · 楼中楼：唯一一个【真·递归嵌套】的皮肤（每层一张缩进小卡 + 左描边），
 *     因为通用皮肤不需要迁就任何平台「楼中楼只有两层」的产品约定。
 *   · 时间戳：跟在用户名后面
 */
import { MessageSquare, ThumbsUp } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { pseudoTimeZh } from "./helpers";

/** 缩进到第 5 层后不再往右推，避免窄屏被挤爆（层级仍靠左描边表达）。 */
const MAX_INDENT_DEPTH = 5;

function GenericNode({
  comment,
  depth,
  getReplies,
  onReplyTo,
}: {
  comment: SkinComment;
  depth: number;
  getReplies: (parentId: string) => SkinComment[];
  onReplyTo?: (c: ScenarioComment) => void;
}) {
  const replies = getReplies(comment.id);

  return (
    <li>
      <div
        className={
          depth === 0
            ? "rounded-2xl border border-gray-800 bg-gray-900 p-4"
            : "rounded-xl border border-gray-800 bg-gray-950/40 p-3"
        }
      >
        <div className="flex gap-3">
          <Avatar name={comment.authorName} url={comment.authorAvatar} shape="circle" size={36} ringClass="ring-1 ring-gray-700" />
          <div className="min-w-0 flex-1">
            {/* 用户名独占一行（与 IG 的「用户名和正文同一行」正相反） */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm font-medium text-gray-100">{comment.authorName || "匿名"}</span>
              {comment.isOP && (
                <span className="rounded border border-cyan-500/30 bg-cyan-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-200">
                  楼主
                </span>
              )}
              {comment.isAi && <AiTag />}
              <span className="text-[11px] text-gray-500">{pseudoTimeZh(comment.id)}</span>
            </div>

            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-200">{comment.text}</p>

            <div className="mt-2 flex items-center gap-5 text-xs text-gray-400">
              <span className="flex items-center gap-1 text-cyan-300">
                <ThumbsUp size={14} /> {comment.likeCount ?? 0}
              </span>
              {onReplyTo && (
                <button
                  type="button"
                  onClick={() => onReplyTo(comment)}
                  className="flex items-center gap-1 motion-safe:transition-colors hover:text-gray-200"
                >
                  <MessageSquare size={14} /> 回复
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <ul
          className={`mt-2 space-y-2 border-l border-gray-800 pl-3 ${depth < MAX_INDENT_DEPTH ? "ml-5" : ""}`}
        >
          {replies.map((r) => (
            <GenericNode key={r.id} comment={r} depth={depth + 1} getReplies={getReplies} onReplyTo={onReplyTo} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function GenericSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="generic" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs font-semibold text-gray-200">
          评论区 · 模拟
        </span>
        {topic && <span className="min-w-0 truncate text-xs text-gray-400">话题：{topic}</span>}
      </div>

      <ul className="space-y-3">
        {topLevel.map((c) => (
          <GenericNode key={c.id} comment={c} depth={0} getReplies={getReplies} onReplyTo={onReplyTo} />
        ))}
      </ul>
    </section>
  );
}
