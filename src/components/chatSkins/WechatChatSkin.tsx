/**
 * @file chatSkins/WechatChatSkin.tsx - 微信聊天皮肤（platform=wechat）。
 * @category Component
 *
 * 布局要点（微信的辨识点，别与 QQ 皮肤趋同）：
 *   · 整个会话是【浅灰 #ededed】底，顶栏同色、居中标题、左「‹」右「···」
 *   · 自己：绿气泡 #95ec69 靠右、黑字；对方：白气泡靠左、黑字
 *   · 头像：36 的【圆角方块】（微信不是正圆）
 *   · 群聊：对方消息在气泡上方显示发送者昵称（灰小字）；1v1 不显示
 *   · 居中时间条（占位时钟时间，见 helpers.pseudoClockZh）
 * 仿真中文文案故意保留、不走 i18n（同评论皮肤惯例：译了就不仿真了）。
 */
import { ChevronLeft, MoreHorizontal } from "lucide-react";
import type { ChatSkinProps } from "./types";
import { ChatAvatar } from "./primitives";
import { pseudoClockZh } from "./helpers";
import { AiTag } from "../skins/primitives";

export default function WechatChatSkin({ title, messages, isGroup }: ChatSkinProps) {
  return (
    <section data-skin="wechat" className="overflow-hidden rounded-2xl border border-gray-800 bg-[#ededed] text-black">
      {/* 顶栏：微信是与会话同色的浅灰、居中标题 */}
      <div className="flex items-center justify-between border-b border-black/10 px-3 py-2.5">
        <ChevronLeft size={20} className="shrink-0 text-black/80" />
        <span className="min-w-0 truncate px-2 text-[15px] font-medium">{title || "微信"}</span>
        <MoreHorizontal size={20} className="shrink-0 text-black/80" />
      </div>

      <div className="space-y-3 px-3 py-4">
        {/* 居中时间条（按首条消息 id 派生的占位时间） */}
        {messages.length > 0 && (
          <div className="text-center">
            <span className="text-[11px] text-black/40">{pseudoClockZh(messages[0].id)}</span>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.isSelf ? "flex-row-reverse" : ""}`}>
            <ChatAvatar name={m.senderName} avatar={m.senderAvatar} shape="rounded" size={36} />
            <div className={`flex max-w-[75%] flex-col ${m.isSelf ? "items-end" : "items-start"}`}>
              {/* 群聊：对方气泡上方显示发送者昵称；AI 微标跟在名字后（1v1 时单独占位） */}
              {!m.isSelf && (isGroup || m.isAi) && (
                <div className="mb-0.5 flex min-w-0 items-center gap-1 px-1 text-xs text-black/40">
                  {isGroup && <span className="truncate">{m.senderName}</span>}
                  {m.isAi && <AiTag />}
                </div>
              )}
              <div
                className={`whitespace-pre-wrap break-words rounded-md px-3 py-2 text-[15px] leading-relaxed ${
                  m.isSelf ? "bg-[#95ec69]" : "bg-white"
                }`}
              >
                {m.text}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
