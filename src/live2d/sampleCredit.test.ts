import { describe, expect, it } from "vitest";
import { activeLive2dModelUrl, isLive2dSampleModel, LIVE2D_SAMPLE_CREDIT } from "./sampleCredit";
import { OFFICIAL_MODEL_URL } from "../companion/modelSource";

describe("isLive2dSampleModel", () => {
  it("全站挂件的默认地址（jsDelivr 上的 CubismWebSamples/Hiyori）认得出来", () => {
    expect(
      isLive2dSampleModel("https://fastly.jsdelivr.net/gh/Live2D/CubismWebSamples/Samples/Resources/Hiyori/Hiyori.model3.json"),
    ).toBe(true);
  });

  it("示例包被下载下来再传到我们自己的服务器（地址里已经没有 CubismWebSamples）也认得出来", () => {
    expect(isLive2dSampleModel("https://api.ideahubs.org/uploads/live2d-models/u1/pkg/Natori/Natori.model3.json")).toBe(true);
    expect(isLive2dSampleModel("/uploads/live2d-models/u1/pkg/hiyori_pro_zh/runtime/hiyori_pro_t11.model3.json")).toBe(true);
    expect(isLive2dSampleModel("https://cdn.example.com/models/mao_pro/mao_pro.model3.json")).toBe(true);
  });

  it("Cubism 2 的示例：名字后面带版本号、或者来自 npm 上 live2d-widget-model-* 镜像，也认得出来", () => {
    expect(
      isLive2dSampleModel("https://cdn.jsdelivr.net/npm/live2d-widget-model-epsilon2_1@1.0.5/assets/Epsilon2.1.model.json"),
    ).toBe(true);
    expect(isLive2dSampleModel("/uploads/live2d-models/u1/pkg/epsilon2_1/Epsilon2.1.model.json")).toBe(true);
    expect(isLive2dSampleModel("https://cdn.jsdelivr.net/npm/live2d-widget-model-hijiki@1.0.5/assets/hijiki.model.json")).toBe(true);
    expect(isLive2dSampleModel("https://cdn.example.com/izumi/izumi.model.json")).toBe(true);
    expect(isLive2dSampleModel("https://cdn.example.com/shizuku/shizuku.model.json")).toBe(true);
  });

  it("我们自己的看板娘与普通自制模型不误认", () => {
    expect(isLive2dSampleModel("/live2d/mascot/mascot.model3.json")).toBe(false);
    expect(isLive2dSampleModel("https://api.ideahubs.org/uploads/live2d-market/u1/abc/my-girl.model3.json")).toBe(false);
    // 名字里**含**示例名但第一段不是它 —— 不认（markdown ≠ mark，haruka ≠ haru）
    expect(isLive2dSampleModel("https://cdn.example.com/markdown/haruka.model3.json")).toBe(false);
  });

  it("空值不认", () => {
    expect(isLive2dSampleModel("")).toBe(false);
    expect(isLive2dSampleModel(null)).toBe(false);
    expect(isLive2dSampleModel(undefined)).toBe(false);
  });
});

describe("LIVE2D_SAMPLE_CREDIT", () => {
  it("是现行条款（Sample Data Terms v1.7，2026-01-29）的长版原文，一个字都不能改", () => {
    expect(LIVE2D_SAMPLE_CREDIT).toBe(
      "This content uses sample data owned and copyrighted by Live2D Inc. The sample data are utilized in accordance with terms and conditions set by Live2D Inc. This content itself is created at the author's sole discretion.",
    );
  });
});

describe("activeLive2dModelUrl", () => {
  it("远程地址留空 = 官方看板娘小梦（游客默认、服务端没存过地址的用户都走这条）", () => {
    expect(activeLive2dModelUrl({ source: "remote", modelJsonUrl: "", uploadedModelJsonUrl: "" })).toBe(OFFICIAL_MODEL_URL);
    expect(activeLive2dModelUrl({ source: "remote", modelJsonUrl: "   ", uploadedModelJsonUrl: "" })).toBe(OFFICIAL_MODEL_URL);
    // 默认模型不能是 Live2D 官方示例（2026-09-18 起），也就不该挂示例声明
    expect(isLive2dSampleModel(OFFICIAL_MODEL_URL)).toBe(false);
  });

  it("填了远程地址就用它；选了上传且传成功了就用上传的；选了上传但还没传成功退回远程", () => {
    expect(activeLive2dModelUrl({ source: "remote", modelJsonUrl: "https://x.com/a.model3.json", uploadedModelJsonUrl: "/u/b.model3.json" })).toBe("https://x.com/a.model3.json");
    expect(activeLive2dModelUrl({ source: "uploaded", modelJsonUrl: "https://x.com/a.model3.json", uploadedModelJsonUrl: "/u/b.model3.json" })).toBe("/u/b.model3.json");
    expect(activeLive2dModelUrl({ source: "uploaded", modelJsonUrl: "", uploadedModelJsonUrl: "" })).toBe(OFFICIAL_MODEL_URL);
  });
});
