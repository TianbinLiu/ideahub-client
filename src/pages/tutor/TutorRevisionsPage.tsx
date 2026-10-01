// 修订审阅页 /tutor/personas/:id/review（docs/02 4.5 / 4.7、docs/05 §2.3 路由表）：等点头的 op 在上（逐条接受 / 不要、全部接受），历史在下
// （每条修订：来路 / 窗口 / 摘要 / 各 op 的处境；已生效的可撤销）。点头一批 = 老师升一版（服务端做，这里只画回包）。
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCheck, History } from "lucide-react";
import { getRevisions, reviewRevision, revertOps } from "../../api/tutor";
import type { RevisionOp, RevisionView } from "./types";
import { OpRow } from "./teacher/LearnedCard";

export function TutorRevisionsPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [data, setData] = useState<{ revisions: RevisionView[]; pending: number; version: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => getRevisions(id).then((r) => setData({ revisions: r.revisions, pending: r.pending, version: r.version })).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))), [id]);
  useEffect(() => { void load(); }, [load]);
  const pending = useMemo(() => (data?.revisions ?? []).flatMap((r) => r.ops.filter((o) => o.status === "pending").map((o) => ({ ...o, revisionId: r.id }))), [data]);
  const say = (msg: string) => { setNotice(msg); window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 4000); };
  const act = async (fn: () => Promise<object>, okMsg?: (v?: number) => string) => {
    setBusy(true);
    try { const r = (await fn()) as { version?: number }; await load(); if (okMsg) say(okMsg(r.version)); } catch (e) { say(t("distill.error", { message: e instanceof Error ? e.message : String(e) })); } finally { setBusy(false); }
  };
  const accept = (rid: string, opId: string) => act(() => reviewRevision(id, rid, { accept: [opId] }), (v) => (v ? t("distill.version", { v }) : t("distill.done")));
  const reject = (rid: string, opId: string) => act(() => reviewRevision(id, rid, { reject: [opId] }), () => t("distill.done"));
  const revert = (rid: string, opId: string) => act(() => revertOps(id, rid, [opId]), () => t("distill.reverted"));
  const acceptAll = async () => {
    const byRev = new Map<string, string[]>();
    for (const op of pending) byRev.set(op.revisionId, [...(byRev.get(op.revisionId) || []), op.opId]);
    await act(async () => { let last: object = {}; for (const [rid, ids] of byRev) last = await reviewRevision(id, rid, { accept: ids }); return last; }, (v) => (v ? t("distill.version", { v }) : t("distill.done")));
  };
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language === "zh" ? "zh-CN" : "en");
  if (error) return <div className="p-6 text-sm text-rose-700">{t("app.error", { message: error })}</div>;
  if (!data) return <div className="p-6 text-sm text-zinc-500">{t("app.loading")}</div>;
  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-900" data-testid="revisions-page" data-pending={pending.length}>
      <header className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-4">
        <Link to={`/tutor/run/${encodeURIComponent(id)}`} className="flex items-center gap-1 text-xs text-zinc-600"><ArrowLeft size={14} />{t("revisions.back")}</Link>
        <div className="flex-1 text-center text-sm font-semibold">{t("revisions.title")}</div>
        <span data-testid="rev-version" className="text-xs text-zinc-500">{t("revisions.version", { v: data.version })}</span>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {notice && <p className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700" data-testid="rev-notice">{notice}</p>}
        <section className="rounded-xl border border-amber-200 bg-white p-4" data-testid="rev-pending">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-bold">{pending.length ? t("revisions.pendingTitle", { n: pending.length }) : t("revisions.noPending")}</h2>
            {pending.length > 0 && <button type="button" data-testid="rev-accept-all" disabled={busy} onClick={() => void acceptAll()} className="flex items-center gap-1 rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"><CheckCheck size={13} />{t("distill.acceptAll")}</button>}
          </div>
          <ul className="space-y-2">{pending.map((op) => <PendingRow key={op.opId} op={op} busy={busy} onAccept={() => void accept(op.revisionId, op.opId)} onReject={() => void reject(op.revisionId, op.opId)} />)}</ul>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 flex items-center gap-1 text-sm font-bold"><History size={14} />{t("revisions.history")}</h2>
          {data.revisions.length === 0 && <p className="text-sm text-zinc-500">{t("revisions.empty")}</p>}
          <ul className="space-y-3">
            {data.revisions.map((r) => (
              <li key={r.id} data-testid="rev-item" data-kind={r.kind} data-review={r.review} className="rounded-lg border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
                  <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-semibold text-zinc-700">{t(`revisions.kind_${r.kind}`, { defaultValue: r.kind })}</span>
                  {r.source.reason && <span>{t(`distill.reason_${r.source.reason}`)}</span>}
                  {r.source.turn_from != null && <span>{t("revisions.window", { from: r.source.turn_from, to: r.source.turn_to })}</span>}
                  {r.of && <span>{t("revisions.of", { id: r.of })}</span>}
                  <span className="ml-auto">{fmt(r.created_at)}</span>
                </div>
                <div className="mt-1 text-sm text-zinc-800">{r.summary}</div>
                {r.ops.length > 0 && <ul className="mt-2 space-y-2">{r.ops.map((op) => <OpRow key={op.opId} op={op} busy={busy} onAccept={(oid) => void accept(r.id, oid)} onReject={(oid) => void reject(r.id, oid)} onRevert={r.kind !== "revert" ? (oid) => void revert(r.id, oid) : undefined} />)}</ul>}
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function PendingRow({ op, busy, onAccept, onReject }: { op: RevisionOp & { revisionId: string }; busy: boolean; onAccept: () => void; onReject: () => void }) {
  return <OpRow op={op} busy={busy} onAccept={onAccept} onReject={onReject} />;
}
