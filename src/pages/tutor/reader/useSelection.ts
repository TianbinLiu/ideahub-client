// 文字圈选（docs/02 3.17）：selectionchange 之后算出「在哪一页、圈了什么、短引是什么、在哪一块」，交给动作条。
// 手机上走系统的选择把手（长按拖拽），事件同样是 selectionchange；App 内嵌 WebView 的选择菜单等 M4。
import { useEffect, useState } from "react";
import { fold } from "../../../tutor/shared/materials/blocks.js";
import { quoteOf } from "./locate";
import type { Anchor, Page } from "../types";

export type ReaderSelection = { anchor: Anchor; text: string; rect: { top: number; left: number; width: number; height: number }; viewportRect: DOMRect };

export function useSelection(rootRef: React.RefObject<HTMLElement | null>, material: { short: string } | null, pages: Page[] | undefined) {
  const [sel, setSel] = useState<ReaderSelection | null>(null);
  useEffect(() => {
    let timer = 0;
    const compute = () => {
      const root = rootRef.current;
      const s = document.getSelection();
      if (!root || !material || !s || s.isCollapsed || s.rangeCount === 0) { setSel(null); return; }
      const range = s.getRangeAt(0);
      const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
      const pageEl = startEl?.closest<HTMLElement>("[data-page]");
      if (!pageEl || !root.contains(pageEl)) { setSel(null); return; }
      const text = s.toString();
      const quote = quoteOf(text);
      if (!quote) { setSel(null); return; }
      const page = Number(pageEl.dataset.page);
      // chunk：文字卡直接读 data-hash；PDF 用服务端块级文本里含这句的那一块
      let chunk = startEl?.closest<HTMLElement>("[data-hash]")?.dataset.hash;
      if (!chunk && pages) { const fq = fold(quote); chunk = pages.find((p) => p.idx === page)?.blocks.find((b) => fold(b.text).includes(fq))?.hash; }
      const vr = range.getBoundingClientRect();
      const rr = root.getBoundingClientRect();
      setSel({ anchor: { material: material.short, page, quote, ...(chunk ? { chunk } : {}) }, text: text.trim().slice(0, 1500), viewportRect: vr, rect: { top: vr.top - rr.top + root.scrollTop, left: vr.left - rr.left + root.scrollLeft, width: vr.width, height: vr.height } });
    };
    const onChange = () => { window.clearTimeout(timer); timer = window.setTimeout(compute, 180); };
    document.addEventListener("selectionchange", onChange);
    return () => { document.removeEventListener("selectionchange", onChange); window.clearTimeout(timer); };
  }, [rootRef, material, pages]);
  const clear = () => { document.getSelection()?.removeAllRanges(); setSel(null); };
  return { sel, clear };
}
