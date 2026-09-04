import { describe, expect, it } from "vitest";
import { live2dUploadErrorKey } from "./live2dUploadError";

describe("live2dUploadErrorKey", () => {
  it("识别 Cubism 2 旧格式（即使原文顺带提到 model json）", () => {
    expect(live2dUploadErrorKey("Cubism 2 model (.moc) is not supported; model json refers to .moc")).toBe(
      "live2dMarket.errors.cubism2"
    );
  });

  it("识别缺 model3.json / 缺 moc3 / 缺贴图 / 包太大", () => {
    expect(live2dUploadErrorKey("No Live2D model json found in bundle")).toBe("live2dMarket.errors.noModelJson");
    expect(live2dUploadErrorKey("Referenced moc3 file is missing: a.moc3")).toBe("live2dMarket.errors.mocMissing");
    expect(live2dUploadErrorKey("Referenced texture is missing: tex.png")).toBe("live2dMarket.errors.textureMissing");
    expect(live2dUploadErrorKey("Bundle contains too many files")).toBe("live2dMarket.errors.tooBig");
    expect(live2dUploadErrorKey("Bundle expands to too much data")).toBe("live2dMarket.errors.tooBig");
  });

  it("不认识的报错返回 null（调用方回退到原文）", () => {
    expect(live2dUploadErrorKey("Rate limit exceeded")).toBeNull();
    expect(live2dUploadErrorKey("")).toBeNull();
    expect(live2dUploadErrorKey(undefined)).toBeNull();
  });
});
