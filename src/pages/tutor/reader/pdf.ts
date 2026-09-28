// pdf.js 装载（懒加载 chunk + worker 线程，tutor 仓 docs/05 §4.2）。只在这里 import pdfjs-dist，别的组件经 loadPdf() 拿。
// ★ worker 经 Vite ?url 打进 /assets（同源）：官网 CSP 的 worker-src 只有 'self' blob:，CDN 上的 worker 会被拦。tutor 仓那份传过 isEvalSupported:false，pdfjs-dist 6 已经没有这个选项（5.x 起 PostScript 函数不再用 new Function 编译，整个包里一处 eval 都没有，2026-09-28 grep 过 legacy 构建），所以官网 script-src 不用放 'unsafe-eval'。
// ★ 用 legacy 构建：现代构建依赖 Map.prototype.getOrInsertComputed 这类 2025 年才落地的 API，稍旧的浏览器 / WebView 上一页都画不出且只在控制台报错。
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { getToken } from "../../../auth";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
export const { TextLayer } = pdfjs;

export function loadPdf(url: string, signal?: AbortSignal): Promise<PDFDocumentProxy> {
  // ★ 官网的 GET /api/tutor/materials/:sha/file 在 requireAuth 后面（302 到 5 分钟的签名地址）：pdf.js 自己发的 fetch 不带我们的 Bearer，
  //   得经 httpHeaders 塞进去，否则真服务器上阅读面永远是 401、退化成老师面板念。跨源 302 时浏览器按 Fetch 规范剥掉 Authorization，
  //   token 不会跟到文件存储那头；范围请求每一发都先过这一跳再跳转。tutor 仓的参考实现不鉴权，e2e 验不到这一行 —— 改它之前先在真服务器上开一份 PDF。
  const token = getToken();
  const task = pdfjs.getDocument({ url, withCredentials: false, ...(token ? { httpHeaders: { Authorization: `Bearer ${token}` } } : {}) });
  signal?.addEventListener("abort", () => { void task.destroy(); });
  return task.promise;
}

/** 从内存字节装（浏览器端抽文本用；阅读面走 url） */
export function loadPdfData(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) }).promise;
}
