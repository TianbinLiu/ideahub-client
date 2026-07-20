/**
 * @file chatSkins/types.ts - 聊天皮肤组件的公共契约（sceneKind==='chat' 专用，与评论皮肤 ../skins/types.ts 平行）。
 * @category Component
 *
 * ★★ 与评论皮肤同一条纪律：这里【只传数据 + 回调】，没有任何样式配置字段 ★★
 * 平台之间真正的差异是【布局】——
 *   · 微信：浅灰会话底、自己是绿气泡、对方头像是圆角方块、群聊在气泡上方显示发送者名；
 *   · QQ：白底、自己是蓝气泡白字、头像是正圆；
 * 这些塞不进配置表。「长什么样」由每个平台自己的组件用 JSX 写死。
 * ⇒ 一旦这里出现 xxxClass / xxxColor / showXxx，就是在重蹈评论皮肤上一版「配色变体」的覆辙。
 *
 * 皮肤收到的消息是【已解析完的视图模型】：sender 的名字/头像/是否本人由
 * PlatformChatView 按 participants 花名册解析好，皮肤只管线性渲染时间线，
 * 不接触 senderId ↔ participant 的映射（那属于壳层职责，做错会静默丢发送者）。
 */

/** 一条已解析的聊天气泡消息（线性时间线的一项）。 */
export type ChatBubbleMessage = {
  /** scenario 内稳定 id（React key + 占位时间派生用） */
  id: string;
  text: string;
  /** 发送者显示名（群聊时对方消息在气泡上方显示；1v1 不显示） */
  senderName: string;
  /** 头像：emoji 或图片 url（可空 → 皮肤用首字符占位） */
  senderAvatar: string;
  /** 是否「我」（isSelf 参与者 / play 页真实用户的发言）→ 气泡靠右 */
  isSelf: boolean;
  /** play 页 AI 扮演的回复：皮肤渲染统一的 AI 微标（产品的诚实标注，非平台差异） */
  isAi?: boolean;
};

/** 所有聊天皮肤组件的统一入参。 */
export type ChatSkinProps = {
  /** 会话标题（1v1=对方名、群聊=群名样式），由壳层按参与者推导；皮肤按自己平台的顶栏样式渲染 */
  title?: string;
  /** 已按时间线排好的消息（sender 已解析），皮肤线性渲染即可，不要重排序 */
  messages: ChatBubbleMessage[];
  /** 群聊（参与者 > 2）：对方消息要显示发送者名；1v1 不显示 */
  isGroup: boolean;
};
