// 拖入教材 + 每份勾来源 + 真进度（docs/02 §1 用户故事、1.3–1.5、1.7、1.11、1.13）。向导第 2 步与课程页「再传几份」共用。
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Trash2, AlertTriangle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";
import { LICENSES, type LicenseSource } from "../../../api/tutor";
import type { WizardFile } from "../new/wizardStore";
import { isSupported } from "../../../extract";

const NOTICE_KEY = "tutor.noTrainNoticeAt"; // 1.11：首次上传前展示一次
const MAX_MB = Number((import.meta.env.VITE_TUTOR_MATERIAL_MAX_MB as string | undefined) || 100);

export function MaterialUploader({ files, onAdd, onUpdate, onRemove, defaultLicense }: { files: WizardFile[]; onAdd: (list: File[]) => void; onUpdate: (key: string, patch: Partial<WizardFile>) => void; onRemove: (key: string) => void; defaultLicense?: LicenseSource | "" }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [notice, setNotice] = useState<File[] | null>(null);
  const [bulkLicense, setBulkLicense] = useState<LicenseSource | "">(defaultLicense ?? "");
  const accept = (list: File[]) => {
    const ok = list.filter((f) => isSupported(f.name) && f.size <= MAX_MB * 1024 * 1024);
    if (!ok.length) return;
    let seen = false;
    try { seen = !!localStorage.getItem(NOTICE_KEY); } catch { /* 隐私模式 */ }
    if (!seen) { setNotice(ok); return; }
    onAdd(ok);
  };
  const ackNotice = () => { try { localStorage.setItem(NOTICE_KEY, new Date().toISOString()); } catch { /* 隐私模式 */ } if (notice) onAdd(notice); setNotice(null); };
  const applyBulk = (v: LicenseSource | "") => { setBulkLicense(v); if (v) for (const f of files) if (!f.license && (f.status === "extracted" || f.status === "queued" || f.status === "extracting")) onUpdate(f.key, { license: v }); };
  const statusLine = (f: WizardFile) => {
    switch (f.status) {
      case "queued": return t("wiz.files.hashing");
      case "extracting": return f.pages ? t("wiz.files.extracting", { page: f.page ?? 0, pages: f.pages }) : t("wiz.files.hashing");
      case "extracted": return `${t("wiz.files.done", { pages: f.pages ?? 0, chars: f.chars ?? 0 })} · ${f.license ? "" : t("wiz.files.waiting")}`;
      case "uploading": return f.progress >= 1 ? t("wiz.files.confirming") : t("wiz.files.uploading", { pct: Math.round(f.progress * 100) });
      case "done": return t("wiz.files.done", { pages: f.pages ?? 0, chars: f.chars ?? 0 });
      case "duplicate": return t("wiz.files.duplicate");
      case "failed": return t("wiz.files.failed", { message: f.error ?? "" });
    }
  };
  return (
    <div className="space-y-3" data-testid="uploader">
      <div data-testid="dropzone" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); accept([...e.dataTransfer.files]); }} onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center text-sm ${drag ? "border-cyan-500 bg-cyan-50" : "border-zinc-300 bg-white hover:border-zinc-400"}`}>
        <FileUp size={22} className="text-zinc-500" />
        <span className="text-zinc-600">{t("wiz.files.drop", { mb: MAX_MB })}</span>
        <span className="rounded-full bg-zinc-900 px-3 py-1 text-xs font-semibold text-white">{t("wiz.files.pick")}</span>
        <input ref={inputRef} data-testid="file-input" type="file" multiple accept=".pdf,.pptx,.docx,.md,.txt" className="hidden" onChange={(e) => { accept([...(e.target.files || [])]); e.target.value = ""; }} />
      </div>
      <p className="text-[11px] text-zinc-500">{t("wiz.files.pdfHint")}</p>
      {files.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-zinc-600">{t("wiz.files.license")}（{t("wiz.files.licPlaceholder")}）</span>
          <select data-testid="bulk-license" value={bulkLicense} onChange={(e) => applyBulk(e.target.value as LicenseSource | "")} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
            <option value="">{t("wiz.files.licPlaceholder")}</option>
            {LICENSES.map((l) => <option key={l} value={l}>{t(`wiz.files.lic_${l}`)}</option>)}
          </select>
        </div>
      )}
      <ul className="space-y-2">
        {files.map((f) => (
          <li key={f.key} data-testid="file-row" data-status={f.status} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm">
            <div className="flex items-center gap-2">
              {f.status === "done" || f.status === "duplicate" ? <CheckCircle2 size={16} className="text-emerald-600" /> : f.status === "failed" ? <AlertTriangle size={16} className="text-rose-600" /> : f.status === "extracted" ? <CircleDashed size={16} className="text-amber-500" /> /* 抽完了、等人选来源：不是在忙，别转圈 */ : <Loader2 size={16} className="animate-spin text-cyan-600" />}
              <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
              <span className="text-[11px] text-zinc-500">{(f.bytes / 1024 / 1024).toFixed(1)} MB</span>
              <select data-testid="file-license" value={f.license} disabled={f.status === "done" || f.status === "duplicate" || f.status === "uploading"} onChange={(e) => onUpdate(f.key, { license: e.target.value as LicenseSource | "" })} className="rounded-md border border-zinc-300 px-2 py-1 text-xs">
                <option value="">{t("wiz.files.licPlaceholder")}</option>
                {LICENSES.map((l) => <option key={l} value={l}>{t(`wiz.files.lic_${l}`)}</option>)}
              </select>
              <button type="button" aria-label={t("wiz.files.remove")} onClick={() => onRemove(f.key)} className="rounded p-1 text-zinc-500 hover:bg-zinc-100"><Trash2 size={14} /></button>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-zinc-600" data-testid="file-status">{statusLine(f)}</div>
            {(f.status === "extracting" || f.status === "uploading") && <div className="mt-1 h-1.5 overflow-hidden rounded bg-zinc-200"><div className="h-full bg-cyan-500 transition-all" style={{ width: `${Math.round(f.progress * 100)}%` }} /></div>}
            {f.warnings.map((w, i) => <div key={i} className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">{w}</div>)}
            {f.license === "unsure" && <div className="mt-1 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800" data-testid="unsure-note">{t("wiz.files.unsureNote")}</div>}
          </li>
        ))}
      </ul>
      {notice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" data-testid="notice-modal">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-base font-bold">{t("wiz.files.notice")}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-700">{t("wiz.files.noticeText")}</p>
            <div className="mt-4 flex justify-end"><button type="button" data-testid="notice-ok" onClick={ackNotice} className="rounded-full bg-cyan-600 px-4 py-1.5 text-sm font-semibold text-white">{t("wiz.files.noticeOk")}</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
