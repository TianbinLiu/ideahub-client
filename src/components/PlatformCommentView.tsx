/**
 * @file PlatformCommentView.tsx - 情景模拟评论区皮肤渲染组件（纯展示 + 回调，不发请求）。
 * 按 platform 渲染有明显区分的皮肤（generic / bilibili / weibo / tieba；zhihu、instagram 映射到相近皮肤），
 * 用 parentId 组织顶楼与回复层级（回复缩进渲染在父评论下方），isOP 显示楼主/UP主/博主徽标，
 * 可选底部发言 composer（回复态显示 “回复 @xxx” 与取消，pending 时禁用并提示 “AI 正在回复…”）。
 */
import { useMemo, useState } from "react";
import {
  Heart,
  MessageSquare,
  Repeat2,
  Send,
  ThumbsUp,
  X,
  type LucideIcon,
} from "lucide-react";
import type { ScenarioComment } from "../api";

/** play 页会把 AI 回复（带 isAi 标记）作为 ScenarioComment 追加进来，这里做宽松读取用于微标 “AI”。 */
type CommentLike = ScenarioComment & { isAi?: boolean };

type PlatformCommentViewProps = {
  platform: string;
  comments: ScenarioComment[];
  topic?: string;
  composer?: boolean;
  replyingTo?: ScenarioComment | null;
  onCancelReply?: () => void;
  onReplyTo?: (c: ScenarioComment) => void;
  onSubmit?: (text: string, parentId: string | null) => void;
  pending?: boolean;
};

type SkinKey = "generic" | "bilibili" | "weibo" | "tieba";

type Skin = {
  /** 平台徽标底色/边框 */
  badgeClass: string;
  /** 顶楼卡片 */
  card: string;
  /** 回复卡片（缩进内） */
  replyCard: string;
  /** 作者名颜色 */
  authorClass: string;
  /** 点赞图标/数字颜色 */
  likeClass: string;
  /** 点赞图标 */
  likeIcon: LucideIcon;
  /** 楼主徽标样式 */
  opBadgeClass: string;
  /** 楼主称呼（UP主 / 博主 / 楼主） */
  opLabel: string;
  /** 回复缩进的左边框色 */
  dividerClass: string;
  /** 是否显示楼层号 */
  showFloor: boolean;
  /** 楼层号文案 */
  floorText: (n: number) => string;
  /** 是否显示微博式“转发/评论/赞”条 */
  actionBar: boolean;
};

/** 平台 -> 皮肤（未知一律 generic；zhihu 复用蓝调 bilibili，instagram 复用社交流 weibo）。 */
const PLATFORM_SKIN: Record<string, SkinKey> = {
  bilibili: "bilibili",
  weibo: "weibo",
  tieba: "tieba",
  zhihu: "bilibili",
  instagram: "weibo",
  generic: "generic",
};

/** 平台展示名（徽标文案，用真实 platform 而非皮肤 key）。 */
const PLATFORM_LABEL: Record<string, string> = {
  bilibili: "哔哩哔哩",
  weibo: "微博",
  tieba: "百度贴吧",
  zhihu: "知乎",
  instagram: "Instagram",
  generic: "评论区",
};

const SKINS: Record<SkinKey, Skin> = {
  generic: {
    badgeClass: "border border-gray-700 bg-gray-800 text-gray-200",
    card: "rounded-2xl border border-gray-800 bg-gray-900 p-4",
    replyCard: "rounded-xl border border-gray-800 bg-gray-950/40 p-3",
    authorClass: "text-gray-100",
    likeClass: "text-cyan-300",
    likeIcon: ThumbsUp,
    opBadgeClass: "border border-cyan-500/30 bg-cyan-500/15 text-cyan-200",
    opLabel: "楼主",
    dividerClass: "border-gray-800",
    showFloor: false,
    floorText: (n) => `#${n}`,
    actionBar: false,
  },
  bilibili: {
    badgeClass: "border border-pink-500/40 bg-pink-500/15 text-pink-200",
    card: "rounded-lg border border-pink-500/15 bg-gray-900 p-4",
    replyCard: "rounded-md border border-sky-500/10 bg-gray-950/50 p-3",
    authorClass: "text-sky-300",
    likeClass: "text-pink-300",
    likeIcon: ThumbsUp,
    opBadgeClass: "border border-pink-500/30 bg-pink-500/15 text-pink-200",
    opLabel: "UP主",
    dividerClass: "border-pink-500/20",
    showFloor: true,
    floorText: (n) => `#${n}`,
    actionBar: false,
  },
  weibo: {
    badgeClass: "border border-orange-500/40 bg-orange-500/15 text-orange-200",
    card: "rounded-xl border border-gray-800 bg-gray-900 p-4",
    replyCard: "rounded-lg border border-orange-500/10 bg-gray-950/50 p-3",
    authorClass: "text-orange-300",
    likeClass: "text-red-400",
    likeIcon: Heart,
    opBadgeClass: "border border-orange-500/30 bg-orange-500/15 text-orange-200",
    opLabel: "博主",
    dividerClass: "border-orange-500/20",
    showFloor: false,
    floorText: (n) => `#${n}`,
    actionBar: true,
  },
  tieba: {
    badgeClass: "border border-blue-500/40 bg-blue-600/15 text-blue-200",
    card: "rounded-md border border-blue-500/15 bg-gray-900 p-4",
    replyCard: "rounded-md border border-blue-500/10 bg-gray-950/50 p-3",
    authorClass: "text-blue-300",
    likeClass: "text-blue-300",
    likeIcon: ThumbsUp,
    opBadgeClass: "border border-blue-500/30 bg-blue-600/15 text-blue-200",
    opLabel: "楼主",
    dividerClass: "border-blue-500/20",
    showFloor: true,
    floorText: (n) => `${n}楼`,
    actionBar: false,
  },
};

function normalizePlatform(platform: string): string {
  const p = (platform || "").toLowerCase();
  return PLATFORM_SKIN[p] ? p : "generic";
}

function Avatar({ name, url, ringClass }: { name: string; url?: string; ringClass: string }) {
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`h-9 w-9 shrink-0 rounded-full object-cover ring-1 ${ringClass}`}
      />
    );
  }
  const ch = (name || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-700 text-sm font-semibold text-gray-100 ring-1 ${ringClass}`}
    >
      {ch}
    </div>
  );
}

type CommentNodeProps = {
  comment: ScenarioComment;
  skin: Skin;
  depth: number;
  floor?: number;
  getReplies: (parentId: string) => ScenarioComment[];
  onReplyTo?: (c: ScenarioComment) => void;
};

function CommentNode({ comment, skin, depth, floor, getReplies, onReplyTo }: CommentNodeProps) {
  const replies = getReplies(comment.id);
  const isAi = (comment as CommentLike).isAi === true;
  const LikeIcon = skin.likeIcon;
  const likeCount = comment.likeCount ?? 0;

  return (
    <div>
      <div className={depth === 0 ? skin.card : skin.replyCard}>
        <div className="flex gap-3">
          <Avatar name={comment.authorName} url={comment.authorAvatar} ringClass={skin.dividerClass} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={`text-sm font-medium ${skin.authorClass}`}>{comment.authorName || "匿名"}</span>
              {comment.isOP && (
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${skin.opBadgeClass}`}>
                  {skin.opLabel}
                </span>
              )}
              {isAi && (
                <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-purple-200">
                  AI
                </span>
              )}
              {skin.showFloor && typeof floor === "number" && (
                <span className="ml-auto text-[11px] text-gray-500">{skin.floorText(floor)}</span>
              )}
            </div>

            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-200">{comment.text}</p>

            <div className="mt-2 flex items-center gap-5 text-xs text-gray-400">
              {skin.actionBar && (
                <span className="flex items-center gap-1">
                  <Repeat2 size={14} /> 转发
                </span>
              )}
              <span className={`flex items-center gap-1 ${skin.likeClass}`}>
                <LikeIcon size={14} /> {likeCount}
              </span>
              {onReplyTo && (
                <button
                  type="button"
                  onClick={() => onReplyTo(comment)}
                  className="flex items-center gap-1 transition-colors hover:text-gray-200"
                >
                  <MessageSquare size={14} /> 回复
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <div className={`ml-5 mt-2 space-y-2 border-l pl-3 ${skin.dividerClass}`}>
          {replies.map((r) => (
            <CommentNode
              key={r.id}
              comment={r}
              skin={skin}
              depth={depth + 1}
              getReplies={getReplies}
              onReplyTo={onReplyTo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlatformCommentView({
  platform,
  comments,
  topic,
  composer = false,
  replyingTo = null,
  onCancelReply,
  onReplyTo,
  onSubmit,
  pending = false,
}: PlatformCommentViewProps) {
  const platformKey = normalizePlatform(platform);
  const skin = SKINS[PLATFORM_SKIN[platformKey]];
  const platformLabel = PLATFORM_LABEL[platformKey] || PLATFORM_LABEL.generic;

  const [text, setText] = useState("");

  // 用 parentId 组织层级：顶楼 + 按 parentId 分组的回复。
  // 孤儿回复（父不存在）、自引用、以及父链成环的评论都降级为顶楼，
  // 保证森林无环、每条评论恰好渲染一次（否则环会导致评论静默消失或无限递归）。
  const { topLevel, repliesByParent } = useMemo(() => {
    const byId = new Map<string, ScenarioComment>(comments.map((c) => [c.id, c]));
    const effParent = new Map<string, string | null>();
    const rawParent = (c: ScenarioComment | undefined): string | null => {
      if (!c) return null;
      const pid = c.parentId ?? null;
      return pid != null && byId.has(pid) && pid !== c.id ? pid : null;
    };
    for (const c of comments) {
      let pid = rawParent(c);
      if (pid == null) {
        effParent.set(c.id, null);
        continue;
      }
      // 沿父链上溯，遇到已访问节点即判定为环 → 降级为顶楼
      const seen = new Set<string>([c.id]);
      let cur: string | null = pid;
      let cyclic = false;
      while (cur != null) {
        if (seen.has(cur)) {
          cyclic = true;
          break;
        }
        seen.add(cur);
        cur = rawParent(byId.get(cur));
      }
      effParent.set(c.id, cyclic ? null : pid);
    }
    const top: ScenarioComment[] = [];
    const map = new Map<string, ScenarioComment[]>();
    for (const c of comments) {
      const pid = effParent.get(c.id) ?? null;
      if (pid == null) {
        top.push(c);
      } else {
        const arr = map.get(pid);
        if (arr) arr.push(c);
        else map.set(pid, [c]);
      }
    }
    return { topLevel: top, repliesByParent: map };
  }, [comments]);

  const getReplies = (parentId: string) => repliesByParent.get(parentId) || [];

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    onSubmit?.(trimmed, replyingTo?.id ?? null);
    setText("");
  }

  return (
    <div className="flex flex-col">
      {/* 平台头 + 话题 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-xs font-semibold ${skin.badgeClass}`}>{platformLabel}</span>
        {topic && <span className="min-w-0 truncate text-xs text-gray-400">话题：{topic}</span>}
      </div>

      {/* 评论列表 */}
      {topLevel.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 p-8 text-center text-sm text-gray-500">
          还没有评论
        </div>
      ) : (
        <div className="space-y-3">
          {topLevel.map((c, i) => (
            <CommentNode
              key={c.id}
              comment={c}
              skin={skin}
              depth={0}
              floor={i + 1}
              getReplies={getReplies}
              onReplyTo={onReplyTo}
            />
          ))}
        </div>
      )}

      {/* 底部发言输入框 */}
      {composer && (
        <div className="sticky bottom-0 mt-4 rounded-2xl border border-gray-800 bg-gray-900/95 p-3 backdrop-blur">
          {replyingTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-950/60 px-3 py-1.5 text-xs text-gray-300">
              <span className="min-w-0 truncate">
                回复 <span className="text-cyan-300">@{replyingTo.authorName}</span>
              </span>
              {onCancelReply && (
                <button
                  type="button"
                  onClick={onCancelReply}
                  className="ml-2 flex shrink-0 items-center gap-1 text-gray-400 transition-colors hover:text-gray-200"
                >
                  <X size={13} /> 取消
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={pending ? "AI 正在回复…" : replyingTo ? `回复 @${replyingTo.authorName}` : "说点什么…"}
              className="min-w-0 flex-1 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 outline-none focus:border-cyan-500/50 disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={pending || !text.trim()}
              className="flex shrink-0 items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:opacity-60"
            >
              {pending ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-black/70" />
                  AI 正在回复…
                </span>
              ) : (
                <>
                  <Send size={15} /> 发送
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
