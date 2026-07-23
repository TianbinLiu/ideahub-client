/**
 * @file ocrImage.ts - 浏览器端图片 OCR（tesseract.js，中文简体+英文）。
 *
 * 供「发言截图 → AI 生成人格」用：截图在【用户浏览器里】转文字，再把纯文本喂给
 * 服务端的 DeepSeek（文本模型，不支持图片）。选择浏览器端 OCR 而非服务端视觉模型
 * 是产品决策：零服务器成本、零新依赖、截图不出用户设备（隐私）。
 *
 * ★worker / core wasm / 语言包全部走本站静态资源（public/tesseract、public/tessdata），
 *   不依赖 jsdelivr 等 CDN —— 大陆用户访问不稳。资源约 6.4MB，只在首次 OCR 时按需加载。
 * ★tesseract.js 走动态 import：不用 OCR 的用户一个字节都不多载。
 *
 * ★★失败路径必须自己兜（评审实锤，勿删）：tesseract.js v7 的 createWorker 在
 *   loadLanguage/initialize 阶段失败（比如语言包 404、部署漏了 public/ 资源）时，
 *   返回的 promise【永不 settle】——错误只会送进 options.errorHandler。
 *   所以这里用 errorHandler 转 reject + 超时双保险来竞速，否则调用方 await 会永久挂起、
 *   编辑器的导入面板卡死在「识别中」直到刷新。
 */

export type OcrProgress = (progress: number) => void;

/** OCR 引擎加载兜底超时：资源 ~6.4MB，慢网 60s 拿不下来就该报错而不是干等 */
const ENGINE_LOAD_TIMEOUT_MS = 60_000;

/** 识别一张图片，返回纯文本。onProgress 收 0~1（只在识别阶段回调，加载阶段不计）。 */
export async function ocrImageToText(file: File | Blob, onProgress?: OcrProgress): Promise<string> {
  const { createWorker } = await import("tesseract.js");

  let failEngine!: (err: Error) => void;
  const engineFailed = new Promise<never>((_, reject) => {
    failEngine = reject;
  });

  const workerPromise = createWorker(["chi_sim", "eng"], 1, {
    workerPath: "/tesseract/worker.min.js",
    corePath: "/tesseract/tesseract-core-simd-lstm.wasm.js",
    langPath: "/tessdata",
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) onProgress(m.progress ?? 0);
    },
    // v7：loadLanguage/initialize 失败只会到这里（promise 不 reject），必须转成显式失败
    errorHandler: (err: unknown) => {
      failEngine(new Error(`OCR 引擎加载失败：${err instanceof Error ? err.message : String(err)}`));
    },
  });

  // 竞速输掉后 workerPromise 仍可能晚点 resolve —— 把那只已经 spawn 的 worker 收尸，别泄漏
  const killLateWorker = () => {
    workerPromise.then((w) => w.terminate()).catch(() => {});
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("OCR 引擎加载超时，请检查网络后重试")), ENGINE_LOAD_TIMEOUT_MS);
  });

  let worker: Awaited<typeof workerPromise>;
  try {
    worker = await Promise.race([workerPromise, engineFailed, timeout]);
  } catch (err) {
    killLateWorker();
    throw err;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }

  try {
    const { data } = await worker.recognize(file);
    return (data.text || "").trim();
  } finally {
    await worker.terminate();
  }
}
