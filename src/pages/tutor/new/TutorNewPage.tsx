// 向导五步（docs/02 2.1，照 App 七步换三步语义）：建课（政策 + 关键日期）→ 拖入教材（勾来源）→ 教学风格问卷 → 生成（先摆报价、进度一直在动）→ 试教一段。
// 表单与长活都在 wizardStore（退出再进原样在）；?course=<id> 从课程页进来「重新生成」。
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Check, Lock, RefreshCw, Send, Sparkles } from "lucide-react";
import { realNameHint, STYLE_PRESETS } from "../../../tutor/shared/generate/demo.js";
import { ApiError, createCourse, getCourse, getJob, getQuote, getRules, patchCourse, startGenerate, streamPreview, type CourseInput, type HardRule, type KeyDate, type Quote } from "../../../api/tutor";
import { addWizardFiles, pendingFiles, presetFromStyle, randomAlias, removeWizardFile, resetWizard, setWizard, updateWizardFile, useWizard, type WizardState } from "./wizardStore";
import { getPersona } from "../../../api";
import { useTutorReferral } from "../referral";
import { MaterialUploader } from "../materials/MaterialUploader";
import { useUploadEngine } from "../materials/useUploadEngine";
import { assertAdultDeclared } from "../adultGate";

const STYLE_KEYS = ["calc_first", "socratic", "failure_first"] as const;

export function TutorNewPage() {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const nav = useNavigate();
  const [params] = useSearchParams();
  const w = useWizard();
  useTutorReferral(); // 入口带的 ?from= 记一行再抹掉（tutor 仓 docs/06 §5.1）
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void assertAdultDeclared().then((ok) => { if (!ok) nav("/tutor", { replace: true }); }); }, [nav]);
  // 从课程页来「重新生成」：挂到那门课，直接进问卷
  useEffect(() => {
    const cid = params.get("course");
    if (!cid || cid === w.courseId) return;
    getCourse(cid).then(({ course }) => {
      setWizard({ courseId: course.id, course: { title: course.title, subject: course.subject, code: course.code || "", term: course.term || "", policy: course.policy, key_dates: course.key_dates }, files: [], job: null, step: course.materials > 0 ? 3 : 2 });
    }).catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, [params, w.courseId]);
  // 「把这个人格拿去当老师」（tutor 仓 docs/06 §5.1；?persona=<id> 从官网人格详情页 / 广场来）：用它的 style 预填第 3 步 —— 名字、口头禅、称呼；
  // 教学风格三选一按 summary / tone 的字面猜（presetFromStyle）。同一个 id 只预填一次（prefill 记着），不盖掉作者之后改过的
  useEffect(() => {
    const pid = params.get("persona");
    if (!pid || w.prefill?.personaId === pid) return;
    getPersona(pid).then(({ persona }) => {
      const st = (persona.style || {}) as { summary?: string; catchphrases?: string[]; tone?: string; addressUser?: string };
      setWizard((s) => ({
        prefill: { personaId: pid, name: persona.name },
        questionnaire: { ...s.questionnaire, name: persona.name.slice(0, 40), catchphrase: st.catchphrases?.[0] || s.questionnaire.catchphrase, address: st.addressUser || s.questionnaire.address, style: presetFromStyle(`${st.summary || ""} ${st.tone || ""}`) },
      }));
    }).catch((e: unknown) => setErr(t("wiz.style.prefillFailed", { message: e instanceof Error ? e.message : String(e) })));
  }, [params, w.prefill, t]);

  const go = (step: WizardState["step"]) => { setErr(null); setWizard({ step }); window.scrollTo({ top: 0 }); };
  const steps = t("wiz.steps", { returnObjects: true }) as string[];
  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-900" data-testid="wiz" data-step={w.step}>
      <header className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-4">
        <Link to="/tutor" className="flex items-center gap-1 text-xs text-zinc-600"><ArrowLeft size={14} />{t("course.back")}</Link>
        <div className="flex-1 text-center text-sm font-semibold">{t("wiz.title")}</div>
        <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">{t("app.aiBadge")}</span>
      </header>
      <ol className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-3 text-[11px]">
        {steps.map((s, i) => { const n = (i + 1) as WizardState["step"]; const done = n < w.step; return (
          <li key={s} className="flex items-center gap-1">
            <button type="button" data-testid={`wiz-step-${n}`} disabled={n > w.step} onClick={() => go(n)} className={`flex h-6 items-center gap-1 rounded-full px-2 ${n === w.step ? "bg-cyan-600 text-white" : done ? "bg-emerald-100 text-emerald-800" : "bg-zinc-200 text-zinc-500"} disabled:cursor-default`}>{done ? <Check size={11} /> : <span>{n}</span>}<span>{s}</span></button>
            {i < steps.length - 1 && <span className="h-px w-3 bg-zinc-300" />}
          </li>
        ); })}
      </ol>
      <main className="mx-auto max-w-3xl px-4 pb-16">
        {w.prefill && <p className="mb-3 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900" data-testid="wiz-prefilled">{t("wiz.style.prefilled", { name: w.prefill.name })}</p>}
        {err && <p className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800" data-testid="wiz-error">{err}</p>}
        {w.step === 1 && <StepCourse w={w} busy={busy} onNext={async () => {
          setErr(null);
          const c = w.course;
          if (!c.title.trim()) return setErr(t("wiz.course.required", { field: t("wiz.course.title") }));
          if (!c.subject.trim()) return setErr(t("wiz.course.required", { field: t("wiz.course.subject") }));
          setBusy(true);
          try {
            const body: CourseInput = { ...c, code: c.code || undefined, term: c.term || undefined };
            const r = w.courseId ? await patchCourse(w.courseId, body) : await createCourse(body);
            setWizard({ courseId: r.course.id });
            go(2);
          } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
        }} />}
        {w.step === 2 && <StepMaterials w={w} onBack={() => go(1)} onNext={() => go(3)} />}
        {w.step === 3 && <StepStyle w={w} onBack={() => go(2)} onNext={() => go(4)} />}
        {w.step === 4 && <StepGenerate w={w} onBack={() => go(3)} onNext={() => go(5)} />}
        {w.step === 5 && <StepPreview w={w} onBack={() => go(3)} onStart={() => { const id = w.courseId!; resetWizard(); nav(`/tutor/run/${encodeURIComponent(id)}`); }} onCourse={() => { const id = w.courseId!; resetWizard(); nav(`/tutor/courses/${encodeURIComponent(id)}`); }} />}
      </main>
    </div>
  );
}

const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (
  <label className="block text-sm"><span className="mb-1 block text-xs font-semibold text-zinc-600">{label}</span>{children}{hint && <span className="mt-1 block text-[11px] text-zinc-500">{hint}</span>}</label>
);
const inputCls = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500";
const NavBtns = ({ onBack, onNext, nextLabel, nextDisabled, nextTestId = "wiz-next" }: { onBack?: () => void; onNext?: () => void; nextLabel?: string; nextDisabled?: boolean; nextTestId?: string }) => {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  return (
    <div className="mt-6 flex items-center justify-between">
      {onBack ? <button type="button" data-testid="wiz-back" onClick={onBack} className="flex items-center gap-1 rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700"><ArrowLeft size={14} />{t("wiz.back")}</button> : <span />}
      {onNext && <button type="button" data-testid={nextTestId} disabled={nextDisabled} onClick={onNext} className="flex items-center gap-1 rounded-full bg-cyan-600 px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-40">{nextLabel ?? t("wiz.next")}<ArrowRight size={14} /></button>}
    </div>
  );
};

function StepCourse({ w, busy, onNext }: { w: WizardState; busy: boolean; onNext: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const c = w.course;
  const set = (patch: Partial<CourseInput>) => setWizard({ course: { ...c, ...patch } });
  const setPolicy = (patch: Partial<CourseInput["policy"]>) => set({ policy: { ...c.policy, ...patch } });
  const setDate = (i: number, patch: Partial<KeyDate>) => set({ key_dates: c.key_dates.map((d, j) => (j === i ? { ...d, ...patch } : d)) });
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("wiz.course.title")}><input data-testid="course-title" value={c.title} onChange={(e) => set({ title: e.target.value })} className={inputCls} /></Field>
        <Field label={t("wiz.course.subject")}><input data-testid="course-subject" value={c.subject} onChange={(e) => set({ subject: e.target.value })} className={inputCls} /></Field>
        <Field label={t("wiz.course.code")}><input data-testid="course-code" value={c.code || ""} onChange={(e) => set({ code: e.target.value })} className={inputCls} /></Field>
        <Field label={t("wiz.course.term")}><input data-testid="course-term" value={c.term || ""} onChange={(e) => set({ term: e.target.value })} className={inputCls} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("wiz.course.policyAi")}>
          <select data-testid="policy-ai" value={c.policy.ai} onChange={(e) => setPolicy({ ai: e.target.value as CourseInput["policy"]["ai"] })} className={inputCls}>
            {(["prohibited", "limited", "allowed"] as const).map((v) => <option key={v} value={v}>{t(`wiz.course.ai_${v}`)}</option>)}
          </select>
        </Field>
        <Field label={t("wiz.course.homework")}>
          <select data-testid="policy-hw" value={c.policy.homework_mode} onChange={(e) => setPolicy({ homework_mode: e.target.value as CourseInput["policy"]["homework_mode"] })} className={inputCls}>
            {(["principles_only", "full"] as const).map((v) => <option key={v} value={v}>{t(`wiz.course.hw_${v}`)}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t("wiz.course.allowedUses")}><input data-testid="policy-uses" value={c.policy.allowed_uses.join("，")} onChange={(e) => setPolicy({ allowed_uses: e.target.value.split(/[,，、]/).map((x) => x.trim()).filter(Boolean) })} className={inputCls} /></Field>
      <Field label={t("wiz.course.policyText")}><textarea data-testid="policy-text" rows={3} value={c.policy.text} onChange={(e) => setPolicy({ text: e.target.value })} className={`${inputCls} resize-none`} /></Field>
      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-semibold text-zinc-600"><span>{t("wiz.course.keyDates")}</span><button type="button" data-testid="keydate-add" onClick={() => set({ key_dates: [...c.key_dates, { label: "", at: "", kind: "homework" }] })} className="rounded-full border border-zinc-300 px-2 py-0.5 text-[11px]">{t("wiz.course.addDate")}</button></div>
        {c.key_dates.map((d, i) => (
          <div key={i} className="mb-1 grid grid-cols-[1fr_auto_auto_auto] items-center gap-2">
            <input data-testid={`keydate-label-${i}`} placeholder={t("wiz.course.dateLabel")} value={d.label} onChange={(e) => setDate(i, { label: e.target.value })} className={inputCls} />
            <input data-testid={`keydate-at-${i}`} type="date" value={d.at} onChange={(e) => setDate(i, { at: e.target.value })} className={inputCls} />
            <select data-testid={`keydate-kind-${i}`} value={d.kind} onChange={(e) => setDate(i, { kind: e.target.value as KeyDate["kind"] })} className={inputCls}>{(["homework", "exam", "project", "other"] as const).map((k) => <option key={k} value={k}>{t(`wiz.course.kind_${k}`)}</option>)}</select>
            <button type="button" onClick={() => set({ key_dates: c.key_dates.filter((_, j) => j !== i) })} className="text-xs text-zinc-500">✕</button>
          </div>
        ))}
      </div>
      <NavBtns onNext={onNext} nextLabel={t("wiz.course.create")} nextDisabled={busy} />
    </section>
  );
}

function StepMaterials({ w, onBack, onNext }: { w: WizardState; onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const fileOf = useCallback((key: string) => pendingFiles.get(key), []);
  useUploadEngine(w.courseId, w.files, updateWizardFile, fileOf);
  const ready = w.files.some((f) => f.status === "done" || f.status === "duplicate");
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-5">
      <MaterialUploader files={w.files} onAdd={addWizardFiles} onUpdate={updateWizardFile} onRemove={removeWizardFile} />
      {!ready && <p className="mt-3 text-[11px] text-zinc-500">{t("wiz.files.needOne")}</p>}
      <NavBtns onBack={onBack} onNext={onNext} nextDisabled={!ready} />
    </section>
  );
}

function StepStyle({ w, onBack, onNext }: { w: WizardState; onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const q = w.questionnaire;
  const set = (patch: Partial<typeof q>) => setWizard({ questionnaire: { ...q, ...patch } });
  const hint = realNameHint(q.name);
  const [rules, setRules] = useState<HardRule[]>([]);
  useEffect(() => { if (w.courseId) getRules(w.courseId).then((r) => setRules(r.rules)).catch(() => setRules([])); }, [w.courseId]);
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <Field label={t("wiz.style.name")} hint={t("wiz.style.nameHint")}>
        <div className="flex gap-2">
          <input data-testid="q-name" value={q.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          <button type="button" data-testid="q-another" onClick={() => set({ name: randomAlias() })} className="flex items-center gap-1 whitespace-nowrap rounded-lg border border-zinc-300 px-3 text-xs"><RefreshCw size={12} />{t("wiz.style.another")}</button>
        </div>
        {hint && <span className="mt-1 block rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800" data-testid="q-name-hint">{hint}</span>}
      </Field>
      <div>
        <div className="mb-1 text-xs font-semibold text-zinc-600">{t("wiz.style.style")}</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {STYLE_KEYS.map((k) => (
            <button key={k} type="button" data-testid={`q-style-${k}`} onClick={() => set({ style: k })} className={`rounded-lg border p-3 text-left ${q.style === k ? "border-cyan-500 bg-cyan-50" : "border-zinc-200"}`}>
              <div className="text-sm font-semibold">{t(`wiz.style.${k}`)}</div>
              <div className="mt-0.5 text-[11px] text-zinc-600">{t(`wiz.style.${k}_d`)}</div>
              <div className="mt-1 text-[11px] italic text-zinc-500">「{STYLE_PRESETS[k].catchphrases[0]}」</div>
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("wiz.style.strictness")}>
          <div className="flex gap-1">{(["gentle", "firm", "strict"] as const).map((s) => <button key={s} type="button" data-testid={`q-strict-${s}`} onClick={() => set({ strictness: s })} className={`rounded-full px-3 py-1 text-xs ${q.strictness === s ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}>{t(`wiz.style.${s}`)}</button>)}</div>
        </Field>
        <Field label={t("wiz.style.address")}><input data-testid="q-address" value={q.address || ""} onChange={(e) => set({ address: e.target.value })} className={inputCls} /></Field>
        <Field label={t("wiz.style.catchphrase")}><input data-testid="q-catchphrase" value={q.catchphrase || ""} onChange={(e) => set({ catchphrase: e.target.value })} className={inputCls} /></Field>
        <Field label={t("wiz.style.examples")}><input data-testid="q-examples" value={q.examples_from || ""} onChange={(e) => set({ examples_from: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label={t("wiz.style.extraRules")}><textarea data-testid="q-extra" rows={2} value={(q.extra_rules || []).join("\n")} onChange={(e) => set({ extra_rules: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })} className={`${inputCls} resize-none`} /></Field>
      {rules.length > 0 && (
        <div data-testid="locked-rules" className="rounded-lg bg-zinc-50 p-3">
          <div className="mb-1 text-xs font-semibold text-zinc-600">{t("wiz.style.lockedRules")}</div>
          <ul className="space-y-1 text-xs text-zinc-700">{rules.filter((r) => r.locked).map((r, i) => <li key={i} className="flex items-start gap-1"><Lock size={12} className="mt-0.5 flex-none text-zinc-500" />{r.text}</li>)}</ul>
        </div>
      )}
      <NavBtns onBack={onBack} onNext={onNext} nextDisabled={!q.name.trim()} />
    </section>
  );
}

function StepGenerate({ w, onBack, onNext }: { w: WizardState; onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [quote, setQuote] = useState<{ quote: Quote | null; stages: number; demo: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => { if (w.courseId) getQuote(w.courseId).then((r) => setQuote({ quote: r.quote, stages: r.stages, demo: r.demo })).catch((e: unknown) => setErr(e instanceof Error ? e.message : String(e))); }, [w.courseId]);
  // 轮询作业（刷新回来接着轮：进度在 store 里）
  useEffect(() => {
    const job = w.job;
    if (!job || (job.status !== "pending" && job.status !== "running")) return;
    const poll = async () => {
      try {
        const { job: j } = await getJob(job.id);
        setWizard({ job: { id: j.id, status: j.status, progress: j.progress, result: j.result, error: j.error, failures: j.failures || [] } });
        if (j.status === "succeeded") { window.clearInterval(timer.current); window.setTimeout(onNext, 600); }
        if (j.status === "failed") window.clearInterval(timer.current);
      } catch (e) { if (e instanceof ApiError && e.status === 404) { setWizard({ job: { ...job, status: "failed", error: e.message } }); window.clearInterval(timer.current); } }
    };
    timer.current = window.setInterval(poll, 700);
    void poll();
    return () => window.clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.job?.id, w.job?.status]);
  const start = async () => {
    if (!w.courseId) return;
    setErr(null);
    try {
      const r = await startGenerate(w.courseId, w.questionnaire);
      setWizard({ job: { id: r.jobId, status: "pending", progress: { step: "queued", done: 0, total: 1, message: "…", mode: r.quote.demo ? "demo" : "model" }, failures: [] } });
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
  };
  const job = w.job;
  const running = job && (job.status === "pending" || job.status === "running");
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <div data-testid="quote" className="rounded-lg bg-zinc-50 p-3 text-sm">
        <div className="mb-1 text-xs font-semibold text-zinc-600">{t("wiz.gen.quoteTitle")}</div>
        {quote?.quote ? (
          <>
            <ul className="text-xs text-zinc-700">{quote.quote.lines.map((l, i) => <li key={i}>{t("wiz.gen.quoteLine", { why: l.why, n: l.n, each: l.each })}</li>)}</ul>
            <div className="mt-1 font-semibold" data-testid="quote-total">{quote.demo ? t("wiz.gen.demoFree") : t("wiz.gen.total", { n: quote.quote.total })}</div>
            <div className="text-[11px] text-zinc-500">{t("wiz.gen.suggested")}</div>
          </>
        ) : quote && quote.stages === 0 ? <div className="text-xs text-amber-700">{t("wiz.gen.noMaterials")}</div> : <div className="text-xs text-zinc-500">…</div>}
      </div>
      {realNameHint(w.questionnaire.name) && <p className="rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{realNameHint(w.questionnaire.name)}</p>}
      {err && <p className="text-xs text-rose-700">{err}</p>}
      {job && (
        <div data-testid="gen-progress" data-status={job.status} className="rounded-lg border border-zinc-200 p-3 text-sm">
          <div className="mb-1 flex items-center gap-2"><Sparkles size={14} className="text-cyan-600" /><span>{running ? t("wiz.gen.running", { done: job.progress.done, total: job.progress.total, message: job.progress.message }) : job.status === "succeeded" ? t("wiz.gen.done", { stages: job.result?.stages ?? 0, mode: job.result?.mode ?? "" }) : t("wiz.gen.failed", { message: job.error ?? "" })}</span></div>
          <div className="h-1.5 overflow-hidden rounded bg-zinc-200"><div className={`h-full transition-all ${job.status === "failed" ? "bg-rose-500" : "bg-cyan-500"}`} style={{ width: `${Math.round(((job.status === "succeeded" ? 1 : job.progress.done / Math.max(job.progress.total, 1)) || 0) * 100)}%` }} /></div>
          {job.failures.length > 0 && <div className="mt-2 text-[11px] text-amber-800">{t("wiz.gen.failures")}<ul className="list-disc pl-4">{job.failures.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
        </div>
      )}
      <div className="flex items-center justify-between">
        <button type="button" data-testid="wiz-back" onClick={onBack} disabled={!!running} className="flex items-center gap-1 rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700 disabled:opacity-40"><ArrowLeft size={14} />{t("wiz.back")}</button>
        <div className="flex gap-2">
          {job?.status === "succeeded" && <button type="button" data-testid="wiz-next" onClick={onNext} className="flex items-center gap-1 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-semibold text-white">{t("wiz.next")}<ArrowRight size={14} /></button>}
          <button type="button" data-testid="gen-start" onClick={() => void start()} disabled={!!running || !quote || quote.stages === 0} className="flex items-center gap-1 rounded-full bg-cyan-600 px-5 py-1.5 text-sm font-semibold text-white disabled:opacity-40"><Sparkles size={14} />{job?.status === "succeeded" || job?.status === "failed" ? t("wiz.gen.regen") : t("wiz.gen.start")}</button>
        </div>
      </div>
    </section>
  );
}

function StepPreview({ w, onBack, onStart, onCourse }: { w: WizardState; onBack: () => void; onStart: () => void; onCourse: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [text, setText] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const run = useCallback(async (body: { kind: "teach" | "ask"; text?: string }, into: (s: string) => void) => {
    if (!w.courseId) return;
    setBusy(true);
    let acc = "";
    try { await streamPreview(w.courseId, body, { onToken: (tk) => { acc += tk; into(acc); }, onDone: (d) => into(d.text) }); }
    catch (e) { into(t("teacher.failed", { message: e instanceof Error ? e.message : String(e) })); }
    finally { setBusy(false); }
  }, [w.courseId, t]);
  useEffect(() => { if (started.current) return; started.current = true; void run({ kind: "teach" }, setText); }, [run]);
  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-white p-5">
      <h2 className="text-base font-bold">{t("wiz.preview.title")}</h2>
      <p className="text-xs text-zinc-500">{t("wiz.preview.hint")}</p>
      <div data-testid="preview-text" className="min-h-[120px] whitespace-pre-wrap rounded-lg bg-zinc-100 p-3 text-sm leading-6">{text || <span className="text-zinc-400">{t("wiz.preview.waiting")}</span>}</div>
      {answer !== null && <div data-testid="preview-answer" className="whitespace-pre-wrap rounded-lg bg-cyan-50 p-3 text-sm leading-6">{answer}</div>}
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!q.trim()) return; const text = q.trim(); setQ(""); setAnswer(""); void run({ kind: "ask", text }, setAnswer); }}>
        <input data-testid="preview-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("wiz.preview.askPlaceholder")} className={inputCls} />
        <button type="submit" data-testid="preview-send" disabled={busy || !q.trim()} className="rounded-lg bg-zinc-900 px-3 text-white disabled:opacity-40" aria-label={t("wiz.preview.ask")}><Send size={14} /></button>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" data-testid="wiz-back" onClick={onBack} className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700">{t("wiz.preview.regen")}</button>
        <div className="flex gap-2">
          <button type="button" data-testid="wiz-to-course" onClick={onCourse} className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700">{t("wiz.preview.toCourse")}</button>
          <button type="button" data-testid="wiz-start-learning" onClick={onStart} className="rounded-full bg-cyan-600 px-5 py-1.5 text-sm font-semibold text-white">{t("wiz.preview.start")}</button>
        </div>
      </div>
    </section>
  );
}
