/**
 * @file skins/helpers.ts - 各皮肤共用的纯函数（拍平后代、占位时间/属地）。
 * @category Utility
 *
 * 与 ./primitives.tsx 分开：那边只放组件，这边只放纯函数 ——
 * 混在一个文件里会破坏 react-refresh（改一个纯函数会把整个皮肤树的 state 刷掉）。
 */
import type { SkinComment } from "./types";

/** 拍平后的一条回复：评论本身 + 它「回复的是谁」。 */
export type FlatReply = {
  comment: SkinComment;
  /**
   * 直接父级。父级就是顶楼那条时为 null ——
   * 对应各平台的实际行为：只有跨层回复才显示「回复 @某人」，直接回复顶楼不显示。
   */
  replyTo: SkinComment | null;
};

/**
 * 收集某条顶楼的【所有】后代（含多层），拍平成一条列表。
 *
 * 为什么要拍平：B站/微博/贴吧/抖音/小红书 的楼中楼在真实平台上就只有两层 ——
 * 更深的回复也是拍进同一个楼中楼、靠「回复 @某人」表达层级，而不是一直往右缩进。
 * （generic / 知乎 / IG 皮肤按各自平台的样子另行处理，不用这个。）
 *
 * ⚠️ 入参 getReplies 来自 PlatformCommentView 的防环建树（结果是森林、必然无环），
 *    故这个 DFS 必然终止；这里仍保留 seen 集合做纵深防御。
 *    同时保证【每条后代恰好出现一次】—— 既不重复渲染，也绝不静默丢评论。
 */
export function flattenReplies(
  rootId: string,
  getReplies: (parentId: string) => SkinComment[]
): FlatReply[] {
  const out: FlatReply[] = [];
  const seen = new Set<string>([rootId]);
  const stack: FlatReply[] = [];

  const pushChildren = (parentId: string, replyTo: SkinComment | null) => {
    const kids = getReplies(parentId);
    // 逆序入栈，pop 出来才是原顺序（前序 DFS = 按「回复链」的自然阅读顺序）
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ comment: kids[i], replyTo });
  };

  pushChildren(rootId, null);
  while (stack.length > 0) {
    const item = stack.pop() as FlatReply;
    if (seen.has(item.comment.id)) continue;
    seen.add(item.comment.id);
    out.push(item);
    pushChildren(item.comment.id, item.comment);
  }
  return out;
}

/** FNV-1a：纯函数、稳定、够散。只用于造占位展示值，不用于任何逻辑判断。 */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * 由评论 id 派生一个【稳定的占位】相对时间。
 *
 * ⚠️ ScenarioComment 没有时间字段（种子评论本来就是 AI 生成的，没有真实发布时间）。
 *    但「时间戳出现在哪」是各平台布局的组成部分（贴吧在楼层条右侧、IG 在操作行、
 *    知乎在正文下方的 meta 行…），少了它皮肤就不成立。故按 id 哈希造一个占位：
 *      · 纯函数、只依赖 id ⇒ 同一条评论每次渲染都一样，不会 re-render 时乱跳，可被快照测试；
 *      · 不读 Date.now() ⇒ 渲染无副作用。
 *    它是【展示占位】，不是数据；任何逻辑都不要依赖它。
 */
function pseudoMinutesAgo(id: string): number {
  return hashId(id) % 10080; // 0 ~ 7 天
}

/** 中文相对时间（B站/微博/贴吧/知乎/抖音/小红书/通用）。 */
export function pseudoTimeZh(id: string): string {
  const m = pseudoMinutesAgo(id);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m}分钟前`;
  if (m < 1440) return `${Math.floor(m / 60)}小时前`;
  return `${Math.floor(m / 1440)}天前`;
}

/** 英文短相对时间（Instagram 用的就是 "2h" / "3d" 这种紧凑写法，是它布局的一部分）。 */
export function pseudoTimeEn(id: string): string {
  const m = pseudoMinutesAgo(id);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}

/**
 * 由评论 id 派生的占位「IP 属地」（抖音/小红书会在评论上展示属地，是它们布局的一部分）。
 * 同上：占位展示值，对应的账号本来就是虚构的 AI 人设，不指向任何真实个人。
 */
const PSEUDO_REGIONS = ["广东", "北京", "上海", "浙江", "江苏", "四川", "湖北", "福建", "山东", "陕西"];
export function pseudoRegion(id: string): string {
  return PSEUDO_REGIONS[hashId(`${id}#region`) % PSEUDO_REGIONS.length];
}
