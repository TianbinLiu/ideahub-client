/**
 * @file chatSkins/QqChatSkin.tsx - QQ 聊天皮肤（platform=qq）。
 * @category Component
 *
 * 布局要点（QQ 的辨识点，别与微信皮肤趋同）：
 *   · 【白底】会话 + 白色顶栏（现代 QQNT 风），标题居中
 *   · 自己：蓝气泡 #0099ff 靠右、【白字】；对方：浅灰气泡 #f4f5f7 靠左、黑字
 *   · 头像：34 的【正圆】（QQ 是圆头像，与微信的圆角方块相对）
 *   · 群聊：对方消息在气泡上方显示昵称（灰小字）；1v1 不显示
 *   · 居中时间条（占位时钟时间）
 * 仿真中文文案故意保留、不走 i18n（同评论皮肤惯例）。
 */
import { ChevronLeft, Menu } from "lucide-react";
import type { ChatSkinProps } from "./types";
import { ChatAvatar } from "./primitives";
import { pseudoClockZh } from "./helpers";
import { AiTag } from "../skins/primitives";

export default function QqChatSkin({ title, messages, isGroup }: ChatSkinProps) {
  return (
    <section data-skin="qq" className="overflow-hidden rounded-2xl border border-gray-800 bg-white text-black">
      {/* 顶栏：白底、居中标题、右侧菜单（与微信的浅灰顶栏区分） */}
      <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2.5">
        <ChevronLeft size={20} className="shrink-0 text-black/70" />
        <div className="min-w-0 px-2 text-center">
          <span className="block truncate text-[15px] font-semibold">{title || "QQ"}</span>
        </div>
        <Menu size={18} className="shrink-0 text-black/70" />
      </div>

      <div className="space-y-3 px-3 py-4">
        {messages.length > 0 && (
          <div className="text-center">
            <span className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] text-black/35">
              {pseudoClockZh(messages[0].id)}
            </span>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.isSelf ? "flex-row-reverse" : ""}`}>
            <ChatAvatar name={m.senderName} avatar={m.senderAvatar} shape="circle" size={34} />
            <div className={`flex max-w-[75%] flex-col ${m.isSelf ? "items-end" : "items-start"}`}>
              {!m.isSelf && (isGroup || m.isAi) && (
                <div className="mb-0.5 flex min-w-0 items-center gap-1 px-1 text-xs text-black/40">
                  {isGroup && <span className="truncate">{m.senderName}</span>}
                  {m.isAi && <AiTag />}
                </div>
              )}
              <div
                className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-[15px] leading-relaxed ${
                  m.isSelf ? "bg-[#0099ff] text-white" : "bg-[#f4f5f7]"
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
