import { describe, expect, it } from "vitest";
import { filledWizardKeys, pickWizardStyle } from "./personaWizardStyle";

describe("pickWizardStyle", () => {
  it("生成结果缺的格补空值 —— 整体替换时空值也要发出去，旧角色的开场白 / 示例对话才会被清掉", () => {
    const out = pickWizardStyle({ summary: "s", catchphrases: [], stats: [], tone: "松弛" });
    expect(out).toEqual({ tone: "松弛", addressUser: "", greeting: "", examples: [], boundaries: [] });
    // 五个键一个都不能少：少一个，PATCH 语义下那一格就保留旧角色的值
    expect(Object.keys(out).sort()).toEqual(["addressUser", "boundaries", "examples", "greeting", "tone"]);
  });

  it("只取五格，不把 summary / catchphrases 这些老字段带进来（它们由表单自己发）", () => {
    const out = pickWizardStyle({ summary: "s", catchphrases: ["a"], stats: [], greeting: "嗨" }) as Record<string, unknown>;
    expect(out.summary).toBeUndefined();
    expect(out.catchphrases).toBeUndefined();
    expect(out.greeting).toBe("嗨");
  });

  it("undefined 也能用（生成接口没回 style 时）", () => {
    expect(pickWizardStyle(undefined)).toEqual({ tone: "", addressUser: "", greeting: "", examples: [], boundaries: [] });
  });
});

describe("filledWizardKeys", () => {
  it("只报有内容的格；纯空白字符串与空数组不算", () => {
    expect(
      filledWizardKeys({ summary: "", catchphrases: [], stats: [], tone: "  ", greeting: "来了", examples: [{ user: "在吗", reply: "在" }], boundaries: [] }),
    ).toEqual(["greeting", "examples"]);
  });

  it("老人格（没有这五格）与空值都回空数组 —— 编辑页就不出提示", () => {
    expect(filledWizardKeys({ summary: "s", catchphrases: [], stats: [] })).toEqual([]);
    expect(filledWizardKeys(undefined)).toEqual([]);
    expect(filledWizardKeys(null)).toEqual([]);
  });
});
