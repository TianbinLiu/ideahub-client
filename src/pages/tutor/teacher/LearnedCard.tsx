// 「老师这节课学到了 N 件事」卡（docs/02 4.7、docs/03 §7.4）：一次蒸馏的修订记录，逐条接受 / 不要 / 撤销，每条能点到依据的那几轮原话。
// 只画：接受 / 撤销都打服务端（reviewRevision / revertOps），状态以回包为准。
import { useTranslation } from "react-i18next";
import { Check, Undo2, X, ListChecks, Sparkles } from "lucide-react";
import type { RevisionOp, RevisionView } from "../types";

function opLabel(t: (k: string, o?: Record<string, unknown>) => string, op: RevisionOp) {
  const key = `distill.op_${op.op}`;
  const label = t(key);
  return label === key ? op.op : label;
}

export function OpRow({ op, busy, onAccept, onReject, onRevert, onJump }: { op: RevisionOp; busy: boolean; onAccept?: (opId: string) => void; onReject?: (opId: string) => void; onRevert?: (opId: string) => void; onJump?: (seq: number) => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const tone = { applied: "bg-emerald-100 text-emerald-800", pending: "bg-amber-100 text-amber-800", rejected: "bg-zinc-200 text-zinc-600 line-through", reverted: "bg-zinc-200 text-zinc-600 line-through", noop: "bg-zinc-100 text-zinc-500", skipped: "bg-zinc-100 text-zinc-500" }[op.status] || "bg-zinc-100 text-zinc-600";
  return (
    <li data-testid="learned-op" data-status={op.status} data-op={op.op} data-opid={op.opId} className="rounded-lg border border-zinc-200 p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded-full bg-cyan-50 px-2 py-0.5 font-semibold text-cyan-800">{opLabel(t, op)}</span>
        {op.stage && <span className="text-zinc-500">{op.stage}{op.stageTitle ? ` · ${op.stageTitle}` : ""}</span>}
        <span className={`ml-auto rounded-full px-2 py-0.5 ${tone}`}>{t(`distill.${op.status}`)}</span>
      </div>
      <div className={`mt-1 leading-5 ${op.status === "rejected" || op.status === "reverted" ? "text-zinc-400 line-through" : "text-zinc-800"}`}>{op.text}</div>
      {op.rationale && <div className="mt-0.5 text-[11px] text-zinc-500">{op.rationale}</div>}
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {op.evidence.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-zinc-500">
            {onJump ? <>{t("distill.evidenceLabel")}{op.evidence.map((s) => <button key={s} type="button" data-testid="learned-evidence" onClick={() => onJump(s)} className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 hover:bg-zinc-200">t:{s}</button>)}</> : t("distill.evidence", { seqs: op.evidence.join(",") })}
          </span>
        )}
        <span className="ml-auto flex gap-1">
          {op.status === "pending" && onAccept && <button type="button" data-testid="learned-accept" disabled={busy} onClick={() => onAccept(op.opId)} className="flex items-center gap-1 rounded-full bg-cyan-600 px-2.5 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40"><Check size={11} />{t("distill.accept")}</button>}
          {op.status === "pending" && onReject && <button type="button" data-testid="learned-reject" disabled={busy} onClick={() => onReject(op.opId)} className="flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-700 disabled:opacity-40"><X size={11} />{t("distill.reject")}</button>}
          {op.status === "applied" && onRevert && <button type="button" data-testid="learned-revert" disabled={busy} onClick={() => onRevert(op.opId)} className="flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-700 disabled:opacity-40"><Undo2 size={11} />{t("distill.revert")}</button>}
        </span>
      </div>
    </li>
  );
}

export function LearnedCard({ revision, auto, version, busy, onAccept, onReject, onRevert, onJump, onOpenAll, onClose }: { revision: RevisionView; auto: boolean; version?: number; busy: boolean; onAccept: (opId: string) => void; onReject: (opId: string) => void; onRevert: (opId: string) => void; onJump: (seq: number) => void; onOpenAll: () => void; onClose: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const n = revision.ops.filter((o) => o.status === "applied" || o.status === "pending" || o.status === "noop").length;
  const reason = revision.source.reason ? t(`distill.reason_${revision.source.reason}`) : "";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 md:items-center" data-testid="learned-card" data-revision={revision.id}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
        <div className="flex items-start gap-2">
          <Sparkles size={18} className="mt-0.5 text-cyan-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{t("distill.title", { n })}</h2>
            <p className="text-xs text-zinc-500">{t("distill.subtitle", { from: revision.source.turn_from ?? "?", to: revision.source.turn_to ?? "?", reason })}{auto ? ` · ${t("distill.auto", { reason })}` : ""}{version ? ` · ${t("app.version", { v: version })}` : ""}</p>
          </div>
          <button type="button" data-testid="learned-close" onClick={onClose} aria-label={t("distill.close")} className="rounded p-1 text-zinc-500 hover:bg-zinc-100"><X size={16} /></button>
        </div>
        {revision.ops.length === 0 && <p className="mt-3 text-sm text-zinc-500">{revision.summary}</p>}
        <ul className="mt-3 space-y-2">{revision.ops.map((op) => <OpRow key={op.opId} op={op} busy={busy} onAccept={onAccept} onReject={onReject} onRevert={onRevert} onJump={onJump} />)}</ul>
        <div className="mt-3 flex items-center justify-between">
          <button type="button" data-testid="learned-all" onClick={onOpenAll} className="flex items-center gap-1 text-xs text-cyan-700 underline underline-offset-2"><ListChecks size={13} />{t("distill.all")}</button>
          <button type="button" onClick={onClose} className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white">{t("distill.close")}</button>
        </div>
      </div>
    </div>
  );
}
