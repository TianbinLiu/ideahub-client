// 老师回答里的 [[pN]] 回跳标记（docs/05 §5.6）→ 可点的页码链接；其余原样（保留换行）。
import type { ReactNode } from "react";

export const PAGE_REF_RE = /\[\[p(\d+)\]\]/g;

export function renderTeacherText(text: string, onJump: (page: number) => void): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(PAGE_REF_RE)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const page = Number(m[1]);
    out.push(<button key={`${i}-${page}`} type="button" data-testid="page-ref" onClick={() => onJump(page)} className="mx-0.5 rounded bg-cyan-100 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-200">p{page}</button>);
    last = i + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
