// 到期回访的站内横幅（docs/02 4.9：M1 先横幅、M2 才加 TUTOR_REVIEW_DUE 通知）：列到期的阶段，点「开始回访」只出题不重讲。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock } from "lucide-react";
import type { DueReview } from "../types";

export function ReviewDueBanner({ due, busy, onStart }: { due: DueReview[]; busy: boolean; onStart: (stageId: string) => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [pick, setPick] = useState(due[0]?.stage_id ?? "");
  if (!due.length) return null;
  // ★ pick 可能指着一个已经不到期的阶段（回访通过后 due 变了）：不用 effect 去"同步"它，读的时候兜底到 due[0] 就够，select 的 value 也读 cur
  const cur = due.find((d) => d.stage_id === pick) ?? due[0];
  return (
    <div data-testid="review-due-banner" data-count={due.length} className="flex flex-wrap items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <CalendarClock size={14} className="flex-none" />
      <span className="min-w-0 flex-1"><b>{t("reviewDue.banner", { n: due.length })}</b>{due.length === 1 ? ` · ${cur.stage_id} ${cur.title}` : ""}{cur.overdueDays > 0 ? ` · ${t("reviewDue.overdue", { n: cur.overdueDays })}` : ""}</span>
      {due.length > 1 && (
        <select data-testid="review-stage" value={cur.stage_id} onChange={(e) => setPick(e.target.value)} className="max-w-[12rem] rounded-md border border-amber-300 bg-white px-1.5 py-0.5 text-[11px] text-zinc-800">
          {due.map((d) => <option key={d.stage_id} value={d.stage_id}>{d.stage_id} · {d.title}</option>)}
        </select>
      )}
      <button type="button" data-testid="review-start" disabled={busy} onClick={() => onStart(cur.stage_id)} className="rounded-full bg-amber-600 px-3 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40">{t("reviewDue.start")}</button>
    </div>
  );
}
