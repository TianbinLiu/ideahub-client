// /tutor/courses/:id：课程 / 政策 / 教材（来源、页数、有没有进课程地图）/ 老师；再传几份 → 扫描目录 → 作者点头追加（docs/02 1.9、docs/05 §4.6）。
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Lock, ScanSearch } from "lucide-react";
import { acceptScan, getCourse, scanCourse, type CourseSummary, type MaterialEntry, type ScanProposal, setMaterialLicense, type LicenseSource } from "../../api/tutor";
import { MaterialUploader } from "./materials/MaterialUploader";
import { ExportCard } from "./ExportCard";
import { useUploadEngine } from "./materials/useUploadEngine";
import type { WizardFile } from "./new/wizardStore";

export function TutorCoursePage() {
  const { id = "" } = useParams();
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [data, setData] = useState<{ course: CourseSummary; materials: MaterialEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<WizardFile[]>([]);
  const [localFiles] = useState(() => new Map<string, File>());
  const [scan, setScan] = useState<{ patchId: string | null; proposals: ScanProposal[]; files: number; failures: string[] } | null>(null);
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // 授权来源的四档与向导那一步同一份文案（wiz.files.lic_*）；改完整位老师按最差的那一档重算，回包里带着，当面说出来
  const LICENSE_SOURCES: LicenseSource[] = ["self", "instructor_public", "instructor_consent", "unsure"];
  const changeLicense = async (sha: string, source: LicenseSource) => { setBusy(true); setError(null); try { const r = await setMaterialLicense(id, sha, source); setNotice(t("course.licenseSaved", { doc: t(`wiz.files.lic_${r.docLicense ?? source}`) })); await load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const load = useCallback(() => getCourse(id).then(setData).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))), [id]);
  useEffect(() => { void load(); }, [load]);
  const update = useCallback((key: string, patch: Partial<WizardFile>) => setFiles((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f))), []);
  const fileOf = useCallback((key: string) => localFiles.get(key), [localFiles]);
  useUploadEngine(id, files, update, fileOf, load);
  const add = (list: File[]) => setFiles((fs) => [...fs, ...list.map((file) => { const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; localFiles.set(key, file); return { key, name: file.name, bytes: file.size, ext: (/\.[a-z0-9]+$/i.exec(file.name)?.[0] || "").toLowerCase(), license: "" as const, status: "queued" as const, progress: 0, warnings: [] }; })]);
  const doScan = async () => { setBusy(true); setNotice(null); try { const r = await scanCourse(id); setScan({ patchId: r.patchId, proposals: r.proposals, files: r.materials.length, failures: r.failures || [] }); setPicked(r.proposals.map((p) => p.i)); if (!r.proposals.length) setNotice(t("course.scanNone")); } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  const doAccept = async () => { if (!scan?.patchId) return; setBusy(true); try { const r = await acceptScan(id, scan.patchId, picked); setNotice(t("course.accepted", { n: r.added.length, v: r.version })); setScan(null); await load(); } catch (e) { setNotice(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); } };
  if (error) return <div className="p-6 text-sm text-rose-700">{t("app.error", { message: error })}</div>;
  if (!data) return <div className="p-6 text-sm text-zinc-500">{t("app.loading")}</div>;
  const { course, materials } = data;
  const fresh = materials.filter((m) => !m.inDoc && m.parsed.status === "ok");
  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-900" data-testid="course-page">
      <header className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-4">
        <Link to="/tutor" className="flex items-center gap-1 text-xs text-zinc-600"><ArrowLeft size={14} />{t("course.back")}</Link>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{course.title}</div>
        <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">{t("app.aiBadge")}</span>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {course.unsure > 0 && <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="unsure-banner">{t("course.unsureBanner", { n: course.unsure })}</p>}
        {notice && <p className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700" data-testid="course-notice">{notice}</p>}
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="text-xs text-zinc-500">{course.subject}{course.code ? ` · ${course.code}` : ""}{course.term ? ` · ${course.term}` : ""}</div>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 text-sm">
            <div><div className="text-xs font-semibold text-zinc-600">{t("course.policy")}</div><div className="mt-0.5 flex items-center gap-1"><Lock size={12} className="text-zinc-500" />{course.policy.ai} / {course.policy.homework_mode}</div>{course.policy.text && <p className="mt-1 text-xs text-zinc-600">{course.policy.text}</p>}</div>
            <div><div className="text-xs font-semibold text-zinc-600">{t("course.dates")}</div><ul className="mt-0.5 text-xs text-zinc-700">{course.key_dates.map((d, i) => <li key={i}>{d.label} · {d.at} · {d.kind}</li>)}{!course.key_dates.length && <li className="text-zinc-400">—</li>}</ul></div>
          </div>
        </section>
        <section className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="persona-card">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-zinc-600">{t("course.persona")}</div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${course.publishable ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{course.publishable ? t("course.publishable") : t("course.notPublishable")}</span>
          </div>
          {course.persona ? (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">{course.persona.name}</span><span className="text-xs text-zinc-500">{t("course.version", { v: course.persona.version, stages: course.persona.stages })}</span>
              {course.persona.method && <span className="text-[11px] text-zinc-500">· {course.persona.method}</span>}
              <span className="ml-auto flex gap-2">
                <Link to={`/tutor/personas/${encodeURIComponent(id)}/review`} data-testid="course-revisions" className={`rounded-full border px-3 py-1 text-xs ${course.run?.pendingReview ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-300"}`}>{course.run?.pendingReview ? t("revisions.openN", { n: course.run.pendingReview }) : t("revisions.open")}</Link>
                <Link to={`/tutor/new?course=${encodeURIComponent(id)}`} data-testid="course-regen" className="rounded-full border border-zinc-300 px-3 py-1 text-xs">{t("course.regen")}</Link>
                <Link to={`/tutor/run/${encodeURIComponent(id)}`} data-testid="course-learn" className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">{t("course.learn")}</Link>
              </span>
            </div>
          ) : (
            <div className="mt-1 flex items-center justify-between text-sm"><span className="text-zinc-500">{t("course.noPersona")}</span><Link to={`/tutor/new?course=${encodeURIComponent(id)}`} data-testid="course-generate" className="rounded-full bg-cyan-600 px-3 py-1 text-xs font-semibold text-white">{t("course.generate")}</Link></div>
          )}
        </section>
        {course.persona && <ExportCard courseId={id} onImported={() => void load()} />}
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold text-zinc-600">{t("course.materials")}</div>
            {course.persona && <button type="button" data-testid="course-scan" disabled={busy || !fresh.length} onClick={() => void doScan()} className="flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"><ScanSearch size={12} />{busy ? t("course.scanning") : t("course.scan")}</button>}
          </div>
          <ul className="divide-y divide-zinc-100 text-sm">
            {materials.map((m) => (
              <li key={m.sha} data-testid="material-row" className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                <span className="text-[11px] text-zinc-500">{m.parsed.status === "ok" ? `${t("course.pages", { n: m.units })} · ${t("course.chars", { n: m.chars })}` : t("course.parseFailed")}</span>
                <select data-testid="material-license" aria-label={t("course.license")} value={m.license.source} disabled={busy} onChange={(e) => void changeLicense(m.sha, e.target.value as LicenseSource)} className={`rounded-full border-0 px-2 py-0.5 text-[10px] ${m.license.source === "unsure" ? "bg-amber-100 text-amber-800" : "bg-zinc-100 text-zinc-600"}`}>
                  {LICENSE_SOURCES.map((s) => <option key={s} value={s}>{t(`wiz.files.lic_${s}`)}</option>)}
                </select>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${m.inDoc ? "bg-emerald-100 text-emerald-800" : "bg-cyan-100 text-cyan-800"}`}>{m.inDoc ? t("course.inDoc") : t("course.notInDoc")}</span>
              </li>
            ))}
          </ul>
          {scan && scan.proposals.length > 0 && (
            <div data-testid="scan-proposals" className="mt-3 rounded-lg border border-cyan-200 bg-cyan-50 p-3">
              <div className="mb-2 text-sm font-semibold text-cyan-900">{t("course.proposals", { files: scan.files, n: scan.proposals.length })}</div>
              <ul className="space-y-1 text-xs">{scan.proposals.map((p) => <li key={p.i} className="flex items-start gap-2"><input type="checkbox" checked={picked.includes(p.i)} onChange={(e) => setPicked((s) => (e.target.checked ? [...s, p.i] : s.filter((x) => x !== p.i)))} className="mt-0.5" /><span><span className="font-semibold">{p.title}</span> · {t("course.steps", { n: p.steps })} · {t("course.memo", { n: p.memo })} · {t("course.checks", { n: p.checks })}<br /><span className="text-zinc-600">{p.method.slice(0, 80)}…</span></span></li>)}</ul>
              {scan.failures.length > 0 && <div className="mt-1 text-[11px] text-amber-800">{scan.failures.join("；")}</div>}
              <div className="mt-2 flex justify-end"><button type="button" data-testid="scan-accept" disabled={busy || !picked.length} onClick={() => void doAccept()} className="rounded-full bg-cyan-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">{t("course.accept")}</button></div>
            </div>
          )}
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold text-zinc-600">{t("course.addMore")}</div>
            <MaterialUploader files={files} onAdd={add} onUpdate={update} onRemove={(key) => { localFiles.delete(key); setFiles((fs) => fs.filter((f) => f.key !== key)); }} />
          </div>
        </section>
      </main>
    </div>
  );
}
