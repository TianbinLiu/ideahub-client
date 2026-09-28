// DOCX：mammoth 浏览器构建 → 纯文本 → 段落切块（一份文件一页；标题层级 M2 再分节）。
import mammoth from "mammoth";
import { paragraphsToBlocks } from "../tutor/shared/materials/blocks.js";

export async function extractDocxPages(buf: ArrayBuffer) {
  const r = await mammoth.extractRawText({ arrayBuffer: buf });
  const warnings = (r.messages || []).filter((m) => m.type === "warning").map((m) => `docx：${m.message}`);
  return { pages: [{ idx: 1, blocks: paragraphsToBlocks(r.value) }], warnings };
}
