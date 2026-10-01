// 老师的钉子（docs/02 3.18）：④ 里带锚点的必背 / 易错点按页渲染成行间小标记，默认收起，点开就地展开；每页 ≤ PINS_PER_PAGE 处，其余进「本页更多」。
// 没有第二张表：钉子就是 TutorDoc.distill（docs/05 §5.6）。位置：页渲染好之后按短引找到那一行的 y，钉在页右缘。
import { useLayoutEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookmarkCheck, TriangleAlert } from "lucide-react";
import { locateQuote } from "./locate";
import type { Anchor } from "../types";

export type Pin = { kind: "memo" | "pitfall"; text: string; anchor: Anchor; stage_id: string };
/** 初值 3，先量再定（docs/02 3.18） */
export const PINS_PER_PAGE = 3;

export function TeacherPins({ pageEl, pins, rendered, tick }: { pageEl: HTMLElement | null; pins: Pin[]; rendered: boolean; tick: number }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [pos, setPos] = useState<Record<number, number>>({});
  // ★ useLayoutEffect 不是 useEffect：位置是量 DOM 量出来的（外部系统），用 useEffect 会先按兜底位置画一帧再跳到量出来的 y。
  useLayoutEffect(() => {
    if (!pageEl || !rendered) return;
    const container = pageEl.querySelector<HTMLElement>(".textLayer") || pageEl;
    const pr = pageEl.getBoundingClientRect();
    const next: Record<number, number> = {};
    pins.forEach((p, i) => { const hit = locateQuote(container, p.anchor); if (hit) next[i] = hit.bounding.top - pr.top; });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 量的是 DOM（外部系统）：钉子的 y 只有页渲染完才知道，没有比"量完 set 一次"更少一层的写法；deps 不含 pos，不会级联
    setPos(next);
  }, [pageEl, pins, rendered, tick]);
  if (!pins.length || !rendered) return null;
  const shown = pins.slice(0, PINS_PER_PAGE);
  const more = pins.slice(PINS_PER_PAGE);
  return (
    <>
      {shown.map((p, i) => (
        <details key={i} className="group absolute right-1 z-20" style={{ top: Math.max(0, (pos[i] ?? 8 + i * 28) - 4) }} data-testid="teacher-pin">
          <summary className={`flex h-6 w-6 cursor-pointer list-none items-center justify-center rounded-full text-white shadow ${p.kind === "memo" ? "bg-cyan-600" : "bg-amber-500"}`} title={p.kind === "memo" ? t("reader.pinMemo") : t("reader.pinPitfall")}>
            {p.kind === "memo" ? <BookmarkCheck size={13} /> : <TriangleAlert size={13} />}
          </summary>
          <div className="absolute right-0 top-7 w-64 rounded-md border border-zinc-200 bg-white p-2 text-xs leading-5 text-zinc-800 shadow-lg">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">{p.kind === "memo" ? t("reader.pinMemo") : t("reader.pinPitfall")} · {p.stage_id}</div>
            {p.text}
          </div>
        </details>
      ))}
      {more.length > 0 && (
        <details className="absolute bottom-6 right-1 z-20">
          <summary className="cursor-pointer list-none rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] text-white shadow">{t("reader.pinsMore", { n: more.length })}</summary>
          <div className="absolute bottom-6 right-0 w-64 rounded-md border border-zinc-200 bg-white p-2 text-xs leading-5 shadow-lg">
            {more.map((p, i) => <div key={i} className="mb-1">{p.kind === "memo" ? "★" : "⚠"} {p.text}</div>)}
          </div>
        </details>
      )}
    </>
  );
}
