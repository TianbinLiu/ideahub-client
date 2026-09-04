import { describe, expect, it } from "vitest";
import {
  buildTtsRequest,
  clampMixWeight,
  cleanMix,
  formatMixRecipe,
  hasMix,
  mixPercentages,
  normalizeMixWeights,
  serverHumanMessage,
} from "./voiceMix";

const A = "zh_female_gaolengyujie_moon_bigtts";
const B = "zh_female_zhixingnvsheng_mars_bigtts";
const C = "zh_female_meilinvyou_moon_bigtts";
const NAMES: Record<string, string> = { [A]: "高冷御姐", [B]: "知性女声", [C]: "魅力女友" };
const nameOf = (id: string) => NAMES[id] || id;

describe("normalizeMixWeights", () => {
  it("权重归一到和为 1，3 位小数", () => {
    const out = normalizeMixWeights([
      { voiceId: A, weight: 1 },
      { voiceId: B, weight: 0.6 },
      { voiceId: C, weight: 0.4 },
    ]);
    expect(out).toEqual([
      { voiceId: A, weight: 0.5 },
      { voiceId: B, weight: 0.3 },
      { voiceId: C, weight: 0.2 },
    ]);
  });

  it("四舍五入的零头补到最重的一味上，和严格等于 1.000", () => {
    const out = normalizeMixWeights([
      { voiceId: A, weight: 1 },
      { voiceId: B, weight: 1 },
      { voiceId: C, weight: 1 },
    ]);
    const sum = out.reduce((s, e) => s + e.weight, 0);
    expect(Math.round(sum * 1000)).toBe(1000);
    expect(out.map((e) => e.weight).sort()).toEqual([0.333, 0.333, 0.334]);
  });

  it("空 id / 非法权重 / 重复音色被剔掉；全空 → []", () => {
    expect(
      normalizeMixWeights([
        { voiceId: "", weight: 1 },
        { voiceId: A, weight: 0 },
        { voiceId: B, weight: Number.NaN },
        { voiceId: C, weight: 0.3 },
        { voiceId: C, weight: 0.7 },
      ])
    ).toEqual([{ voiceId: C, weight: 1 }]);
    expect(normalizeMixWeights([])).toEqual([]);
    expect(normalizeMixWeights([{ voiceId: "", weight: 1 }])).toEqual([]);
  });
});

describe("mixPercentages", () => {
  it("最大余数法：三味等权是 34/33/33 而不是 33/33/33", () => {
    const pct = mixPercentages([
      { voiceId: A, weight: 1 },
      { voiceId: B, weight: 1 },
      { voiceId: C, weight: 1 },
    ]);
    expect(pct).toEqual([34, 33, 33]);
    expect(pct.reduce((s, x) => s + x, 0)).toBe(100);
  });

  it("与输入一一对应：没选音色的行给 0，其余仍凑满 100", () => {
    expect(
      mixPercentages([
        { voiceId: A, weight: 0.5 },
        { voiceId: "", weight: 0.5 },
        { voiceId: B, weight: 0.25 },
      ])
    ).toEqual([67, 0, 33]);
    expect(mixPercentages([{ voiceId: "", weight: 1 }])).toEqual([0]);
    expect(mixPercentages([])).toEqual([]);
  });
});

describe("formatMixRecipe / cleanMix / clampMixWeight", () => {
  it("配方文案：名字 + 百分比，目录外的 id 原样", () => {
    expect(
      formatMixRecipe(
        [
          { voiceId: A, weight: 0.5 },
          { voiceId: B, weight: 0.3 },
          { voiceId: "custom_x", weight: 0.2 },
        ],
        nameOf
      )
    ).toBe("高冷御姐 50% · 知性女声 30% · custom_x 20%");
  });

  it("cleanMix 最多保留 max 味", () => {
    const four = [A, B, C, "zh_male_x_moon_bigtts"].map((voiceId) => ({ voiceId, weight: 1 }));
    expect(cleanMix(four).length).toBe(3);
    expect(cleanMix(four, 2).length).toBe(2);
  });

  it("clampMixWeight 夹到 [0.05, 1] 并去掉浮点尾巴", () => {
    expect(clampMixWeight(0.15000000000000002)).toBe(0.15);
    expect(clampMixWeight(0)).toBe(0.05);
    expect(clampMixWeight(3)).toBe(1);
    expect(clampMixWeight(Number.NaN)).toBe(0.05);
  });

  it("hasMix：空数组 / null / 缺省都算没有", () => {
    expect(hasMix({ mix: [{ voiceId: A, weight: 1 }] })).toBe(true);
    expect(hasMix({ mix: [] })).toBe(false);
    expect(hasMix({ mix: null })).toBe(false);
    expect(hasMix({})).toBe(false);
    expect(hasMix(null)).toBe(false);
  });
});

describe("buildTtsRequest", () => {
  it("有 mix：传归一后的 mix + rate/pitch，不传 voice / instruct / expressive / emotion", () => {
    const body = buildTtsRequest({
      text: "你好",
      settings: {
        voiceId: "should_be_ignored",
        mix: [
          { voiceId: A, weight: 1 },
          { voiceId: B, weight: 1 },
        ],
        templateId: "t1",
        rate: -10,
        pitch: null,
        instruct: "温柔一点",
        expressive: true,
      },
      fallbackVoiceId: "old_voice",
      emotion: "happy",
      instruct: "温柔一点",
    });
    expect(body).toEqual({
      text: "你好",
      mix: [
        { voiceId: A, weight: 0.5 },
        { voiceId: B, weight: 0.5 },
      ],
      rate: -10,
    });
  });

  it("单音色：voice / rate / pitch / expressive / emotion / instruct 照旧展开", () => {
    expect(
      buildTtsRequest({
        text: "你好",
        settings: { voiceId: "v2", mix: null, templateId: null, rate: 5, pitch: -2, instruct: "", expressive: false },
        emotion: "sad",
        instruct: " 慢一点 ",
      })
    ).toEqual({ text: "你好", voice: "v2", rate: 5, pitch: -2, expressive: false, emotion: "sad", instruct: "慢一点" });
  });

  it("voiceId 为空回落到 fallbackVoiceId；settings 为空 = 老行为（expressive true、不带 voice）", () => {
    expect(buildTtsRequest({ text: "x", settings: { voiceId: "", mix: null, templateId: null, rate: null, pitch: null, instruct: "", expressive: true }, fallbackVoiceId: "old" })).toEqual({
      text: "x",
      voice: "old",
      expressive: true,
    });
    expect(buildTtsRequest({ text: "x", settings: null })).toEqual({ text: "x", expressive: true });
    expect(buildTtsRequest({ text: "x", settings: undefined, emotion: "" })).toEqual({ text: "x", expressive: true });
  });
});

describe("serverHumanMessage", () => {
  it("VALIDATION_ERROR 带中文人话 → 原样透传", () => {
    const msg = "混音只支持豆包 1.0 音色（*_moon_bigtts / *_mars_bigtts），2.0（uranus）混不了";
    expect(serverHumanMessage({ code: "VALIDATION_ERROR", message: msg })).toBe(msg);
  });

  it("zod 的通用 Validation error / 其它错误码 / 空值 → null（交给 humanizeError）", () => {
    expect(serverHumanMessage({ code: "VALIDATION_ERROR", message: "Validation error" })).toBeNull();
    expect(serverHumanMessage({ code: "VALIDATION_ERROR", message: "" })).toBeNull();
    expect(serverHumanMessage({ code: "FORBIDDEN", message: "This voice template is private" })).toBeNull();
    expect(serverHumanMessage(null)).toBeNull();
    expect(serverHumanMessage(new Error("boom"))).toBeNull();
  });
});
