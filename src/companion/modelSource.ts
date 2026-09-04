/**
 * @file modelSource.ts - 数字人该加载哪个 Live2D 模型（官方内置 vs 市场模型）
 * @category Utility
 *
 * 「用哪个 model3.json」这条规则只在这里实现一次：首页舞台（CompanionStage）按它加载，
 * 市场详情页按它展示地址。市场里的官方条目 `official-mascot` 的 modelJsonUrl 是空串 ——
 * 官方模型随网站一起打包（public/live2d/mascot/），不走服务器存储，所以空串要回落到本地路径。
 */

import type { CompanionSettings } from "../api";

/** 官方看板娘模型：随站点静态打包（见 docs/COMPANION.md「模型是怎么来的」） */
export const OFFICIAL_MODEL_URL = "/live2d/mascot/mascot.model3.json";

/** 服务端设置 → 舞台要加载的模型地址。settings 为空（游客 / 取设置失败）= 官方模型 */
export function resolveCompanionModelUrl(settings: Pick<CompanionSettings, "model"> | null | undefined): string {
  const url = settings?.model?.modelJsonUrl?.trim();
  return url || OFFICIAL_MODEL_URL;
}
