// 课程页的「导出 / 导入」卡（docs/02 §5：导出 = 六段 Markdown + 显式 / 隐式标识，永不含教材；每次导出留痕；导入回读成一条 import 修订）
// + 「AI 使用记录」下载（docs/05 §5.4：工具名 / 版本 / 时间 / 用途四项）。泄漏核查、标识、留痕全在服务端，这里只画回包。
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Download, FileUp, ScrollText } from "lucide-react";
import { downloadExport, downloadUsage, importPersona, listExports, type ExportAudience, type ExportFormat, type ExportRecord, type ExportResult } from "../../api/tutor";

export function ExportCard({ courseId, onImported }: { courseId: string; onImported: () => void }) {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "tutor" });
  const nav = useNavigate();
  const [audience, setAudience] = useState<ExportAudience>("market");
  const [keepStuck, setKeepStuck] = useState(false);
  const [keepQa, setKeepQa] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ exports: ExportRecord[]; retainDays: number } | null>(null);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [usageMsg, setUsageMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const loadHistory = useCallback(() => listExports(courseId).then((r) => setHistory({ exports: r.exports, retainDays: r.retainDays })).catch(() => setHistory(null)), [courseId]);
  useEffect(() => { void loadHistory(); }, [loadHistory]);
  const fmt = (iso: string) => new Date(iso).toLocaleString(i18n.language === "zh" ? "zh-CN" : "en");
  const doExport = async (format: ExportFormat) => {
    setBusy(format); setError(null); setResult(null);
    try { const r = await downloadExport(courseId, { format, audience, keepStuckPoints: keepStuck, keepStudentQa: keepQa }); setResult(r); await loadHistory(); }
    catch (e) { setError(t("exp.failed", { message: e instanceof Error ? e.message : String(e) })); }
    finally { setBusy(null); }
  };
  const doImport = async (file: File) => {
    setBusy("import"); setImportMsg(null);
    try {
      const text = await file.text();
      const body = /\.json$/i.test(file.name) ? { json: JSON.parse(text) } : { text };
      const r = await importPersona({ courseId, ...body, filename: file.name });
      if (r.created) { setImportMsg({ ok: true, text: t("exp.importedNew", { name: r.name, v: r.version }) }); nav(`/tutor/courses/${encodeURIComponent(r.courseId)}`); return; }
      setImportMsg({ ok: true, text: t("exp.imported", { name: r.name, v: r.version }) });
      onImported();
    } catch (e) { setImportMsg({ ok: false, text: t("exp.importFailed", { message: e instanceof Error ? e.message : String(e) }) }); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };
  const doUsage = async (format: "md" | "csv") => {
    setBusy(`usage-${format}`); setUsageMsg(null);
    try { const r = await downloadUsage(courseId, { format }); setUsageMsg(t("exp.usageDone", { name: r.filename, n: r.rows })); }
    catch (e) { setUsageMsg(t("exp.failed", { message: e instanceof Error ? e.message : String(e) })); }
    finally { setBusy(null); }
  };
  const btn = "flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-50 disabled:opacity-40";
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="export-card">
      <div className="text-xs font-semibold text-zinc-600">{t("exp.title")}</div>
      <p className="mt-1 text-[11px] leading-5 text-zinc-500">{t("exp.hint")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-zinc-600">{t("exp.audience")}</span>
        <select data-testid="export-audience" value={audience} onChange={(e) => setAudience(e.target.value as ExportAudience)} className="max-w-full rounded-md border border-zinc-300 px-2 py-1 text-xs">
          <option value="market">{t("exp.market")}</option>
          <option value="self">{t("exp.self")}</option>
        </select>
      </div>
      {audience === "market" && (
        <div className="mt-2 flex flex-wrap gap-4 text-[11px] text-zinc-600">
          <label className="flex items-center gap-1"><input type="checkbox" checked={keepStuck} onChange={(e) => setKeepStuck(e.target.checked)} />{t("exp.keepStuck")}</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={keepQa} onChange={(e) => setKeepQa(e.target.checked)} />{t("exp.keepQa")}</label>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(["md", "json", "zip"] as ExportFormat[]).map((f) => <button key={f} type="button" data-testid={`export-${f}`} disabled={!!busy} onClick={() => void doExport(f)} className={btn}><Download size={12} />{t(`exp.dl_${f}`)}</button>)}
      </div>
      {result && <p data-testid="export-result" className="mt-2 break-all rounded-md bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">{t("exp.done", { name: result.filename, checksum: result.checksum.replace(/^sha256:/, "").slice(0, 12), pid: result.produceId, clean: t(result.cleanCheck === "passed" ? "exp.clean_passed" : "exp.clean_skipped") })}</p>}
      {error && <p data-testid="export-error" className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] text-rose-800">{error}</p>}
      <div className="mt-3">
        <div className="text-[11px] font-semibold text-zinc-600">{t("exp.history", { days: history?.retainDays ?? 180 })}</div>
        <ul className="mt-1 space-y-0.5 text-[11px] text-zinc-600" data-testid="export-history">
          {history && history.exports.length === 0 && <li className="text-zinc-400">{t("exp.noHistory")}</li>}
          {history?.exports.slice(0, 5).map((r) => <li key={r.id} data-testid="export-row" className="flex flex-wrap gap-2"><span>{fmt(r.at)}</span><span className="rounded-full bg-zinc-100 px-1.5">{r.audience === "market" ? "market" : "self"}</span><span>.{r.format}</span><span>v{r.version}</span><span className="font-mono">{r.checksum.replace(/^sha256:/, "").slice(0, 12)}</span><span className="text-zinc-400">{r.cleanCheck === "passed" ? "✓" : "—"}</span></li>)}
        </ul>
      </div>
      <div className="mt-4 border-t border-zinc-100 pt-3">
        <div className="text-[11px] font-semibold text-zinc-600">{t("exp.import")}</div>
        <p className="text-[11px] text-zinc-500">{t("exp.importHint")}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" data-testid="import-btn" disabled={!!busy} onClick={() => fileRef.current?.click()} className={btn}><FileUp size={12} />{t("exp.importBtn")}</button>
          <input ref={fileRef} data-testid="import-input" type="file" accept=".md,.json,text/markdown,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); }} />
        </div>
        {importMsg && <p data-testid="import-notice" data-ok={importMsg.ok ? "1" : "0"} className={`mt-2 rounded-md px-3 py-2 text-[11px] ${importMsg.ok ? "bg-emerald-50 text-emerald-800" : "border border-rose-300 bg-rose-50 text-rose-800"}`}>{importMsg.text}</p>}
      </div>
      <div className="mt-4 border-t border-zinc-100 pt-3">
        <div className="flex items-center gap-1 text-[11px] font-semibold text-zinc-600"><ScrollText size={12} />{t("exp.usage")}</div>
        <p className="text-[11px] text-zinc-500">{t("exp.usageHint")}</p>
        <div className="mt-1.5 flex gap-2">
          <button type="button" data-testid="usage-md" disabled={!!busy} onClick={() => void doUsage("md")} className={btn}><Download size={12} />{t("exp.usage_md")}</button>
          <button type="button" data-testid="usage-csv" disabled={!!busy} onClick={() => void doUsage("csv")} className={btn}><Download size={12} />{t("exp.usage_csv")}</button>
        </div>
        {usageMsg && <p data-testid="usage-notice" className="mt-2 text-[11px] text-zinc-600">{usageMsg}</p>}
      </div>
    </section>
  );
}
