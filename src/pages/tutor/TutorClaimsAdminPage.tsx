// /admin/tutor-claims：教授认领（instructorClaim）的人工核实队列（tutor 仓 docs/06 §4.2「instructorClaim 进人工队列」）。
// 与通用举报队列是同一张表、同一份处置正文，这里只是单独一条车道：先来先处理 → 「联系举报人」要证据（平台通知）→ 裁定成立（下架 + 收尾 + 两头通知）/ 不成立（驳回 + 通知举报人）。
// 规则都在服务端（阶段派生、409 已处理、TARGET_GONE），这里只画状态与三颗键；主站管理页的深色皮，不是 /tutor 的浅色。
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { contactClaim, listClaims, verdictClaim, type ClaimItem, type ClaimStage, type ClaimsReply } from "../../api/tutor";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const TABS: Exclude<ClaimStage, "all">[] = ["new", "awaiting", "upheld", "rejected"];

function ClaimRow({ c, onChanged }: { c: ClaimItem; onChanged: (note: string | null) => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor.claims" });
  const [contactOpen, setContactOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const open = c.stage === "new" || c.stage === "awaiting";
  const run = async (fn: () => Promise<unknown>, done: string) => { setBusy(true); setErr(null); try { await fn(); onChanged(done); } catch (e) { setErr(msg(e)); } finally { setBusy(false); } };
  return (
    <li data-testid="claim-row" data-claim-id={c.id} data-stage={c.stage} className="rounded-lg border border-gray-800 bg-gray-900 p-3 text-sm text-gray-100">
      <div className="flex flex-wrap items-center gap-2">
        <span data-testid="claim-stage" className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.stage === "new" ? "bg-amber-900/60 text-amber-200" : c.stage === "awaiting" ? "bg-sky-900/60 text-sky-200" : c.stage === "upheld" ? "bg-rose-900/60 text-rose-200" : "bg-gray-800 text-gray-300"}`}>{t(`stage_${c.stage}`)}</span>
        {c.persona.exists ? <Link data-testid="claim-persona" to={c.persona.marketPath} className="font-semibold hover:underline">{c.persona.name}</Link> : <span data-testid="claim-persona" className="text-gray-400">{t("personaGone")}</span>}
        {c.persona.exists && <span className="text-xs text-gray-400">{c.persona.subject} · v{c.persona.version} · {t("by", { name: c.persona.author.username || "—" })} · {t("downloads", { n: c.persona.downloadCount })}{c.persona.takenDown && <span className="ml-1 text-rose-300">{t("takenDown")}</span>}</span>}
        <span className="ml-auto text-xs text-gray-500">{new Date(c.createdAt).toLocaleString()}</span>
      </div>
      <div className="mt-2 text-xs text-gray-300"><span className="text-gray-500">{t("claimant", { name: c.reporter.displayName || c.reporter.username || c.reporter._id })}</span> <span data-testid="claim-detail" className="whitespace-pre-wrap">{c.detail || t("noDetail")}</span></div>
      {c.review.log.length > 0 && <ol className="mt-2 space-y-0.5 text-[11px] text-gray-400">{c.review.log.map((l, i) => <li key={i} data-testid="claim-log">{new Date(l.at).toLocaleString()} · {t(`log_${l.action}`, { defaultValue: l.action })}{l.note ? `：${l.note}` : ""}</li>)}</ol>}
      {!open && <div className="mt-2 text-xs text-gray-400">{t("handledLine", { at: c.handledAt ? new Date(c.handledAt).toLocaleString() : "—", by: c.handler?.username || "—" })}{c.handleNote && <span>：{c.handleNote}</span>}</div>}
      {open && (
        <div className="mt-3 space-y-2">
          {contactOpen ? (
            <div className="rounded-md border border-sky-900 bg-sky-950/40 p-2">
              <div className="mb-1 text-[11px] text-sky-200">{t("contactHint")}</div>
              <textarea data-testid="claim-contact-text" value={message} maxLength={500} rows={2} placeholder={t("contactPlaceholder")} onChange={(e) => setMessage(e.target.value)} className="w-full rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" />
              <div className="mt-1 flex justify-end gap-2">
                <button type="button" onClick={() => setContactOpen(false)} className="rounded-lg border border-gray-700 px-3 py-1 text-xs text-gray-300">{t("cancel")}</button>
                <button type="button" data-testid="claim-contact-send" disabled={busy || !message.trim()} onClick={() => void run(() => contactClaim(c.id, message.trim()), t("contacted"))} className="rounded-lg bg-sky-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">{t("contactSend")}</button>
              </div>
            </div>
          ) : (
            <button type="button" data-testid="claim-contact-open" onClick={() => setContactOpen(true)} className="rounded-lg border border-sky-800 px-3 py-1 text-xs text-sky-200">{c.review.contactCount ? t("contactAgain", { n: c.review.contactCount }) : t("contactOpen")}</button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input data-testid="claim-note" value={note} maxLength={500} placeholder={t("notePlaceholder")} onChange={(e) => setNote(e.target.value)} className="min-w-[12rem] flex-1 rounded-md border border-gray-700 bg-gray-950 px-2 py-1.5 text-xs text-gray-100" />
            <button type="button" data-testid="claim-uphold" disabled={busy} onClick={() => void run(() => verdictClaim(c.id, "upheld", note.trim() || undefined), t("upheldDone"))} className="rounded-lg bg-rose-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40">{t("uphold")}</button>
            <button type="button" data-testid="claim-reject" disabled={busy} onClick={() => void run(() => verdictClaim(c.id, "rejected", note.trim() || undefined), t("rejectedDone"))} className="rounded-lg border border-gray-600 px-3 py-1 text-xs text-gray-200 disabled:opacity-40">{t("reject")}</button>
          </div>
          <p className="text-[11px] text-gray-500">{t("verdictHint")}</p>
        </div>
      )}
      {err && <p data-testid="claim-error" className="mt-2 rounded-md border border-rose-800 bg-rose-950/50 px-2 py-1 text-xs text-rose-200">{err}</p>}
    </li>
  );
}

export default function TutorClaimsAdminPage() {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor.claims" });
  const [stage, setStage] = useState<Exclude<ClaimStage, "all">>("new");
  const [data, setData] = useState<ClaimsReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback((st: ClaimStage) => listClaims(st).then((r) => { setData(r); setError(null); }).catch((e: unknown) => setError(msg(e))), []);
  useEffect(() => { void load(stage); }, [load, stage]);
  const items = data && data.stage === stage ? data.items : null;
  return (
    <div className="mx-auto max-w-5xl p-4" data-testid="claims-page">
      <h1 className="text-xl font-bold text-white">{t("title")}</h1>
      <p className="mt-1 text-xs text-gray-400">{t("intro")}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((s) => <button key={s} type="button" data-testid={`claims-tab-${s}`} onClick={() => setStage(s)} className={`rounded-full px-3 py-1 text-xs font-semibold ${stage === s ? "bg-white text-black" : "bg-gray-800 text-gray-300"}`}>{t(`stage_${s}`)} <span data-testid={`claims-count-${s}`}>{data ? data.counts[s] : "…"}</span></button>)}
      </div>
      {notice && <p data-testid="claims-notice" className="mt-3 rounded-md border border-emerald-800 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-200">{notice}</p>}
      {error && <p className="mt-3 text-sm text-rose-300">{t("error", { message: error })}</p>}
      {!error && !items && <p className="mt-3 text-sm text-gray-400">{t("loading")}</p>}
      {items && items.length === 0 && <p data-testid="claims-empty" className="mt-3 text-sm text-gray-400">{t("empty")}</p>}
      {items && items.length > 0 && <ul data-testid="claims-list" className="mt-3 space-y-2">{items.map((c) => <ClaimRow key={c.id} c={c} onChanged={(n) => { setNotice(n); void load(stage); }} />)}</ul>}
    </div>
  );
}
