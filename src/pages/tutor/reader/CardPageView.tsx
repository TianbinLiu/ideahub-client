// 文字卡阅读面（PPTX / DOCX / MD / TXT，docs/02 1.13 / docs/08 #20）：一页一张卡，块带 data-hash（圈选时直接拿到 chunk）；页面明说「要看原版式请导出 PDF」。
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { clearHighlight, locateQuote, paintHighlight } from "./locate";
import type { HighlightResult, ReaderApi } from "./readerApi";
import type { Anchor, Page } from "../types";
import { TeacherPins, type Pin } from "./TeacherPin";

type Props = { pages: Page[]; ext: string; pins: Pin[]; scrollRef: React.RefObject<HTMLDivElement | null> };

// ★ 一页一个组件、元素走 callback ref 进 state：TeacherPins 要在这一页挂到 DOM 之后才量得出每颗钉子的 y。
//   原来在父组件渲染里读 pageEls.current.get(idx)：首帧恒 undefined，钉子要等别的原因触发的重渲染才出现（react-hooks/refs 拦的就是这种读法）。
function CardPage({ p, pins, register }: { p: Page; pins: Pin[]; register: (idx: number, el: HTMLDivElement | null) => void }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => { setEl(node); register(p.idx, node); }, [p.idx, register]);
  return (
    <div data-page={p.idx} data-testid={`reader-page-${p.idx}`} ref={attach} className="cardpage relative rounded-lg bg-white p-6 shadow-sm ring-1 ring-zinc-200">
      {p.title && <h2 className="mb-3 text-lg font-semibold">{p.title}</h2>}
      {p.blocks.map((b) => (b.text === p.title ? null : <p key={b.hash} data-hash={b.hash} className="mb-3 whitespace-pre-wrap text-[15px] leading-7 text-zinc-800">{b.text}</p>))}
      <TeacherPins pageEl={el} pins={pins} rendered tick={0} />
      <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-zinc-400">{p.idx}</div>
    </div>
  );
}

export const CardPageView = forwardRef<ReaderApi, Props>(function CardPageView({ pages, ext, pins, scrollRef }, ref) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const register = useCallback((idx: number, el: HTMLDivElement | null) => { if (el) pageEls.current.set(idx, el); else pageEls.current.delete(idx); }, []);

  const jumpTo = useCallback((page: number) => {
    const el = pageEls.current.get(page);
    const root = scrollRef.current;
    if (el && root) root.scrollTo({ top: el.offsetTop - 12, behavior: "auto" });
  }, [scrollRef]);

  const highlight = useCallback(async (anchor: Anchor, name = "tutor-step"): Promise<HighlightResult> => {
    const el = pageEls.current.get(anchor.page);
    const root = scrollRef.current;
    if (!el || !root) return { found: false };
    const hit = locateQuote(el, anchor);
    if (!hit) return { found: false };
    paintHighlight(name, [{ range: hit.range, pageEl: el }]);
    const pr = el.getBoundingClientRect();
    const top = el.offsetTop + (hit.bounding.top - pr.top);
    root.scrollTo({ top: Math.max(0, top - 120), behavior: "auto" });
    return { found: true, rect: { top, left: el.offsetLeft + (hit.bounding.left - pr.left), width: hit.bounding.width, height: hit.bounding.height } };
  }, [scrollRef]);

  useImperativeHandle(ref, () => ({ pageCount: pages.length, jumpTo, highlight, clear: (name = "tutor-step") => clearHighlight(name) }), [pages.length, jumpTo, highlight]);

  return (
    <div className="mx-auto flex max-w-[920px] flex-col gap-4 px-4 py-4" data-testid="card-doc">
      {ext === ".pptx" && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">{t("reader.pptxHint")}</p>}
      {pages.map((p) => <CardPage key={p.idx} p={p} pins={pins.filter((x) => x.anchor.page === p.idx)} register={register} />)}
    </div>
  );
});
