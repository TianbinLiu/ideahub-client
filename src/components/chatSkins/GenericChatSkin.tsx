/**
 * @file chatSkins/GenericChatSkin.tsx - 通用聊天皮肤（platform=generic / 未知平台的兜底）。
 * @category Component
 *
 * 布局取向：【不模仿任何具体平台】，走本站自己的深色卡片风（与 ../skins/GenericSkin.tsx 呼应）：
 *   · 深色底 + 顶部「聊天 · 模拟」徽标 + 会话标题
 *   · 自己：青色调气泡靠右；对方：深灰气泡靠左
 *   · 头像：32 正圆；群聊显示发送者名
 */
import type { ChatSkinProps } from "./types";
import { ChatAvatar } from "./primitives";
import { AiTag } from "../skins/primitives";

export default function GenericChatSkin({ title, messages, isGroup }: ChatSkinProps) {
  return (
    <section data-skin="generic-chat" className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-md border border-gray-700 bg-gray-800 px-2 py-0.5 text-xs font-semibold text-gray-200">
          聊天 · 模拟
        </span>
        {title && <span className="min-w-0 truncate text-xs text-gray-400">{title}</span>}
      </div>

      <div className="space-y-3">
        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.isSelf ? "flex-row-reverse" : ""}`}>
            <ChatAvatar name={m.senderName} avatar={m.senderAvatar} shape="circle" size={32} />
            <div className={`flex max-w-[75%] flex-col ${m.isSelf ? "items-end" : "items-start"}`}>
              {!m.isSelf && (isGroup || m.isAi) && (
                <div className="mb-0.5 flex min-w-0 items-center gap-1 px-1 text-xs text-gray-400">
                  {isGroup && <span className="truncate">{m.senderName}</span>}
                  {m.isAi && <AiTag />}
                </div>
              )}
              <div
                className={`whitespace-pre-wrap break-words rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  m.isSelf
                    ? "border border-cyan-500/30 bg-cyan-500/15 text-cyan-50"
                    : "bg-gray-800 text-gray-100"
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
