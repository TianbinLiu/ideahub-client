// 在一页的 DOM（pdf.js 文字层 / 文字卡）里按短引找 Range，并画高亮（docs/05 §5.6「锚点怎么落到页面上」）。
// ★ 查找忽略空白（与 src/materials/blocks.js 的 fold 同口径）：文字层里一句话被切成很多 span，中间的空格 / 换行与抽出的文本不一致是常态。
// ★ 首选 CSS Custom Highlight API（不改 DOM、不打断选择）；不支持的浏览器退化成绝对定位的覆盖块 .hl-rect。
import { fold } from "../../../tutor/shared/materials/blocks.js";
import type { Anchor } from "../types";

export type Located = { range: Range; rects: DOMRect[]; bounding: DOMRect };

/** 把容器里所有文本节点拼成一串「折叠后」的字符，并记住每个字符来自哪个节点的哪个偏移。 */
function foldedMap(container: HTMLElement) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const chars: string[] = [];
  const at: { node: Text; offset: number }[] = [];
  for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) {
    const data = n.data;
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      if (/\s/.test(ch)) continue;
      chars.push(ch.normalize("NFC"));
      at.push({ node: n, offset: i });
    }
  }
  return { folded: chars.join(""), at };
}

/**
 * 在容器里找短引。有 chunk 时先在 `[data-hash=chunk]` 的块里找（文字卡），找不到再整页找；取第一处命中（与服务端 locateQuoteInPages 一致）。
 */
export function locateQuote(container: HTMLElement, anchor: Pick<Anchor, "quote" | "chunk">): Located | null {
  const q = fold(anchor.quote);
  if (!q) return null;
  const scopes: HTMLElement[] = [];
  if (anchor.chunk) { const b = container.querySelector<HTMLElement>(`[data-hash="${anchor.chunk}"]`); if (b) scopes.push(b); }
  scopes.push(container);
  for (const scope of scopes) {
    const { folded, at } = foldedMap(scope);
    const i = folded.indexOf(q);
    if (i < 0) continue;
    const s = at[i];
    const e = at[i + q.length - 1];
    const range = document.createRange();
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset + 1);
    return { range, rects: [...range.getClientRects()], bounding: range.getBoundingClientRect() };
  }
  return null;
}

type HighlightCtor = new (...ranges: Range[]) => { add(r: Range): void; clear(): void };
const hlApi = (): { set: Map<string, unknown>; Highlight: HighlightCtor } | null => {
  const w = window as unknown as { CSS?: { highlights?: Map<string, unknown> }; Highlight?: HighlightCtor };
  return w.CSS?.highlights && typeof w.Highlight === "function" ? { set: w.CSS.highlights, Highlight: w.Highlight } : null;
};
export const supportsHighlightApi = () => !!hlApi();

/** 给一组 Range 上名字为 name 的高亮；不支持 Highlight API 时在各自的页容器里画覆盖块。 */
export function paintHighlight(name: string, items: { range: Range; pageEl: HTMLElement }[]) {
  clearHighlight(name);
  const api = hlApi();
  if (api) {
    if (items.length) api.set.set(name, new api.Highlight(...items.map((x) => x.range)));
    return;
  }
  for (const { range, pageEl } of items) {
    const pr = pageEl.getBoundingClientRect();
    for (const r of range.getClientRects()) {
      const d = document.createElement("div");
      d.className = "hl-rect";
      d.dataset.hl = name;
      d.style.left = `${r.left - pr.left}px`;
      d.style.top = `${r.top - pr.top}px`;
      d.style.width = `${r.width}px`;
      d.style.height = `${r.height}px`;
      pageEl.appendChild(d);
    }
  }
}

export function clearHighlight(name: string) {
  const api = hlApi();
  if (api) api.set.delete(name);
  for (const el of document.querySelectorAll(`.hl-rect[data-hl="${name}"]`)) el.remove();
}

/** 取一段选中文字的 ≤ 40 字短引（格式 1.1 的上限，docs/03 §4.7）：折叠多余空白后从头截。 */
export const QUOTE_MAX = 40;
export function quoteOf(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= QUOTE_MAX ? t : t.slice(0, QUOTE_MAX).trim();
}
