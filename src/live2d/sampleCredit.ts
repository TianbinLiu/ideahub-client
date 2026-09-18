// Live2D 官方示例模型的版权声明 —— **全站唯一一份**（右下角挂件与 Live2D 设置页共用，铁律六）。
//
// ★★ 为什么必须有（2026-09-18 核查抓到）：全站挂件 SiteLive2D 与服务端组件设置的默认模型，
//   都是 Live2D 官方 CubismWebSamples 里的 Hiyori；按 Live2D 示例数据的使用条款，用到示例数据的地方
//   必须带下面这句声明，而官网全仓此前**一处都没有**。
// ⚠ 声明原文**逐字照抄、不翻译**：它是条款要求的固定文本，改一个词就不再是那句声明了。
//   界面上要解释它时另写一句本地化的说明，原文照放。
export const LIVE2D_SAMPLE_CREDIT =
  "This content uses sample data owned and copyrighted by Live2D Inc. " +
  "The sample data are utilized in accordance with terms and conditions set by Live2D Inc.";

/** Live2D 官方发布示例数据的两个仓库（Web 版与 Native 版） */
const SAMPLE_REPO = /\/Live2D\/Cubism(?:Web|Native)Samples\//i;

/**
 * 官方示例模型的名字（Cubism 3~5 的 Web/Native 示例 + Cubism 2 时代的示例）。
 * 按**目录名或文件名的第一段**比（`Hiyori/Hiyori.model3.json`、`hiyori_pro_zh/…`、`natori_pro_t06` 都认）——
 * 用户把示例包下载下来再传到我们自己的服务器，地址里就没有 CubismWebSamples 了，只剩名字。
 * ★ 宁可多认也别漏认：多认的代价是一个自制模型碰巧叫 `mark/` 时多显示一句声明；
 *   漏认的代价是示例数据在站上露出却没有声明。
 */
const SAMPLE_NAMES = new Set([
  "hiyori", "haru", "mao", "mark", "natori", "rice", "wanko", "ren",
  "shizuku", "epsilon", "hibiki", "koharu", "haruto", "chitose",
]);

/** 这个模型地址指的是不是 Live2D 官方示例（是 → 露出的地方必须带 LIVE2D_SAMPLE_CREDIT） */
export function isLive2dSampleModel(url: string | null | undefined): boolean {
  if (!url) return false;
  if (SAMPLE_REPO.test(url)) return true;
  let path = url;
  try {
    path = new URL(url, "https://placeholder.invalid").pathname;
  } catch {
    // 不是合法 URL 就按原样当路径看
  }
  return path
    .split("/")
    .filter(Boolean)
    .some((seg) => SAMPLE_NAMES.has(decodeSegment(seg).toLowerCase().split(/[._-]/)[0]));
}

function decodeSegment(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * 挂件此刻显示的是哪个模型地址 —— **唯一实现**（SiteLive2D 启动挂件、设置页判断要不要提示声明，都问这一句）。
 * 选了「上传的包」但还没传成功时退回远程地址，与挂件实际加载的那个一致。
 */
export function activeLive2dModelUrl(s: { source: string; modelJsonUrl: string; uploadedModelJsonUrl: string }): string {
  return s.source === "uploaded" && s.uploadedModelJsonUrl ? s.uploadedModelJsonUrl : s.modelJsonUrl;
}
