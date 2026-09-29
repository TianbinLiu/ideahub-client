// 课程页的「发布到市场」卡（tutor 仓 docs/02 §6）：五道门在服务端一处（tutor 仓 src/publish），任一不过 422 + gate —— 这里把它的答案画出来：
// 表单上先列出五道门让作者心里有数，被拒时高亮是哪一道；「主动声明含 AI 生成内容」是显式勾选（《标识办法》第十条），不是脚注。
// 已发布：版本 / sha256 前 12 位 / 市场链接 / 取消分享 / 发布新版本；被平台下架：说明原因、不再给发布键。
import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Store } from "lucide-react";
import { ApiError, publishPersona, unpublishPersona, type CourseSummary, type PublishGate, type PublishState } from "../../api/tutor";

const GATE_NO: Record<string, string> = { license: "①", cleanCheck: "②", doc: "②", adult: "③", aigc: "④", name: "⑤", tags: "⑤", persona: "—" };
const GATES: PublishGate[] = ["license", "cleanCheck", "adult", "aigc", "name"];
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function PublishCard({ courseId, course, onChanged }: { courseId: string; course: CourseSummary; onChanged: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const pub = course.published ?? null;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(pub?.name || course.persona?.name || "");
  const [description, setDescription] = useState(pub?.description || "");
  const [tags, setTags] = useState((pub?.tags || []).join(", "));
  const [note, setNote] = useState("");
  const [aigc, setAigc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ gate?: string; message: string } | null>(null);
  const [result, setResult] = useState<PublishState | null>(null);
  const fork = course.source ? course.source : null; // 从市场开出来的课：发布 = 「另存为我的人格」（复刻件，① ② 沿用来源；tutor 仓 docs/02 5.10）
  if (!course.persona) return null;
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await publishPersona(courseId, { name: name.trim(), description: description.trim(), tags: tags.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 6), aigcDeclared: aigc, note: note.trim() || undefined });
      setResult(r.persona); setOpen(false); setAigc(false); onChanged();
    } catch (e) { setErr({ gate: e instanceof ApiError ? e.gate : undefined, message: msg(e) }); }
    finally { setBusy(false); }
  };
  const unpublish = async () => { setBusy(true); setErr(null); try { await unpublishPersona(courseId); setResult(null); onChanged(); } catch (e) { setErr({ message: msg(e) }); } finally { setBusy(false); } };
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="publish-card" data-fork={fork ? "1" : "0"}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs font-semibold text-zinc-600"><Store size={12} />{fork ? t("publish.forkTitle") : t("publish.title")}</div>
        {pub && !pub.takenDown && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${pub.shared ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{pub.shared ? t("publish.badgeLive") : t("publish.badgeUnshared")}</span>}
      </div>
      {fork && <p data-testid="publish-fork-hint" className="mt-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] text-violet-900">{t("publish.forkHint", { name: fork.personaName || t("course.sourceLink"), v: fork.version })}</p>}
      {pub?.takenDown && <p data-testid="publish-takedown" className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{t("publish.takenDown", { reason: pub.takenDownReason || "—" })}</p>}
      {pub && !pub.takenDown && (
        <div data-testid="publish-state" data-version={pub.version} className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-700">
          <span>{pub.shared ? t("publish.live", { v: pub.version }) : t("publish.unshared", { v: pub.version })}</span>
          {pub.sha256 && <span className="font-mono text-[10px] text-zinc-500">sha256 {pub.sha256.slice(0, 12)}…</span>}
          <Link to={pub.marketPath} data-testid="publish-market-link" className="underline underline-offset-2">{t("publish.viewInMarket")}</Link>
          {pub.shared && <button type="button" data-testid="publish-unpublish" disabled={busy} onClick={() => void unpublish()} className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] disabled:opacity-40">{t("publish.unpublish")}</button>}
        </div>
      )}
      {result && <p data-testid="publish-result" className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{t("publish.done", { v: result.version })}</p>}
      {!pub?.takenDown && !open && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[11px] text-zinc-500">{fork ? t("publish.forkReady") : course.publishable ? t("publish.ready") : t("publish.notPublishableHint", { why: t("course.unsureBanner", { n: course.unsure }) })}</p>
          <button type="button" data-testid="publish-open" onClick={() => setOpen(true)} className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white">{pub ? t("publish.newVersion") : fork ? t("publish.forkOpen") : t("publish.open")}</button>
        </div>
      )}
      {open && (
        <form data-testid="publish-form" className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="rounded-lg bg-zinc-50 p-3 text-[11px] text-zinc-600">
            <div className="mb-1 font-semibold">{t("publish.gatesTitle")}</div>
            <ol className="space-y-0.5">{GATES.map((g) => <li key={g} data-gate={g} className={err?.gate === g || (g === "name" && err?.gate === "tags") || (g === "cleanCheck" && err?.gate === "doc") ? "font-semibold text-rose-700" : ""}>{t(`publish.g_${g}`)}</li>)}</ol>
          </div>
          <label className="block text-xs"><span className="font-semibold text-zinc-600">{t("publish.name")}</span><input data-testid="publish-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></label>
          <label className="block text-xs"><span className="font-semibold text-zinc-600">{t("publish.description")}</span><textarea data-testid="publish-description" value={description} maxLength={1000} rows={2} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></label>
          <label className="block text-xs"><span className="font-semibold text-zinc-600">{t("publish.tags")}</span><input data-testid="publish-tags" value={tags} onChange={(e) => setTags(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></label>
          <label className="block text-xs"><span className="font-semibold text-zinc-600">{t("publish.note")}</span><input data-testid="publish-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" /></label>
          <label className="flex items-start gap-2 rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900"><input data-testid="publish-aigc" type="checkbox" checked={aigc} onChange={(e) => setAigc(e.target.checked)} className="mt-0.5" /><span>{t("publish.aigcLabel")}</span></label>
          {err && <p data-testid="publish-error" data-gate={err.gate || ""} className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{err.gate ? t("publish.failedAt", { gate: GATE_NO[err.gate] || "?", message: err.message }) : err.message}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" data-testid="publish-cancel" onClick={() => { setOpen(false); setErr(null); }} className="rounded-full border border-zinc-300 px-3 py-1 text-xs">{t("publish.cancel")}</button>
            <button type="submit" data-testid="publish-submit" disabled={busy} className="rounded-full bg-cyan-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">{busy ? t("publish.submitting") : t("publish.submit")}</button>
          </div>
        </form>
      )}
    </section>
  );
}
