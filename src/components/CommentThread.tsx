/**
 * @file CommentThread.tsx - 三处讨论区（情景 / 人格 / 赏金）共用的评论组件
 * @category Component
 * @i18n none（页面内容以中文为主）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 *
 * 职责:
 * - 自取数据：listArenaComments / createArenaComment / deleteArenaComment（按 targetType 走对应后端）
 * - 发表：文字 + 可选配图（复用 apiUploadImage）
 * - 楼中楼：顶楼下缩进展示回复；每条都有「回复」按钮，就地在其【顶楼】下展开输入框（只有一层）
 * - 删除：评论作者本人可删自己的；canModerate（目标作者）可删任意，均二次确认
 *
 * ⚠️ 这是【详情页给大家讨论用的评论区】，与情景模拟页里的仿真评论（ScenarioMessage，
 *    每人一个私有沙盒的数据收集）完全无关，别混。
 *
 * ⚠️ 建树必须防环，见 utils/commentTree.ts：parentId 可能指向已删/自己/最终指回自己的评论，
 *    朴素递归会无限循环或【静默丢评论】。此处一律用带 visited 的 buildCommentTree。
 */

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ImagePlus, MessageSquare, Send, Trash2, X } from "lucide-react";
import {
  apiUploadImage,
  createArenaComment,
  deleteArenaComment,
  listArenaComments,
  type ArenaComment,
  type ArenaCommentTarget,
} from "../api";
import { buildCommentTree } from "../utils/commentTree";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";

const PAGE_SIZE = 50;

type CommentThreadProps = {
  targetType: ArenaCommentTarget;
  targetId: string;
  /** 当前用户是否是目标（情景/人格/悬赏）的作者 —— 版主，可删任何人的评论 */
  canModerate?: boolean;
  /**
   * 评论数变化时回调（发表 +1，删除 -(1+其楼中楼数)）。
   * 给页面头部自己的 💬 计数用（赏金详情页原本就有这个即时更新，替换成本组件后不能丢）。
   */
  onCountChange?: (delta: number) => void;
};

function authorName(a: ArenaComment["author"]) {
  if (!a) return "匿名用户";
  return typeof a === "string" ? "用户" : a.username || "用户";
}

function authorId(a: ArenaComment["author"]) {
  if (!a) return "";
  return typeof a === "string" ? a : a._id;
}

function formatDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

type ComposerProps = {
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  /** 返回 true 表示发表成功（由 Composer 负责清空）；false 则保留用户已写的内容与配图 */
  onSubmit: (content: string, imageUrl: string) => Promise<boolean>;
  onCancel?: () => void;
};

function Composer({ placeholder, submitLabel, autoFocus = false, onSubmit, onCancel }: ComposerProps) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);

  async function handleUpload(file: File | null) {
    if (!file) return;
    try {
      setUploading(true);
      const res = await apiUploadImage(file, "comment");
      setImageUrl(res.imageUrl);
      toast.success("图片已上传");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!text.trim()) {
      toast.error("请输入评论内容");
      return;
    }
    if (uploading) {
      toast.error("图片正在上传，请稍候再发布");
      return;
    }
    setPosting(true);
    const ok = await onSubmit(text.trim(), imageUrl);
    setPosting(false);
    if (ok) {
      setText("");
      setImageUrl("");
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-cyan-500/50"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800">
          <ImagePlus className="h-4 w-4" />
          {uploading ? "上传中…" : "添加图片"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => handleUpload(e.target.files?.[0] || null)}
          />
        </label>
        {imageUrl && (
          <button
            type="button"
            onClick={() => setImageUrl("")}
            className="text-xs text-rose-300 hover:text-rose-200"
          >
            移除图片
          </button>
        )}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
          >
            <X className="h-3.5 w-3.5" /> 取消
          </button>
        )}
        <button
          type="button"
          disabled={posting || uploading}
          onClick={handleSubmit}
          className="ml-auto inline-flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> {posting ? "发布中…" : submitLabel}
        </button>
      </div>
      {imageUrl && (
        <img src={imageUrl} alt="评论配图" className="max-h-40 rounded-lg border border-gray-800 object-contain" />
      )}
    </div>
  );
}

export default function CommentThread({
  targetType,
  targetId,
  canModerate = false,
  onCountChange,
}: CommentThreadProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [comments, setComments] = useState<ArenaComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!targetId) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await listArenaComments(targetType, targetId, { page: 1, limit: PAGE_SIZE });
        if (!mounted) return;
        setComments(res.comments || []);
        setTotal(res.total || 0);
        setPage(1);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [targetType, targetId]);

  // 统一按发表时间升序：不依赖后端顺序（情景/人格返回升序，赏金既有接口返回倒序）
  const ordered = useMemo(
    () => [...comments].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [comments]
  );
  const { topLevel, repliesByParent } = useMemo(() => buildCommentTree(ordered), [ordered]);

  function goLogin() {
    navigate(`/login?next=${encodeURIComponent(location.pathname)}`);
  }

  function canDelete(c: ArenaComment) {
    if (!user) return false;
    return canModerate || authorId(c.author) === user._id;
  }

  async function handleCreate(content: string, imageUrl: string, parentId: string | null): Promise<boolean> {
    try {
      const res = await createArenaComment(targetType, targetId, {
        content,
        imageUrl: imageUrl || undefined,
        parentId,
      });
      setComments((prev) => [...prev, res.comment]);
      setTotal((t) => t + 1);
      onCountChange?.(1);
      toast.success(parentId ? "已回复" : "已发布评论");
      return true;
    } catch (e) {
      toast.error(humanizeError(e));
      return false;
    }
  }

  async function handleLoadMore() {
    try {
      setLoadingMore(true);
      const next = page + 1;
      const res = await listArenaComments(targetType, targetId, { page: next, limit: PAGE_SIZE });
      setComments((prev) => {
        const seen = new Set(prev.map((c) => c._id));
        return [...prev, ...(res.comments || []).filter((c) => !seen.has(c._id))];
      });
      setTotal(res.total || 0);
      setPage(next);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setLoadingMore(false);
    }
  }

  async function handleDelete(c: ArenaComment) {
    // 删顶楼时后端会级联删掉它的楼中楼，二次确认里要说清楚
    const isTop = !c.parentId;
    const replyCount = isTop ? (repliesByParent.get(c._id)?.length ?? 0) : 0;
    const message =
      replyCount > 0
        ? `确定删除这条评论？其下 ${replyCount} 条回复会一并删除，此操作不可撤销。`
        : "确定删除这条评论？此操作不可撤销。";
    if (!window.confirm(message)) return;

    try {
      setDeletingId(c._id);
      const res = await deleteArenaComment(targetType, targetId, c._id);
      setComments((prev) => prev.filter((x) => x._id !== c._id && !(isTop && x.parentId === c._id)));
      // 用后端返回的【实际删除总数】，而不是本地 replyCount —— 后者只数了【已加载】的楼中楼，
      // 分页下未加载的那些会被漏掉，导致 total 少减、冒出「幽灵加载更多」、页头计数偏大。
      const removed = typeof res.deleted === "number" && res.deleted > 0 ? res.deleted : 1 + replyCount;
      setTotal((t) => Math.max(0, t - removed));
      onCountChange?.(-removed);
      toast.success("已删除");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setDeletingId(null);
    }
  }

  /** 一条评论的正文与操作条。replyTargetId = 点「回复」后要挂到的【顶楼】id（只允许一层） */
  function renderBody(c: ArenaComment, replyTargetId: string) {
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-gray-200">{authorName(c.author)}</span>
          <span className="shrink-0 text-[11px] text-gray-600">{formatDate(c.createdAt)}</span>
        </div>
        {c.content && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-300">{c.content}</p>
        )}
        {c.imageUrl && (
          <a href={c.imageUrl} target="_blank" rel="noreferrer">
            <img
              src={c.imageUrl}
              alt="评论图片"
              className="mt-2 max-h-56 rounded-lg border border-gray-800 object-contain"
            />
          </a>
        )}
        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
          {user && (
            <button
              type="button"
              onClick={() => setReplyTo((prev) => (prev === replyTargetId ? null : replyTargetId))}
              className="inline-flex items-center gap-1 transition-colors hover:text-gray-300"
            >
              <MessageSquare className="h-3.5 w-3.5" /> 回复
            </button>
          )}
          {canDelete(c) && (
            <button
              type="button"
              disabled={deletingId === c._id}
              onClick={() => handleDelete(c)}
              className="inline-flex items-center gap-1 text-rose-400 transition-colors hover:text-rose-300 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> {deletingId === c._id ? "删除中…" : "删除"}
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-white">讨论区</h2>
        <span className="text-xs text-gray-500">{total} 条评论</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">在这里交流、发布截图，也可以回复别人的评论。</p>

      {/* 发表框（未登录引导登录） */}
      <div className="mt-3">
        {user ? (
          <Composer
            placeholder="写下你的评论…"
            submitLabel="发布"
            onSubmit={(content, imageUrl) => handleCreate(content, imageUrl, null)}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-4 text-center">
            <p className="text-sm text-gray-400">登录后即可参与讨论</p>
            <button
              type="button"
              onClick={goLogin}
              className="mt-2 rounded-xl border border-gray-700 px-4 py-1.5 text-sm text-gray-200 hover:bg-gray-800"
            >
              去登录
            </button>
          </div>
        )}
      </div>

      {/* 列表：加载态 / 空态 / 楼层 */}
      <div className="mt-4 space-y-3">
        {loading && <p className="text-sm text-gray-400">加载中…</p>}
        {!loading && topLevel.length === 0 && (
          <p className="text-sm text-gray-400">还没有评论，来说两句吧。</p>
        )}

        {!loading &&
          topLevel.map((c) => {
            const replies = repliesByParent.get(c._id) || [];
            return (
              <div key={c._id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                {renderBody(c, c._id)}

                {replies.length > 0 && (
                  <div className="mt-3 space-y-2 border-l border-gray-800 pl-3">
                    {replies.map((r) => (
                      <div key={r._id} className="rounded-lg border border-gray-800/70 bg-gray-950/60 p-2.5">
                        {/* 回复楼中楼仍然挂到这个顶楼 c._id，不产生第三层 */}
                        {renderBody(r, c._id)}
                      </div>
                    ))}
                  </div>
                )}

                {replyTo === c._id && user && (
                  <div className="mt-3 border-t border-gray-800 pt-3">
                    <Composer
                      key={`reply-${c._id}`}
                      placeholder={`回复 @${authorName(c.author)}…`}
                      submitLabel="回复"
                      autoFocus
                      onCancel={() => setReplyTo(null)}
                      onSubmit={async (content, imageUrl) => {
                        const ok = await handleCreate(content, imageUrl, c._id);
                        if (ok) setReplyTo(null);
                        return ok;
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}

        {!loading && comments.length < total && (
          <button
            type="button"
            disabled={loadingMore}
            onClick={handleLoadMore}
            className="w-full rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            {loadingMore ? "加载中…" : `加载更多（还有 ${total - comments.length} 条）`}
          </button>
        )}
      </div>
    </section>
  );
}
