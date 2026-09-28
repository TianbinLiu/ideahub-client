// 向导的表单与长活都在 store、退出再进原样在（docs/02 2.1，照 App personaWizardStore 的骨架）；持久化到 localStorage（tutor.wizard.v1）。
// ★ File 对象本身不能持久化：刷新后还没传完的文件条目丢掉（已传完的在服务端，条目保留），页面上会说一句。
import { useSyncExternalStore } from "react";
import type { CourseInput, LicenseSource, Questionnaire, Job } from "../../../api/tutor";

export type WizardFileStatus = "queued" | "extracting" | "extracted" | "uploading" | "done" | "duplicate" | "failed";
export type WizardFile = { key: string; name: string; bytes: number; ext: string; sha?: string; license: LicenseSource | ""; status: WizardFileStatus; progress: number; page?: number; pages?: number; chars?: number; warnings: string[]; error?: string };
export type WizardJob = { id: string; status: Job["status"]; progress: Job["progress"]; result?: Job["result"]; error?: string | null; failures: string[] };
export type WizardState = { step: 1 | 2 | 3 | 4 | 5; course: CourseInput; courseId: string | null; files: WizardFile[]; questionnaire: Questionnaire; job: WizardJob | null; updatedAt: number };

const KEY = "tutor.wizard.v1";
/** 化名池：首字都不是常见姓氏（原型三位老师「老包 / 阿黛 / 哨兵」的路子），不会撞上 realNameHint */
export const ALIASES = ["老包", "阿岚", "小竹", "老树", "阿珂", "老石", "阿澄", "小满", "老槐", "阿蕨"];
export const randomAlias = () => ALIASES[Math.floor(Math.random() * ALIASES.length)];

const initial = (): WizardState => ({
  step: 1,
  course: { title: "", subject: "", code: "", term: "", policy: { ai: "limited", homework_mode: "principles_only", allowed_uses: [], text: "" }, key_dates: [] },
  courseId: null,
  files: [],
  questionnaire: { name: randomAlias(), style: "calc_first", strictness: "firm" },
  job: null,
  updatedAt: Date.now(),
});
function load(): WizardState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const s = JSON.parse(raw) as WizardState; return { ...initial(), ...s, files: (s.files || []).filter((f) => f.status === "done" || f.status === "duplicate") }; }
  } catch { /* 坏了就从头来 */ }
  return initial();
}
let state: WizardState = load();
const listeners = new Set<() => void>();
/** 还没传完的 File 对象（不进 localStorage） */
export const pendingFiles = new Map<string, File>();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 配额 / 隐私模式 */ } };
const emit = () => { persist(); listeners.forEach((l) => l()); };

export function setWizard(patch: Partial<WizardState> | ((s: WizardState) => Partial<WizardState>)) {
  state = { ...state, ...(typeof patch === "function" ? patch(state) : patch), updatedAt: Date.now() };
  emit();
}
export function updateWizardFile(key: string, patch: Partial<WizardFile>) { setWizard((s) => ({ files: s.files.map((f) => (f.key === key ? { ...f, ...patch } : f)) })); }
export function removeWizardFile(key: string) { pendingFiles.delete(key); setWizard((s) => ({ files: s.files.filter((f) => f.key !== key) })); }
export function addWizardFiles(list: File[]) {
  const added: WizardFile[] = [];
  for (const file of list) {
    const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    pendingFiles.set(key, file);
    added.push({ key, name: file.name, bytes: file.size, ext: (/\.[a-z0-9]+$/i.exec(file.name)?.[0] || "").toLowerCase(), license: "", status: "queued", progress: 0, warnings: [] });
  }
  setWizard((s) => ({ files: [...s.files, ...added] }));
}
export function resetWizard() { state = initial(); pendingFiles.clear(); emit(); }
export function useWizard(): WizardState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l); }; }, () => state, () => state);
}
