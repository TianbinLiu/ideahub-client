// PDF 阅读面：pdf.js canvas + 文字层，逐页懒渲染；文字层透明可选（圈选）、可 Range（老师的高亮与钉子）。docs/02 3.14。
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { loadPdf, TextLayer, type PDFDocumentProxy, type PDFPageProxy } from "./pdf";
import { clearHighlight, locateQuote, paintHighlight } from "./locate";
import type { HighlightResult, ReaderApi } from "./readerApi";
import type { Anchor, Page } from "../types";
import { TeacherPins, type Pin } from "./TeacherPin";

type Props = {
  url: string;
  /** 服务端的块级文本（有块 hash，圈选时按它定 chunk）；没有也能用 */
  pages?: Page[];
  pins: Pin[];
  scrollRef: React.RefObject<HTMLDivElement | null>;
  onReady?: (pageCount: number) => void;
  onError?: (message: string) => void;
};

const MAX_WIDTH = 920;

type PageState = { rendered: boolean; promise?: Promise<void> };

export const PdfDocumentView = forwardRef<ReaderApi, Props>(function PdfDocumentView({ url, pins, scrollRef, onReady, onError }, ref) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [fit, setFit] = useState<number | null>(null); // 按容器宽量出来的缩放；量好之前不画页
  const [pageSize, setPageSize] = useState<{ w: number; h: number } | null>(null);
  const [renderedTick, setRenderedTick] = useState(0);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const states = useRef(new Map<number, PageState>());
  const rootRef = useRef<HTMLDivElement>(null);

  // 装载
  useEffect(() => {
    const ctl = new AbortController();
    setDoc(null);
    states.current.clear();
    loadPdf(url, ctl.signal).then(async (d) => {
      if (ctl.signal.aborted) return;
      const p1 = await d.getPage(1);
      const vp = p1.getViewport({ scale: 1 });
      setPageSize({ w: vp.width, h: vp.height });
      setDoc(d);
    }).catch((e: unknown) => { if (!ctl.signal.aborted) onError?.(e instanceof Error ? e.message : String(e)); });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // 按容器宽度定缩放（最宽 920px；手机就是容器宽）
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !pageSize) return;
    const measure = () => setFit(Math.max(0.3, Math.min(el.clientWidth - 32, MAX_WIDTH) / pageSize.w));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [scrollRef, pageSize]);

  const scale = fit ?? 1;
  // 缩放定了 / 变了：全部页重画，并告诉宿主「可以来高亮了」（高亮的 Range 挂在文字层节点上，重画就得重找）
  useEffect(() => {
    if (!doc || fit === null) return;
    states.current.clear();
    setRenderedTick((x) => x + 1);
    onReady?.(doc.numPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, fit]);

  const renderPage = useCallback((n: number): Promise<void> => {
    const st = states.current.get(n);
    if (st?.promise) return st.promise;
    const el = pageEls.current.get(n);
    if (!doc || !el) return Promise.resolve();
    const holder: PageState = { rendered: false };
    holder.promise = (async () => {
      const page: PDFPageProxy = await doc.getPage(n);
      const viewport = page.getViewport({ scale });
      const canvas = el.querySelector("canvas")!;
      const textDiv = el.querySelector<HTMLDivElement>(".textLayer")!;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvas, canvasContext: ctx, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] }).promise;
      textDiv.replaceChildren();
      el.style.setProperty("--scale-factor", String(scale));
      el.style.setProperty("--total-scale-factor", String(scale)); // pdf.js 6 的 pdf_viewer.css 按它算 span 字号；少了它字号不跟页走
      const layer = new TextLayer({ textContentSource: page.streamTextContent(), container: textDiv, viewport });
      await layer.render();
      el.dataset.rendered = "1";
      holder.rendered = true;
      setRenderedTick((x) => x + 1);
    })();
    states.current.set(n, holder);
    return holder.promise;
  }, [doc, scale]);

  // 懒渲染：进入视口前 600px 就画
  useEffect(() => {
    if (!doc) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) void renderPage(Number((e.target as HTMLElement).dataset.page));
    }, { root: scrollRef.current, rootMargin: "600px 0px" });
    for (const el of pageEls.current.values()) io.observe(el);
    return () => io.disconnect();
  }, [doc, renderPage, scrollRef, renderedTick]);

  const jumpTo = useCallback((page: number) => {
    const el = pageEls.current.get(page);
    const root = scrollRef.current;
    if (!el || !root) return;
    root.scrollTo({ top: el.offsetTop - 12, behavior: "auto" });
  }, [scrollRef]);

  const highlight = useCallback(async (anchor: Anchor, name = "tutor-step"): Promise<HighlightResult> => {
    const el = pageEls.current.get(anchor.page);
    const root = scrollRef.current;
    if (!el || !root) return { found: false };
    await renderPage(anchor.page);
    const textDiv = el.querySelector<HTMLElement>(".textLayer");
    const hit = textDiv ? locateQuote(textDiv, anchor) : null;
    if (!hit) return { found: false };
    // ★ 先在同一帧里量出「那一行在页内的位置」，再滚动：Range 的矩形与页容器的矩形一起量，滚动前后坐标系才一致
    //   （第一版先 jumpTo 再量页容器，两个矩形差了一个滚动量，结果卷过头 1700px —— e2e 抓到）
    const pr = el.getBoundingClientRect();
    const lineTop = hit.bounding.top - pr.top;
    const lineLeft = hit.bounding.left - pr.left;
    paintHighlight(name, [{ range: hit.range, pageEl: el }]);
    const top = el.offsetTop + lineTop;
    root.scrollTo({ top: Math.max(0, top - 120), behavior: "auto" }); // 高亮那一行离视口顶 120px，下面留给旁注
    return { found: true, rect: { top, left: el.offsetLeft + lineLeft, width: hit.bounding.width, height: hit.bounding.height } };
  }, [renderPage, scrollRef]);

  useImperativeHandle(ref, () => ({ pageCount: doc?.numPages ?? 0, jumpTo, highlight, clear: (name = "tutor-step") => clearHighlight(name) }), [doc, jumpTo, highlight]);

  if (!doc || !pageSize || fit === null) return <div className="p-6 text-sm text-zinc-500">{t("reader.loadingPdf")}</div>;
  const w = pageSize.w * scale;
  const h = pageSize.h * scale;
  return (
    <div ref={rootRef} className="mx-auto flex flex-col items-center gap-4 py-4" data-testid="pdf-doc">
      {Array.from({ length: doc.numPages }, (_, i) => i + 1).map((n) => (
        <div
          key={n}
          data-page={n}
          data-testid={`reader-page-${n}`}
          ref={(el) => { if (el) pageEls.current.set(n, el); else pageEls.current.delete(n); }}
          className="pdfpage relative bg-white shadow-sm ring-1 ring-zinc-200"
          style={{ width: w, height: h }}
        >
          <canvas className="block" aria-label={t("reader.page", { n })} />
          <div className="textLayer" />
          <TeacherPins pageEl={pageEls.current.get(n) ?? null} pins={pins.filter((p) => p.anchor.page === n)} rendered={!!states.current.get(n)?.rendered} tick={renderedTick} />
          <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-zinc-400">{n}</div>
        </div>
      ))}
    </div>
  );
});
