/**
 * @file skins/WeiboSkin.tsx - 仿微博评论区布局（模拟练习用，非真站）。
 * @category Component
 *
 * 相对其它皮肤的【布局】差异（不是配色差异）：
 *   · ★ 转发 / 评论 / 赞【三键条】：一条横跨整行、等宽三格、竖线分隔的操作条。
 *     这是微博最认得出的结构 —— 本项目里【只有】微博皮肤的操作区是「整行等分三格」，
 *     其余平台都是左对齐的一串小图标。
 *   · 头像：圆形 40；用户名在正文上方，博主徽标紧跟其后
 *   · 时间戳【独占一行】，夹在正文与三键条之间（其它平台都把时间和操作挤在同一行）
 *   · 楼中楼：拍平进一个【灰底块】，每条一行，赞数右对齐
 *   · 无楼层号
 *   · 话题用 #话题# 的写法渲染（微博式）
 *
 * ⚠️ 不使用微博的 logo / 商标图形；只用品牌色（橙/红）与 lucide 中性图标做视觉致意。
 */
import { Heart, MessageSquare, Repeat2 } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { flattenReplies, pseudoTimeZh } from "./helpers";

function WeiboFloor({
  comment,
  getReplies,
  onReplyTo,
}: {
  comment: SkinComment;
  getReplies: (parentId: string) => SkinComment[];
  onReplyTo?: (c: ScenarioComment) => void;
}) {
  const sub = flattenReplies(comment.id, getReplies);

  return (
    <div className="flex gap-3">
      <Avatar
        name={comment.authorName}
        url={comment.authorAvatar}
        shape="circle"
        size={40}
        ringClass="ring-1 ring-orange-500/30"
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-medium text-orange-300">{comment.authorName || "匿名"}</span>
          {comment.isOP && (
            <span className="rounded border border-orange-500/30 bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-orange-200">
              博主
            </span>
          )}
          {comment.isAi && <AiTag />}
        </div>

        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-gray-100">{comment.text}</p>

        {/* 时间独占一行 —— 微博就是把时间单独放在正文和三键条之间 */}
        <div className="mt-1.5 text-[11px] text-gray-500">{pseudoTimeZh(comment.id)}</div>

        {/* ★ 三键条：等分三格 + 竖线分隔。转发/赞在本产品里是展示态（没有对应后端），
            故渲染为 span 而非 button —— 不做假的可点击。 */}
        <div className="mt-2 flex items-stretch divide-x divide-gray-800 rounded-lg border border-gray-800 bg-gray-950/40 text-xs text-gray-400">
          <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
            <Repeat2 size={14} /> 转发
          </span>
          {onReplyTo ? (
            <button
              type="button"
              onClick={() => onReplyTo(comment)}
              className="flex flex-1 items-center justify-center gap-1.5 py-1.5 motion-safe:transition-colors hover:text-gray-200"
            >
              <MessageSquare size={14} /> 评论
            </button>
          ) : (
            <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5">
              <MessageSquare size={14} /> 评论
            </span>
          )}
          <span className="flex flex-1 items-center justify-center gap-1.5 py-1.5 text-red-400">
            <Heart size={14} />
            <span className="tabular-nums">{comment.likeCount ?? 0}</span>
          </span>
        </div>

        {sub.length > 0 && (
          <ul className="mt-2 space-y-2 rounded-lg bg-gray-950/60 px-3 py-2">
            {sub.map(({ comment: r, replyTo }) => (
              <li key={r.id} className="flex items-start gap-2 text-[13px]">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words leading-5 text-gray-200">
                    <span className="text-orange-300">{r.authorName || "匿名"}</span>
                    {replyTo && (
                      <span className="text-gray-500">
                        {" "}
                        回复 <span className="text-orange-300">@{replyTo.authorName || "匿名"}</span>
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
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[11px] text-gray-600">
                    <span>{pseudoTimeZh(r.id)}</span>
                    {onReplyTo && (
                      <button
                        type="button"
                        onClick={() => onReplyTo(r)}
                        className="motion-safe:transition-colors hover:text-orange-300"
                      >
                        回复
                      </button>
                    )}
                  </div>
                </div>
                {/* 楼中楼的赞数右对齐 */}
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-gray-500">
                  <Heart size={12} />
                  <span className="tabular-nums">{r.likeCount ?? 0}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function WeiboSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="weibo" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-orange-500/40 bg-orange-500/15 px-2 py-0.5 text-xs font-semibold text-orange-200">
          微博 · 模拟
        </span>
        {/* 微博式话题写法 */}
        {topic && <span className="min-w-0 truncate text-xs text-orange-400">#{topic}#</span>}
      </div>

      <ol className="space-y-3">
        {topLevel.map((c) => (
          <li key={c.id} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
            <WeiboFloor comment={c} getReplies={getReplies} onReplyTo={onReplyTo} />
          </li>
        ))}
      </ol>
    </section>
  );
}
