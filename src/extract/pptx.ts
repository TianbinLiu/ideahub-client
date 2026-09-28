// PPTX：JSZip 解包 ppt/slides/slideN.xml，解析在 @tutor/pptx（与 Node 侧同一份）；一张幻灯一页，标题占位符当页标题（docs/05 §4.2）。
import JSZip from "jszip";
import { slideBlocksFromXml, slideFileOrder } from "../tutor/shared/materials/pptxXml.js";

export async function extractPptxPages(buf: ArrayBuffer) {
  const zip = await JSZip.loadAsync(buf);
  const pages: { idx: number; title?: string; blocks: { text: string }[] }[] = [];
  for (const [i, f] of slideFileOrder(Object.keys(zip.files)).entries()) {
    const xml = await zip.file(f)!.async("string");
    const { title, blocks } = slideBlocksFromXml(xml);
    pages.push({ idx: i + 1, ...(title ? { title } : {}), blocks });
  }
  return pages;
}
