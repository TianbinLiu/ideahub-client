/**
 * @file voiceMix.ts - 混音配方的纯函数：权重归一 / 百分比 / 配方文案 / 从 VoiceSettings 拼 TTS 请求体 / 服务端人话透传
 * @category Utility
 *
 * 声音市场的「混音」= 1～3 味豆包 1.0 音色按权重调和（docs/COMPANION.md「声音市场」）。
 * 权重在前端是滑杆值（0.05～1，随手拖），展示要的是「高冷御姐 50% · 知性女声 30% · 魅力女友 20%」这种归一后的百分比；
 * 服务端收到后会再归一一遍（和为 1、3 位小数），所以这里的归一只为显示与请求体整洁，不承担校验职责。
 *
 * ★ 百分比用最大余数法凑整：三味等权直接四舍五入是 33/33/33 = 99%，用户会以为少了 1%；最大余数法给 34/33/33。
 * ★ buildTtsRequest 是「VoiceSettings → /api/tts 请求体」的唯一实现：首页逐句 TTS、触摸反应、各处「试听」都从这里拼。
 *   有 mix 就传 mix、不传 voice / instruct / expressive / emotion（1.0 混音不认这些）；没 mix 走原来的单音色路子。
 *   分叉只写在这一处 —— 之前 CompanionChat 里两处 TTS 调用各自展开 voiceSettings，加一个字段就得改两遍。
 * ★ 没有 React、没有 i18n 依赖：可以在 vitest 里直接测（voiceMix.test.ts）。
 */

import type { TtsRequestBody, VoiceMixEntry, VoiceSettings } from "../api";

/** 滑杆范围与步长：0.05 一格，最小 0.05（0 = 这味没意义，直接删行），最大 1 */
export const MIX_WEIGHT_MIN = 0.05;
export const MIX_WEIGHT_MAX = 1;
export const MIX_WEIGHT_STEP = 0.05;
/** 服务端 maxMixVoices 的兜底（老服务端不给这个字段时）；与契约一致 = 3 */
export const DEFAULT_MAX_MIX_VOICES = 3;

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}

/** 滑杆值 → 合法权重：夹到 [0.05, 1]，两位小数（range 的浮点 step 会吐出 0.15000000000000002 这种） */
export function clampMixWeight(raw: number): number {
  if (!Number.isFinite(raw)) return MIX_WEIGHT_MIN;
  const clamped = Math.min(MIX_WEIGHT_MAX, Math.max(MIX_WEIGHT_MIN, raw));
  return Math.round(clamped * 100) / 100;
}

/** 有没有一份可用的混音。空数组也算没有：服务端要求 1～3 味，空的当单音色处理 */
export function hasMix<T extends { mix?: VoiceMixEntry[] | null }>(settings: T | null | undefined): settings is T & { mix: VoiceMixEntry[] } {
  return Boolean(settings && Array.isArray(settings.mix) && settings.mix.length > 0);
}

/**
 * 去掉空 id / 非法权重 / 重复音色的条目（服务端会拒绝或合并它们），最多 max 味；不归一。
 * 混音器里「还没选音色」的空行就是靠这个在发请求前被剔掉的。
 */
export function cleanMix(entries: ReadonlyArray<VoiceMixEntry>, max = DEFAULT_MAX_MIX_VOICES): VoiceMixEntry[] {
  const seen = new Set<string>();
  const out: VoiceMixEntry[] = [];
  for (const entry of entries) {
    const voiceId = String(entry?.voiceId || "").trim();
    const weight = Number(entry?.weight);
    if (!voiceId || seen.has(voiceId) || !Number.isFinite(weight) || weight <= 0) continue;
    seen.add(voiceId);
    out.push({ voiceId, weight });
    if (out.length >= max) break;
  }
  return out;
}

/** 权重归一到和为 1（3 位小数）；四舍五入的零头补到最重的一味上，保证严格等于 1.000 */
export function normalizeMixWeights(entries: ReadonlyArray<VoiceMixEntry>): VoiceMixEntry[] {
  const clean = cleanMix(entries, Number.POSITIVE_INFINITY);
  if (clean.length === 0) return [];
  const total = clean.reduce((sum, entry) => sum + entry.weight, 0);
  const out = clean.map((entry) => ({ voiceId: entry.voiceId, weight: round3(entry.weight / total) }));
  const drift = round3(1 - out.reduce((sum, entry) => sum + entry.weight, 0));
  if (drift !== 0) {
    let heaviest = 0;
    out.forEach((entry, index) => {
      if (entry.weight > out[heaviest].weight) heaviest = index;
    });
    out[heaviest] = { ...out[heaviest], weight: round3(out[heaviest].weight + drift) };
  }
  return out;
}

/**
 * 每味的整数百分比（最大余数法，和恒为 100）。结果与 entries 一一对应：没选音色 / 权重非法的行给 0，
 * 这样混音器每一行都能直接取自己的百分比显示。
 */
export function mixPercentages(entries: ReadonlyArray<VoiceMixEntry>): number[] {
  const weights = entries.map((entry) => {
    const weight = Number(entry?.weight);
    return String(entry?.voiceId || "").trim() && Number.isFinite(weight) && weight > 0 ? weight : 0;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => (weight / total) * 100);
  const result = exact.map((value) => Math.floor(value));
  let remainder = 100 - result.reduce((sum, value) => sum + value, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - result[index] }))
    .filter(({ index }) => weights[index] > 0)
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    result[index] += 1;
    remainder -= 1;
  }
  return result;
}

/** 「高冷御姐 50% · 知性女声 30% · 魅力女友 20%」；nameOf 把 id 换成目录里的名字（目录外原样显示 id） */
export function formatMixRecipe(entries: ReadonlyArray<VoiceMixEntry>, nameOf: (voiceId: string) => string, separator = " · "): string {
  const clean = cleanMix(entries);
  const percentages = mixPercentages(clean);
  return clean.map((entry, index) => `${nameOf(entry.voiceId) || entry.voiceId} ${percentages[index]}%`).join(separator);
}

/**
 * VoiceSettings → /api/tts 请求体。
 * - 有 mix：{ text, mix（归一后）, rate, pitch }。不传 voice（服务端以 mix 为准）；instruct / expressive / emotion 对 1.0 混音无效，不传。
 * - 单音色：{ text, voice, rate, pitch, expressive, emotion, instruct }；voiceId 为空时用 fallbackVoiceId（老 config.voice），
 *   再没有就不传、交给服务端默认。
 * - settings 为空（老服务端没给 voiceSettings）→ 单音色 + expressive=true，与改造前行为一致。
 */
export function buildTtsRequest(opts: {
  text: string;
  settings: Partial<VoiceSettings> | null | undefined;
  fallbackVoiceId?: string;
  emotion?: string;
  instruct?: string;
}): TtsRequestBody {
  const { text, settings, fallbackVoiceId, emotion, instruct } = opts;
  const rate = settings?.rate ?? undefined;
  const pitch = settings?.pitch ?? undefined;
  if (hasMix(settings)) {
    const body: TtsRequestBody = { text, mix: normalizeMixWeights(settings.mix) };
    if (rate != null) body.rate = rate;
    if (pitch != null) body.pitch = pitch;
    return body;
  }
  const body: TtsRequestBody = { text, expressive: settings?.expressive ?? true };
  const voice = settings?.voiceId || fallbackVoiceId || "";
  if (voice) body.voice = voice;
  if (rate != null) body.rate = rate;
  if (pitch != null) body.pitch = pitch;
  if (emotion) body.emotion = emotion;
  const trimmedInstruct = (instruct ?? "").trim();
  if (trimmedInstruct) body.instruct = trimmedInstruct;
  return body;
}

/**
 * 服务端返回的「人话」校验信息（如「混音只支持豆包 1.0 音色……」）→ 原样给用户看；
 * 拿不到人话（zod 的通用 "Validation error"、别的错误码）→ null，调用方回退 humanizeError。
 * ★ humanizeError 对 VALIDATION_ERROR 一律翻成笼统的「请检查输入」，会把服务端特意写的中文提示吞掉，所以要先过这一道。
 */
export function serverHumanMessage(err: unknown): string | null {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (!e || e.code !== "VALIDATION_ERROR") return null;
  const message = typeof e.message === "string" ? e.message.trim() : "";
  if (!message || /^validation error$/i.test(message)) return null;
  return message;
}
