// PDF：pdf.js（legacy 构建，worker 线程）逐页 getTextContent → 与 Node 侧同一份 blocksFromPdfItems 切块（bbox 用 pdf.js 的坐标）。
import { blocksFromPdfItems, titleOf } from "../tutor/shared/materials/blocks.js";
import { loadPdfData } from "../pages/tutor/reader/pdf";

export async function extractPdfPages(buf: ArrayBuffer, onPage?: (page: number, pages: number) => void) {
  const doc = await loadPdfData(buf);
  const pages: { idx: number; title?: string; blocks: { text: string; bbox: number[]; fontSize: number }[] }[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const [, y0, , y1] = page.view;
      const blocks = blocksFromPdfItems(content.items as unknown[], y1 - y0);
      const title = titleOf(blocks);
      pages.push({ idx: i, ...(title ? { title } : {}), blocks });
      page.cleanup();
      onPage?.(i, doc.numPages);
    }
  } finally {
    // ★ PDFDocumentProxy 自己没有 destroy()：要停 worker 得经 loadingTask（否则每抽一份就多留一个 worker 线程）。
    await doc.loadingTask.destroy();
  }
  return pages;
}
