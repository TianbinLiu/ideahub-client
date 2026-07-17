/**
 * @file PlatformCommentView.tsx - 情景模拟评论区的【公共壳 + 平台分发】（纯展示 + 回调，不发请求）。
 * @category Component
 *
 * 职责只有三件：
 *   1. 防环建树：把扁平 comments 按 parentId 组织成【无环森林】
 *   2. 分发：platform → 对应的皮肤组件（见 ./skins/index.ts）
 *   3. 公共壳：空态 + 底部发言 composer（回复态 “回复 @xxx”、pending 时禁用并提示 “AI 正在回复…”）
 *
 * ★★ 为什么这里【没有】SKINS 配置表 ★★
 * 上一版用一张 SKINS = { bilibili: { opLabel:"UP主", likeIcon, showFloor, ... } } 驱动全部平台，
 * 查表只能表达「换颜色 / 换字 / 换图标」，于是 4 套皮肤被审计判为【配色变体】而非平台复刻；
 * 而且 zhihu 直接指向 bilibili 皮肤、instagram 直接指向 weibo 皮肤（别名复用）。
 * 真正的平台差异是【布局】——IG 的用户名和正文在同一个元素里、贴吧是方头像 +「N楼」+ 时间右对齐、
 * 微博是三键条、知乎是赞同/反对 —— 这些塞不进任何配置表。
 * ⇒ 现在【每个平台一个独立渲染组件】。要加平台差异请改对应皮肤的 JSX；
 *   往这里加 showXxx / xxxClass 字段就是在退回配色变体。
 *
 * 三个调用点（行为契约不变）：
 *   · ScenarioEditorPage  —— 只读预览
 *   · ScenarioDetailPage  —— 只读预览
 *   · ScenarioPlayPage    —— 带 composer 发言；onSubmit(text, parentId) 的语义不变
 */
import { useMemo, useState } from "react";
import { Send, X } from "lucide-react";
import type { ScenarioComment } from "../api";
import { resolveSkin } from "./skins";
import type { SkinComment } from "./skins/types";

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
  // resolveSkin 是【查注册表】，返回的永远是 skins/index.ts 里的模块级常量组件，
  // 不是在这里现造的闭包 ⇒ 同一个 platform 每次渲染拿到的是【同一个组件引用】，
  // 皮肤内的 state（如楼中楼折叠的 expanded）不会被无故重置；
  // platform 变了才换组件引用 → React 卸载重挂，折叠态跟着重置，这正是期望行为。
  //
  // ⚠️ 这条 lint 规则看不穿函数调用，只能看到「渲染期得到一个组件」。它守的不变量是真的：
  //    ★ SKIN_COMPONENTS 的每个 value 必须是模块级常量组件。
  //    哪天有人把 resolveSkin 改成返回包装闭包（如 (p) => (props) => <X/>），
  //    每次渲染都会得到新引用 → 皮肤 state 每帧被清空，而且悄无声息。改之前先想清楚这条。
  //    （规则报在下面的 JSX 使用处，disable 注释也在那儿。）
  const Skin = resolveSkin(platform);

  const [text, setText] = useState("");

  // ★ 防环建树（既有已修复的 bug，不许回退）
  // 用 parentId 组织层级：顶楼 + 按 parentId 分组的回复。
  // 孤儿回复（父不存在）、自引用、以及父链成环的评论都降级为顶楼，
  // 保证森林无环、每条评论恰好渲染一次（否则环会导致评论静默消失或无限递归）。
  const { topLevel, repliesByParent } = useMemo(() => {
    const byId = new Map<string, SkinComment>((comments as SkinComment[]).map((c) => [c.id, c]));
    const effParent = new Map<string, string | null>();
    const rawParent = (c: SkinComment | undefined): string | null => {
      if (!c) return null;
      const pid = c.parentId ?? null;
      return pid != null && byId.has(pid) && pid !== c.id ? pid : null;
    };
    for (const c of comments as SkinComment[]) {
      const pid = rawParent(c);
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
    const top: SkinComment[] = [];
    const map = new Map<string, SkinComment[]>();
    for (const c of comments as SkinComment[]) {
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
      {/* 平台皮肤：平台头/话题/列表全部由皮肤自己按它那个平台的样子渲染 */}
      {topLevel.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 p-8 text-center text-sm text-gray-500">
          还没有评论
        </div>
      ) : (
        // resolveSkin 返回的是 skins/index.ts 的模块级常量组件，引用稳定 —— 理由详见上面
        // const Skin 处的注释。规则看不穿函数调用，故在此处豁免。
        // eslint-disable-next-line react-hooks/static-components
        <Skin topic={topic} topLevel={topLevel} getReplies={getReplies} onReplyTo={onReplyTo} />
      )}

      {/* 底部发言输入框（公共壳：不做成平台皮肤的一部分，保证 play 页发言行为在所有平台一致） */}
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
                  className="ml-2 flex shrink-0 items-center gap-1 text-gray-400 motion-safe:transition-colors hover:text-gray-200"
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
              className="flex shrink-0 items-center gap-1 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black motion-safe:transition-colors hover:bg-gray-200 disabled:opacity-60"
            >
              {pending ? (
                <span className="flex items-center gap-1.5">
                  {/* prefers-reduced-motion 下不闪 */}
                  <span className="h-2 w-2 rounded-full bg-black/70 motion-safe:animate-pulse" />
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
