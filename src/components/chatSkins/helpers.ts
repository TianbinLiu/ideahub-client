/**
 * @file chatSkins/helpers.ts - 聊天皮肤共用的纯函数。
 * @category Utility
 *
 * 与 primitives.tsx 分开的理由同评论皮肤：组件与纯函数混在一个文件会破坏 react-refresh。
 */

/** FNV-1a：与 ../skins/helpers.ts 同款；只用于造占位展示值，不用于任何逻辑判断。 */
function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * 由消息 id 派生一个【稳定的占位】时钟时间（微信/QQ 会话里的居中时间条）。
 * ScenarioChatMessage 没有时间字段（种子对话是 AI 生成的，没有真实发送时间），
 * 但「时间条」是聊天界面布局的组成部分，少了它皮肤不成立。
 * 纯函数、只依赖 id ⇒ 每次渲染一致、无副作用；是展示占位，不是数据。
 */
export function pseudoClockZh(id: string): string {
  const minuteOfDay = hashId(`${id}#clock`) % 1440;
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  const period = h < 6 ? "凌晨" : h < 12 ? "上午" : h < 18 ? "下午" : "晚上";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${period}${h12}:${String(m).padStart(2, "0")}`;
}
