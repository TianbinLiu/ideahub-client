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
  // ★ 官网的 GET /api/tutor/materials/:sha/file 在 requireAuth 后面（服务端把签名下载的字节流式转发过来，不 302 —— 理由在
  //   server tutorFile.service 头部）：pdf.js 自己发的 fetch 不带我们的 Bearer，得经 httpHeaders 塞进去，否则真服务器上阅读面
  //   永远是 401、退化成老师面板念；范围请求每一发都带同一份头。tutor 仓的参考实现开 --fake-auth 时这条路同样要 Bearer，
  //   e2e:client 的阅读面能画出第 1 页就是这一行在起作用；真 Cloudinary 那半（服务端取回）要在真服务器上验（tutor 仓 npm run e2e:real）。
  const token = getToken();
  const task = pdfjs.getDocument({ url, withCredentials: false, ...(token ? { httpHeaders: { Authorization: `Bearer ${token}` } } : {}) });
  signal?.addEventListener("abort", () => { void task.destroy(); });
  return task.promise;
}

/** 从内存字节装（浏览器端抽文本用；阅读面走 url） */
export function loadPdfData(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  return pdfjs.getDocument({ data: data instanceof Uint8Array ? data : new Uint8Array(data) }).promise;
}
