import { describe, expect, it } from "vitest";
import { ACTION_MOTIONS, ACTIONS, FACES, FACE_POSES, estimateSpeechMs, normalizeAction, normalizeFace } from "./protocol";

describe("companion protocol", () => {
  it("每个 face / action 都有映射，未知值回退默认", () => {
    for (const face of FACES) expect(FACE_POSES[face]).toBeTruthy();
    for (const action of ACTIONS) expect(action in ACTION_MOTIONS).toBe(true);
    expect(normalizeFace("banana")).toBe("normal");
    expect(normalizeAction(undefined)).toBe("none");
    expect(normalizeFace("tease")).toBe("tease");
  });

  it("合成说话时长有上下限", () => {
    expect(estimateSpeechMs("")).toBe(600);
    expect(estimateSpeechMs("好".repeat(500))).toBe(6000);
    expect(estimateSpeechMs("你好呀")).toBe(600);
    expect(estimateSpeechMs("好".repeat(10))).toBe(1100);
  });
});
