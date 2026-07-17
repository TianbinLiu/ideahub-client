/**
 * @file skins/types.ts - 平台皮肤组件的公共契约。
 * @category Component
 *
 * ★★ 这里【故意】没有样式配置字段 ★★
 * 上一版把皮肤做成了一张 SKINS 配置表（opLabel / likeIcon / showFloor / actionBar …），
 * 结果只能表达「换颜色、换字、换图标」，做出来的 4 套皮肤被审计判为【配色变体】而非平台复刻。
 * 原因是：平台之间真正的差异是【布局】——
 *   · Instagram 的用户名与正文在同一行、同一个元素里；
 *   · 贴吧是方头像 + 「N楼」+ 时间右对齐；
 *   · 微博是转发/评论/赞三键条；
 *   · 知乎是赞同/反对而不是点赞；
 * 这些塞不进任何配置表。所以本模块的契约只传【数据 + 回调】，
 * 「长什么样」由每个平台自己的组件用 JSX 写死。
 *
 * ⇒ 想加平台差异时，请改对应皮肤组件的 JSX；【不要】往这个 type 里加样式字段。
 *    一旦这里出现 xxxClass / xxxLabel / showXxx，就是在重蹈配色变体的覆辙。
 */
import type { ScenarioComment } from "../../api";

/**
 * play 页会把 AI 回复（带 isAi 标记）作为 ScenarioComment 追加进来，
 * 皮肤宽松读取该字段用于渲染 “AI” 微标；不改动 api.ts 里的契约类型。
 */
export type SkinComment = ScenarioComment & { isAi?: boolean };

/** 所有皮肤组件的统一入参。 */
export type SkinProps = {
  /** 争论主题；各皮肤按自己平台的样子渲染（微博 #话题#、知乎问题标题、贴吧帖子标题…） */
  topic?: string;
  /**
   * 顶楼列表。
   * ⚠️ 已由 PlatformCommentView 完成【防环建树】：保证无环、且每条评论恰好出现一次。
   *    皮肤内不要再自己按 parentId 裸递归。
   */
  topLevel: SkinComment[];
  /** 取某条评论的直接子回复（同样来自防环建树的结果，安全可递归/可拍平）。 */
  getReplies: (parentId: string) => SkinComment[];
  /** 点击 “回复” 的回调。未传 = 只读预览态（编辑器/详情页），此时不渲染回复入口。 */
  onReplyTo?: (c: ScenarioComment) => void;
};
