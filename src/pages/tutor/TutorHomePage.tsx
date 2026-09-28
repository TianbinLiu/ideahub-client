// /tutor 落地：课程列表 + 新建；首次进弹成人声明（tutor 仓 docs/02 1.1，v1 只做成人；判定与缓存在 ./adultGate）。
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { GraduationCap, Plus, Languages, FileUp, Store } from "lucide-react";
import { API_BASE, declareAdult, importPersona, listCourses, type CourseSummary } from "../../api/tutor";
import { adultDeclared, assertAdultDeclared, cacheAdult } from "./adultGate";

export function TutorHomePage() {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);
  const [adult, setAdult] = useState(adultDeclared());
  const nav = useNavigate();
  const importRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  // 导入一位老师（docs/02 §5：别人导出的六段文件 → 新开一门课，从第一阶段重放同一套教学过程）
  const doImport = async (file: File) => {
    setImporting(true); setImportError(null);
    try {
      const text = await file.text();
      const r = await importPersona({ ...(/\.json$/i.test(file.name) ? { json: JSON.parse(text) } : { text }), filename: file.name });
      nav(`/tutor/courses/${encodeURIComponent(r.courseId)}`);
    } catch (e) { setImportError(e instanceof Error ? e.message : String(e)); }
    finally { setImporting(false); if (importRef.current) importRef.current.value = ""; }
  };
  useEffect(() => {
    void assertAdultDeclared().then(setAdult);
    listCourses().then((r) => setCourses(r.courses)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    fetch(`${API_BASE}/api/tutor/health`).then((r) => r.json()).then((j: { demo?: boolean }) => setDemo(!!j.demo)).catch(() => { /* 不影响 */ });
  }, []);
  const declare = async () => {
    try { const r = await declareAdult(); cacheAdult(r.adultDeclaredAt); } catch { cacheAdult(new Date().toISOString()); } // 服务端没应答也先放行：声明是告知，不是门禁
    setAdult(true);
  };
  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-900" data-testid="home">
      <header className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-4">
        <GraduationCap size={18} className="text-cyan-600" />
        <div className="flex-1 text-sm font-semibold">{t("home.title")} <span className="ml-1 text-xs font-normal text-zinc-500">{t("home.subtitle")}</span></div>
        <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">{t("app.aiBadge")}</span>
        <button type="button" onClick={() => void i18n.changeLanguage(i18n.language.startsWith("zh") ? "en" : "zh")} className="flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-0.5 text-[11px]"><Languages size={12} />{t("app.lang")}</button>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {demo && <p className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800" data-testid="demo-banner">{t("home.demoBanner")}</p>}
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">{t("course.back")}</h1>
          <div className="flex items-center gap-2">
            <Link to="/tutor/market" data-testid="home-market" className="flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700"><Store size={14} />{t("home.market")}</Link>
            <button type="button" data-testid="home-import" disabled={importing} onClick={() => importRef.current?.click()} className="flex items-center gap-1 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs text-zinc-700 disabled:opacity-40"><FileUp size={14} />{importing ? t("home.importing") : t("home.import")}</button>
            <input ref={importRef} data-testid="home-import-input" type="file" accept=".md,.json,text/markdown,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); }} />
            <Link to="/tutor/new" data-testid="home-new" className="flex items-center gap-1 rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white"><Plus size={16} />{t("home.new")}</Link>
          </div>
        </div>
        {importError && <p data-testid="home-import-error" className="mb-3 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{t("exp.importFailed", { message: importError })}</p>}
        {error && <p className="text-sm text-rose-700">{t("app.error", { message: error })}</p>}
        {!courses && !error && <p className="text-sm text-zinc-500">{t("home.loading")}</p>}
        {courses && courses.length === 0 && <p className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">{t("home.empty")}</p>}
        <ul className="grid gap-3 sm:grid-cols-2">
          {courses?.map((c) => (
            <li key={c.id} data-testid={`course-card-${c.id}`} className="rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{c.title}</div>
                  <div className="text-xs text-zinc-500">{c.subject}{c.code ? ` · ${c.code}` : ""}{c.term ? ` · ${c.term}` : ""}</div>
                </div>
                {c.run && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.run.status === "done" ? "bg-emerald-100 text-emerald-800" : "bg-cyan-100 text-cyan-800"}`}>{c.run.status === "done" ? t("home.done") : t("home.learning")}</span>}
              </div>
              <div className="mt-2 text-xs text-zinc-600">
                {c.persona ? <>{c.persona.name} · {t("course.version", { v: c.persona.version, stages: c.persona.stages })}</> : t("home.noPersona")} · {t("home.materials", { n: c.materials })}
              </div>
              {c.unsure > 0 && <div className="mt-1 text-[11px] text-amber-700">{t("home.unsure", { n: c.unsure })}</div>}
              {((c.run?.dueReviews ?? 0) > 0 || (c.run?.pendingReview ?? 0) > 0) && (
                <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
                  {(c.run?.dueReviews ?? 0) > 0 && <span data-testid="home-due" className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">{t("reviewDue.homeBadge", { n: c.run?.dueReviews })}</span>}
                  {(c.run?.pendingReview ?? 0) > 0 && <Link to={`/tutor/personas/${encodeURIComponent(c.id)}/review`} data-testid="home-pending" className="rounded-full bg-cyan-100 px-2 py-0.5 font-semibold text-cyan-800">{t("home.pendingReview", { n: c.run?.pendingReview })}</Link>}
                </div>
              )}
              <div className="mt-3 flex gap-2">
                <Link to={`/tutor/courses/${encodeURIComponent(c.id)}`} data-testid="course-open" className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-zinc-700">{t("home.open")}</Link>
                {c.persona && <Link to={`/tutor/run/${encodeURIComponent(c.id)}`} data-testid="course-learn" className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">{t("home.learn")}</Link>}
              </div>
            </li>
          ))}
        </ul>
      </main>
      {!adult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="adult-modal">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h2 className="text-base font-bold">{t("home.adultTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{t("home.adultText")}</p>
            <div className="mt-4 flex justify-end"><button type="button" data-testid="adult-ok" onClick={() => void declare()} className="rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white">{t("home.adultOk")}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
