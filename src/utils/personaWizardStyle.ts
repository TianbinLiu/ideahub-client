// 人格向导写进 style 的五格（语气 / 称呼 / 开场白 / 示例对话 / 边界）—— 官网编辑器的读写规则，一处实现。
//
// ★★ 为什么官网编辑器需要知道这五格（2026-09-18）：服务端 PUT /api/personas/:id 的 style 改成了 PATCH 语义
//   （没带的键保持库里的值）。于是：
//   · 普通编辑**不发**这几个键 —— 改个价格不许把 App 向导写进去的东西清掉（那正是这次修的线上 bug）；
//   · 「从文本生成」换了一个角色，就必须**整体替换**这五格，空的也照发 —— 否则新名字配旧开场白，
//     数字人还会拿旧角色的示例对话当 few-shot 说话。
import type { PersonaStyle } from "../api";

export type WizardKey = "tone" | "addressUser" | "greeting" | "examples" | "boundaries";
export const WIZARD_KEYS: readonly WizardKey[] = ["tone", "addressUser", "greeting", "examples", "boundaries"];

/** 从一份 style 里取出向导五格，**缺的补空值** —— 用来整体替换，空值也要照发，旧值才会被清掉 */
export function pickWizardStyle(style: Partial<PersonaStyle> | undefined): Pick<PersonaStyle, WizardKey> {
  return {
    tone: style?.tone ?? "",
    addressUser: style?.addressUser ?? "",
    greeting: style?.greeting ?? "",
    examples: style?.examples ?? [],
    boundaries: style?.boundaries ?? [],
  };
}

/** 向导五格里哪几格有内容（只用来提示用户"它们还在 / 会被换掉"） */
export function filledWizardKeys(style: Partial<PersonaStyle> | undefined | null): WizardKey[] {
  if (!style) return [];
  return WIZARD_KEYS.filter((k) => {
    const v = style[k];
    return Array.isArray(v) ? v.length > 0 : typeof v === "string" && v.trim() !== "";
  });
}
