// 老师面板（docs/02 §3）：对话（SSE 逐字）、👍👎、常驻「AI 生成」、圈选芯片、「直接讲」要先自解释一句、「有问题吗，还是下一阶段」。
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, ThumbsUp, ThumbsDown, X, Sparkles, NotebookPen } from "lucide-react";
import { renderTeacherText } from "./messageText";
import type { Turn } from "../types";
import type { ReaderSelection } from "../reader/useSelection";

export type SendOpts = { direct?: boolean; selfExplain?: string };

export function TeacherPanel({ turns, streamingText, busy, demo, selection, hasSteps, onClearSelection, onSend, onNext, onTeach, onJump, onFeedback, onDistill, distilling, inputRef, notice, children }: {
  turns: Turn[]; streamingText: string | null; busy: boolean; demo: boolean; selection: ReaderSelection | null; hasSteps: boolean;
  onClearSelection: () => void; onSend: (text: string, opts?: SendOpts) => void; onNext: () => void; onTeach: () => void; onJump: (page: number) => void;
  onFeedback: (seq: number, value: 1 | -1 | null) => void; onDistill?: () => void; distilling?: boolean; inputRef: React.RefObject<HTMLTextAreaElement | null>; notice?: string | null; children?: React.ReactNode;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [text, setText] = useState("");
  const [directOpen, setDirectOpen] = useState(false);
  const [selfExplain, setSelfExplain] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [turns.length, streamingText]);
  const lastAssistant = [...turns].reverse().find((x) => x.role === "assistant");
  const canDirect = !!selection || lastAssistant?.kind === "answer";
  const submit = () => { const v = text.trim(); if (!v || busy) return; onSend(v); setText(""); };
  const submitDirect = () => { const v = selfExplain.trim(); if (!v) return; onSend(text.trim() || "直接讲这一处", { direct: true, selfExplain: v }); setSelfExplain(""); setDirectOpen(false); setText(""); };
  return (
    <div className="flex h-full min-h-0 flex-col bg-white" data-testid="teacher-panel">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles size={15} className="text-cyan-600" />{t("teacher.title")}</div>
        <div className="flex items-center gap-1.5">
          {demo && <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600" title={t("app.demo")}>demo</span>}
          <span data-testid="aigc-badge" className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">{t("app.aiBadge")}</span>
        </div>
      </div>
      {children}
      <div ref={listRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3" data-testid="teacher-messages">
        {turns.length === 0 && !streamingText && <p className="text-xs leading-5 text-zinc-500">{t("teacher.empty")}</p>}
        {turns.map((m) => (
          <div key={m.seq} id={m.seq > 0 ? `turn-${m.seq}` : undefined} data-testid={`teacher-msg-${m.role}`} data-kind={m.kind} data-seq={m.seq} className={`flex scroll-mt-2 rounded-lg transition-colors ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-6 ${m.role === "user" ? "bg-cyan-600 text-white" : "bg-zinc-100 text-zinc-800"}`}>
              {m.selection?.anchor && <div className={`mb-1 text-[10px] ${m.role === "user" ? "text-cyan-100" : "text-zinc-500"}`}>{t("teacher.selectedFrom", { n: m.selection.anchor.page })} · 「{m.selection.anchor.quote}」</div>}
              {m.flags?.policyBlocked && <div className="mb-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800">{t("teacher.policy")}</div>}
              <div className="whitespace-pre-wrap">{m.role === "assistant" ? renderTeacherText(m.text, onJump) : m.text}</div>
              {m.role === "assistant" && m.seq > 0 && m.kind !== "quizResult" && (
                <div className="mt-1 flex items-center gap-1 text-zinc-400">
                  <button type="button" aria-label={t("teacher.up")} data-testid="fb-up" onClick={() => onFeedback(m.seq, m.feedback === 1 ? null : 1)} className={`rounded p-0.5 hover:bg-zinc-200 ${m.feedback === 1 ? "text-cyan-700" : ""}`}><ThumbsUp size={12} /></button>
                  <button type="button" aria-label={t("teacher.down")} data-testid="fb-down" onClick={() => onFeedback(m.seq, m.feedback === -1 ? null : -1)} className={`rounded p-0.5 hover:bg-zinc-200 ${m.feedback === -1 ? "text-rose-600" : ""}`}><ThumbsDown size={12} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
        {streamingText !== null && (
          <div className="flex justify-start" data-testid="teacher-streaming">
            <div className="max-w-[92%] whitespace-pre-wrap rounded-2xl bg-zinc-100 px-3 py-2 text-sm leading-6 text-zinc-800">{streamingText || <span className="text-zinc-400">{t("teacher.thinking")}</span>}</div>
          </div>
        )}
      </div>
      {notice && <div className="border-t border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800" data-testid="notice">{notice}</div>}
      <div className="border-t border-zinc-200 px-3 py-2">
        {selection && (
          <div className="mb-1.5 flex items-center gap-1 text-[11px] text-cyan-800" data-testid="sel-chip">
            <span className="truncate rounded-full bg-cyan-50 px-2 py-0.5">{t("teacher.selectedFrom", { n: selection.anchor.page })} · 「{selection.anchor.quote}」</span>
            <button type="button" onClick={onClearSelection} aria-label={t("teacher.clearSelection")} className="rounded p-0.5 hover:bg-zinc-100"><X size={12} /></button>
          </div>
        )}
        {directOpen && (
          <form className="mb-1.5 flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); submitDirect(); }}>
            <input data-testid="self-explain" value={selfExplain} onChange={(e) => setSelfExplain(e.target.value)} placeholder={t("teacher.selfExplainPlaceholder")} className="min-w-0 flex-1 rounded-md border border-zinc-300 px-2 py-1 text-xs outline-none focus:border-cyan-500" />
            <button type="submit" disabled={!selfExplain.trim() || busy} className="rounded-md bg-zinc-800 px-2 py-1 text-xs text-white disabled:opacity-40">{t("teacher.direct")}</button>
          </form>
        )}
        <form className="flex items-end gap-1.5" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <textarea ref={inputRef} data-testid="teacher-input" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }} rows={2} placeholder={t("teacher.placeholder")} className="min-w-0 flex-1 resize-none rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm outline-none focus:border-cyan-500" />
          <button type="submit" data-testid="teacher-send" disabled={busy || !text.trim()} className="rounded-lg bg-cyan-600 p-2 text-white disabled:opacity-40" aria-label={t("teacher.send")}><Send size={16} /></button>
        </form>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {canDirect && <button type="button" data-testid="direct-btn" onClick={() => setDirectOpen((v) => !v)} className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50">{t("teacher.direct")}</button>}
          {!hasSteps && <button type="button" data-testid="teach-btn" onClick={onTeach} disabled={busy} className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">{t("teacher.teachStage")}</button>}
          {onDistill && <button type="button" data-testid="distill-btn" onClick={onDistill} disabled={busy || !!distilling} title={t("distill.btn")} className="flex items-center gap-1 rounded-full border border-zinc-300 px-2.5 py-0.5 text-[11px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40"><NotebookPen size={11} />{distilling ? t("distill.running") : t("distill.btn")}</button>}
          <button type="button" data-testid="quiz-open" onClick={onNext} disabled={busy} className="ml-auto rounded-full bg-zinc-900 px-3 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40">{t("teacher.next")}</button>
        </div>
      </div>
    </div>
  );
}
