import { describe, expect, it } from "vitest";
import { contextPercent, contextTone, formatTokens, isLegacyChatRejection } from "./chatContext";

describe("formatTokens", () => {
  it("千以下原样，一万以下留一位小数，再大取整", () => {
    expect(formatTokens(850)).toBe("850");
    expect(formatTokens(1234)).toBe("1.2k");
    expect(formatTokens(2000)).toBe("2k");
    expect(formatTokens(32000)).toBe("32k");
    expect(formatTokens(-5)).toBe("0");
  });
});

describe("contextPercent", () => {
  it("按 used / budget 取整，封顶 100，没有数据是 0", () => {
    expect(contextPercent({ used: 8000, budget: 32000, ratio: 0.25, level: "ok" })).toBe(25);
    expect(contextPercent({ used: 40000, budget: 32000, ratio: 1.25, level: "compact" })).toBe(100);
    expect(contextPercent(null)).toBe(0);
    expect(contextPercent({ used: 10, budget: 0, ratio: 0, level: "ok" })).toBe(0);
  });
});

describe("contextTone", () => {
  it("四档颜色各不相同，未知档按 ok", () => {
    const tones = (["ok", "warn", "compact", "full"] as const).map((l) => contextTone(l).stroke);
    expect(new Set(tones).size).toBe(4);
    expect(contextTone(undefined)).toEqual(contextTone("ok"));
  });
});

describe("isLegacyChatRejection", () => {
  it("老服务端抱怨缺 messages → 退回旧写法", () => {
    const err = Object.assign(new Error("invalid messages"), {
      status: 400,
      code: "VALIDATION_ERROR",
      details: [{ code: "invalid_type", path: ["messages"], message: "Invalid input: expected array, received undefined" }],
    });
    expect(isLegacyChatRejection(err)).toBe(true);
  });

  it("新服务端的 refine 错误、别的 400、别的状态码都不算", () => {
    const refine = Object.assign(new Error("invalid messages"), { status: 400, code: "VALIDATION_ERROR", details: [{ code: "custom", path: [], message: "send either message or messages[]" }] });
    expect(isLegacyChatRejection(refine)).toBe(false);
    expect(isLegacyChatRejection(Object.assign(new Error("x"), { status: 404, code: "CHAT_THREAD_NOT_FOUND" }))).toBe(false);
    expect(isLegacyChatRejection(Object.assign(new Error("x"), { status: 400, code: "VALIDATION_ERROR" }))).toBe(false);
    expect(isLegacyChatRejection(null)).toBe(false);
  });
});
