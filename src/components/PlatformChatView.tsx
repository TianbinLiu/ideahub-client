/**
 * @file PlatformChatView.tsx - chat 场景的【聊天壳 + 平台分发】（纯展示 + 回调，不发请求）。
 * @category Component
 *
 * 与评论壳 PlatformCommentView.tsx 平行，职责三件：
 *   1. 解析发送者：按 participants 花名册把每条消息的 senderId（或 play 页 AI 回复的
 *      senderName）解析成 {名字/头像/是否本人} 的视图模型 —— 皮肤不接触这个映射。
 *   2. 分发：platform → 对应的聊天皮肤组件（见 ./chatSkins/index.ts，未知→通用聊天皮肤）。
 *   3. 公共壳：空态 + 底部发送 composer（pending 时禁用并提示）。
 *      composer 不做成皮肤的一部分，保证 play 页发言行为在所有聊天平台一致。
 *
 * 与评论壳的两点【故意】不同：
 *   · 消息是线性时间线，没有 parentId/建树/回复态 —— 不要往这里加楼中楼概念；
 *   · 会话标题由参与者推导（1v1=对方名、群聊=「群聊(n)」样式），可用 title 覆盖。
 *
 * 调用点：
 *   · ScenarioSceneView（编辑器/详情页只读预览）
 *   · ScenarioPlayPage —— 带 composer 发言；onSubmit(text) 语义：发一条我方消息
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send } from "lucide-react";
import type { ScenarioParticipant } from "../api";
import { resolveChatSkin } from "./chatSkins";
import type { ChatBubbleMessage } from "./chatSkins/types";

/**
 * 壳层入参消息：种子/用户消息带 senderId（指向 participants[].id）；
 * play 页 AI 回复没有 senderId，带 senderName/senderAvatar，壳层按名字回查花名册
 * （匹配到则用花名册头像补全，匹配不到也照常显示 —— 绝不静默丢消息）。
 */
export type ChatViewMessage = {
  id: string;
  senderId?: string | null;
  senderName?: string;
  senderAvatar?: string;
  text: string;
  isAi?: boolean;
};

type PlatformChatViewProps = {
  platform: string;
  participants: ScenarioParticipant[];
  messages: ChatViewMessage[];
  /** 会话标题；缺省由参与者推导：1v1=对方名，群聊=「名、名…(n)」 */
  title?: string;
  composer?: boolean;
  onSubmit?: (text: string) => void;
  pending?: boolean;
};

export default function PlatformChatView({
  platform,
  participants,
  messages,
  title,
  composer = false,
  onSubmit,
  pending = false,
}: PlatformChatViewProps) {
  // resolveChatSkin 返回的是 chatSkins/index.ts 的模块级常量组件（引用稳定），
  // 同 PlatformCommentView 里 resolveSkin 的契约 —— 别改成返回包装闭包。
  const Skin = resolveChatSkin(platform);

  // 只译壳层 UI（空态 / composer），不碰皮肤里的仿真中文
  const { t } = useTranslation();

  const [text, setText] = useState("");

  const { resolved, isGroup, derivedTitle } = useMemo(() => {
    const byId = new Map(participants.map((p) => [p.id, p]));
    const byName = new Map(participants.map((p) => [p.name, p]));
    const others = participants.filter((p) => !p.isSelf);

    const resolvedMsgs: ChatBubbleMessage[] = messages.map((m) => {
      // senderId 优先；AI 回复按名字回查（generateChatReplies 保证 authorName 是花名册里的 name）
      const p =
        (m.senderId ? byId.get(m.senderId) : undefined) ??
        (m.senderName ? byName.get(m.senderName) : undefined);
      return {
        id: m.id,
        text: m.text,
        senderName: p?.name || m.senderName || "？",
        senderAvatar: p?.avatar || m.senderAvatar || "",
        isSelf: !!p?.isSelf,
        isAi: m.isAi,
      };
    });

    // 群聊判定按【参与者人数】而不是消息发送者数：3 人群里就算只有 2 人说过话也是群聊
    const group = participants.length > 2;
    const derived = group
      ? `${others.map((p) => p.name).filter(Boolean).slice(0, 3).join("、")}(${participants.length})`
      : others[0]?.name || "";
    return { resolved: resolvedMsgs, isGroup: group, derivedTitle: derived };
  }, [participants, messages]);

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    onSubmit?.(trimmed);
    setText("");
  }

  return (
    <div className="flex flex-col">
      {resolved.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/40 p-8 text-center text-sm text-gray-500">
          {t("platformChat.empty")}
        </div>
      ) : (
        // 引用稳定性契约同 PlatformCommentView，见上面 const Skin 处注释
        // eslint-disable-next-line react-hooks/static-components
        <Skin title={title || derivedTitle} messages={resolved} isGroup={isGroup} />
      )}

      {/* 底部发送框（公共壳；样式与评论壳 composer 一致，行为无回复态） */}
      {composer && (
        <div className="sticky bottom-0 mt-4 rounded-2xl border border-gray-800 bg-gray-900/95 p-3 backdrop-blur">
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
              placeholder={pending ? t("platformChat.aiReplying") : t("platformChat.placeholder")}
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
                  <span className="h-2 w-2 rounded-full bg-black/70 motion-safe:animate-pulse" />
                  {t("platformChat.aiReplying")}
                </span>
              ) : (
                <>
                  <Send size={15} /> {t("platformChat.send")}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
