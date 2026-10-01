// 浏览器端抽文本（docs/05 §4.2、docs/02 1.6 / 1.12）：pdf.js / JSZip / mammoth 都在浏览器里跑，服务端只收 pages + 私有原件（D3：零解析依赖进 400M 进程）。
// 切块与块 hash 与 Node 侧共用 ../src/materials/blocks.js（@tutor/blocks），所以同一份文件浏览器抽与服务端抽逐块 hash 相同 —— 锚点才钉得回去。
import { blocksFromPdfItems, hashPages, paragraphsToBlocks, titleOf, pagesToText, fold } from "../tutor/shared/materials/blocks.js";
import type { Page } from "../pages/tutor/types";

export type Extracted = { sha256: string; name: string; ext: string; mime: string; bytes: number; pages: Page[]; chars: number; text: string; warnings: string[] };
export const SUPPORTED_EXTS = [".pdf", ".pptx", ".docx", ".md", ".txt"];
/** 一页 / 一张幻灯片平均少于这么多字就当「没有文字层」（与 Node 侧 extract.js 的 MIN_CHARS_PER_PAGE 同值） */
export const MIN_CHARS_PER_PAGE = 20;
/** 总字数上限（docs/05 §4.2：一本厚教材；超过让用户拆文件） */
export const MAX_TOTAL_CHARS = 2_000_000;

export const extOf = (name: string) => { const m = /\.[a-z0-9]+$/i.exec(name); return m ? m[0].toLowerCase() : ""; };
export const isSupported = (name: string) => SUPPORTED_EXTS.includes(extOf(name));

export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type ExtractProgress = { step: "hash" | "parse" | "blocks" | "done"; page?: number; pages?: number };

export async function extractFile(file: File, onProgress?: (p: ExtractProgress) => void): Promise<Extracted> {
  const ext = extOf(file.name);
  if (!isSupported(file.name)) throw new Error(`只收 ${SUPPORTED_EXTS.join(" / ")}，这是「${ext || "?"}」`);
  const buf = await file.arrayBuffer();
  onProgress?.({ step: "hash" });
  const sha256 = await sha256Hex(buf);
  onProgress?.({ step: "parse" });
  let raw: { idx: number; title?: string; blocks: { text: string; bbox?: number[]; fontSize?: number }[] }[];
  const warnings: string[] = [];
  // ★ 三个解析器按格式动态 import：pdf.js / JSZip / mammoth 合起来比整个阅读面还大，阅读面与首页不该为它们付一次下载（docs/05 §4.2「懒加载 chunk」）。
  if (ext === ".pdf") raw = await (await import("./pdf")).extractPdfPages(buf, (page, pages) => onProgress?.({ step: "parse", page, pages }));
  else if (ext === ".pptx") raw = await (await import("./pptx")).extractPptxPages(buf);
  else if (ext === ".docx") { const r = await (await import("./docx")).extractDocxPages(buf); raw = r.pages; warnings.push(...r.warnings); }
  else raw = [{ idx: 1, blocks: paragraphsToBlocks(new TextDecoder("utf-8").decode(buf)) }];
  onProgress?.({ step: "blocks" });
  const pages = (await hashPages(raw)) as Page[];
  const text = pagesToText(pages);
  const chars = fold(text).length;
  if (pages.length > 0 && chars < MIN_CHARS_PER_PAGE * pages.length && ext !== ".md" && ext !== ".txt") warnings.push(`这份文件 ${pages.length} 页只抽出 ${chars} 个字：多半没有文字层（扫描件 / 全是图片）。v1 不做 OCR，请换一份带文字层的版本，或把内容另存成 txt / md`);
  if (chars > MAX_TOTAL_CHARS) throw new Error(`这份文件抽出 ${chars} 字，超过单文件 ${MAX_TOTAL_CHARS} 字上限，请拆成几份再传`);
  onProgress?.({ step: "done", pages: pages.length });
  return { sha256, name: file.name, ext, mime: file.type || mimeOf(ext), bytes: buf.byteLength, pages, chars, text, warnings };
}

export function mimeOf(ext: string) {
  return { ".pdf": "application/pdf", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".md": "text/markdown", ".txt": "text/plain" }[ext] || "application/octet-stream";
}

export { blocksFromPdfItems, titleOf };
