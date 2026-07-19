/**
 * @file skins/ZhihuSkin.tsx - 仿知乎回答/评论区布局（模拟练习用，非真站）。
 * @category Component
 *
 * ★ 本皮肤是审计点名的整改项之一：知乎原来【借用 bilibili 皮肤】（PLATFORM_SKIN.zhihu = "bilibili"），
 *   现在有自己独立的布局。
 *
 * 相对其它皮肤的【布局】差异（不是配色差异）：
 *   · ★ 「赞同 / 反对」连体胶囊，而【不是】点赞 —— 本项目里只有知乎用这套措辞与控件形态
 *   · ★ 「作者」徽标（不是 UP主/博主/楼主）
 *   · ★ 长文本排版：15px 字号 + 1.9 行高 + 段落上下留白，明显比其它皮肤松
 *   · 头像：圆形 32（本项目里最小的一档之一），用户名右侧跟一条细的「作者」态
 *   · 时间戳：以「编辑于 X」的形式，在正文【下方】的 meta 行，早于操作区
 *   · 楼中楼：不套灰底块，用左侧细线 + 缩进的清单（与 B站/微博 的灰底块相反）
 *   · 顶楼之间是宽间距的分隔线，不是卡片
 *
 * ⚠️ 不使用知乎的 logo / 商标图形；只用品牌色（蓝）与 lucide 中性图标做视觉致意。
 */
import { MessageSquare, ThumbsDown, ThumbsUp } from "lucide-react";
import type { ScenarioComment } from "../../api";
import type { SkinComment, SkinProps } from "./types";
import { AiTag, Avatar } from "./primitives";
import { flattenReplies, pseudoTimeZh } from "./helpers";

function ZhihuPost({
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
    <div>
      <div className="flex items-center gap-2.5">
        <Avatar name={comment.authorName} url={comment.authorAvatar} shape="circle" size={32} ringClass="ring-1 ring-blue-400/25" />
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium text-gray-100">{comment.authorName || "匿名"}</span>
          {comment.isOP && (
            <span className="rounded-sm bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-blue-300">
              作者
            </span>
          )}
          {comment.isAi && <AiTag />}
        </div>
      </div>

      {/* ★ 长文排版：字号更大、行高更松、上下留白更多 */}
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-[1.9] text-gray-200">{comment.text}</p>

      {/* ★ 时间以「编辑于 X」的形式单独成行 */}
      <div className="mt-3 text-[12px] text-gray-500">编辑于 {pseudoTimeZh(comment.id)}</div>

      {/* ★ 赞同 / 反对 连体胶囊 —— 知乎独有的措辞与控件形态 */}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span className="inline-flex items-stretch divide-x divide-blue-500/25 overflow-hidden rounded-full border border-blue-500/25 bg-blue-500/10 text-[12px] text-blue-300">
          <span className="flex items-center gap-1.5 px-3 py-1">
            <ThumbsUp size={13} />
            赞同 <span className="tabular-nums">{comment.likeCount ?? 0}</span>
          </span>
          <span className="flex items-center gap-1.5 px-3 py-1">
            <ThumbsDown size={13} />
            反对
          </span>
        </span>
        {onReplyTo && (
          <button
            type="button"
            onClick={() => onReplyTo(comment)}
            className="flex items-center gap-1 text-[12px] text-gray-500 motion-safe:transition-colors hover:text-gray-200"
          >
            <MessageSquare size={13} /> 评论
            {sub.length > 0 && <span className="tabular-nums">{sub.length}</span>}
          </button>
        )}
      </div>

      {/* ★ 楼中楼不套灰底块，用左细线 + 缩进 */}
      {sub.length > 0 && (
        <ul className="mt-3 space-y-3 border-l border-gray-800 pl-4">
          {sub.map(({ comment: r, replyTo }) => (
            <li key={r.id}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Avatar name={r.authorName} url={r.authorAvatar} shape="circle" size={24} />
                <span className="text-[13px] text-gray-300">{r.authorName || "匿名"}</span>
                {r.isOP && <span className="text-[10px] text-blue-300">作者</span>}
                {replyTo && (
                  <span className="text-[12px] text-gray-500">
                    回复 <span className="text-gray-300">{replyTo.authorName || "匿名"}</span>
                  </span>
                )}
                {r.isAi && <AiTag />}
              </div>
              {/* 回复的正文也另起一行、保持知乎的松排版 */}
              <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.8] text-gray-300">{r.text}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] text-gray-600">
                <span className="flex items-center gap-1">
                  <ThumbsUp size={11} /> 赞同 <span className="tabular-nums">{r.likeCount ?? 0}</span>
                </span>
                <span>{pseudoTimeZh(r.id)}</span>
                {onReplyTo && (
                  <button
                    type="button"
                    onClick={() => onReplyTo(r)}
                    className="motion-safe:transition-colors hover:text-gray-300"
                  >
                    回复
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ZhihuSkin({ topic, topLevel, getReplies, onReplyTo }: SkinProps) {
  return (
    <section data-skin="zhihu" className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-blue-400/40 bg-blue-500/15 px-2 py-0.5 text-xs font-semibold text-blue-200">
          知乎 · 模拟
        </span>
      </div>

      {/* 知乎式问题标题 + 回答数 */}
      {topic && <h3 className="mb-1 text-lg font-bold leading-snug text-gray-50">{topic}</h3>}
      <div className="mb-3 text-[12px] text-gray-500">
        <span className="tabular-nums">{topLevel.length}</span> 个回答
      </div>

      <ol className="divide-y divide-gray-800">
        {topLevel.map((c) => (
          <li key={c.id} className="py-5 first:pt-0">
            <ZhihuPost comment={c} getReplies={getReplies} onReplyTo={onReplyTo} />
          </li>
        ))}
      </ol>
    </section>
  );
}
