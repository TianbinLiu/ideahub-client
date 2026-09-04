/**
 * @file live2dUploadError.ts - 把服务端校验 Live2D 压缩包的英文报错翻译成 i18n key
 * @category Utility
 *
 * POST /api/live2d-models 解包失败时 400 带的是英文 message（服务端不做多语言）。
 * 用户最常撞上的几种（Cubism 2 旧格式、少贴图、少 moc3、根本没有 model3.json、包太大）在这里按正则匹配，
 * 匹配不上就返回 null，由调用方回退到 humanizeError 原样显示 —— 宁可显示英文原话，也不要把不认识的错误翻成错的中文。
 * 正则顺序有讲究：「moc3 missing」要排在「texture」之后判断吗？不用，两者互斥；但 Cubism 2 那条必须最先，
 * 因为它的原文也可能提到 moc/model json。
 */

const RULES: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /Cubism 2/i, key: "live2dMarket.errors.cubism2" },
  { pattern: /No Live2D model json/i, key: "live2dMarket.errors.noModelJson" },
  { pattern: /moc3.*missing|missing.*moc3/i, key: "live2dMarket.errors.mocMissing" },
  { pattern: /texture/i, key: "live2dMarket.errors.textureMissing" },
  { pattern: /too much data|too many files/i, key: "live2dMarket.errors.tooBig" },
];

/** 服务端 message → i18n key；不认识的 → null */
export function live2dUploadErrorKey(message: unknown): string | null {
  const text = typeof message === "string" ? message : "";
  if (!text) return null;
  const hit = RULES.find((rule) => rule.pattern.test(text));
  return hit ? hit.key : null;
}
