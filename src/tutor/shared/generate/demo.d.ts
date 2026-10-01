// 给 ./demo.js 的类型声明（只用到化名提示与风格预设）；实现只有那一份。
// 给 ../src/generate/demo.js 的类型声明（只用到化名提示与风格预设）；实现只有那一份。
export function realNameHint(name: string): string | null;
export const STYLE_PRESETS: Record<"calc_first" | "socratic" | "failure_first", { label: string; hint: string; greeting: string; catchphrases: string[]; teaching_style: string }>;

