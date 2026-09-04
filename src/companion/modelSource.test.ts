import { describe, expect, it } from "vitest";
import { OFFICIAL_MODEL_URL, resolveCompanionModelUrl } from "./modelSource";

describe("resolveCompanionModelUrl", () => {
  it("游客 / 取不到设置 → 官方模型", () => {
    expect(resolveCompanionModelUrl(null)).toBe(OFFICIAL_MODEL_URL);
    expect(resolveCompanionModelUrl(undefined)).toBe(OFFICIAL_MODEL_URL);
    expect(resolveCompanionModelUrl({ model: null })).toBe(OFFICIAL_MODEL_URL);
  });

  it("官方条目的 modelJsonUrl 是空串 → 回落到本地打包的模型", () => {
    expect(resolveCompanionModelUrl({ model: { modelJsonUrl: "" } as never })).toBe(OFFICIAL_MODEL_URL);
    expect(resolveCompanionModelUrl({ model: { modelJsonUrl: "   " } as never })).toBe(OFFICIAL_MODEL_URL);
  });

  it("市场模型 → 用它的 model3.json 地址", () => {
    expect(resolveCompanionModelUrl({ model: { modelJsonUrl: "https://cdn/x.model3.json" } as never })).toBe(
      "https://cdn/x.model3.json"
    );
  });
});
