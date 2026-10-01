// 自检（docs/02 3.3）：2～3 道题、答对三分之二才通过 —— 判分与翻状态都在服务端（advance()），这里只画。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Anchor, QuizReply, SelfCheck } from "../types";

type Check = SelfCheck & { from?: string; anchor?: Anchor };
/** mode="review" = 到期回访（docs/02 3.19 / 4.9）：题从复习卡 + 自检题来、不能跳过、过了显示下次回访时间、没过说清退回已讲 */
export function QuizCard({ stageTitle, checks, mode = "quiz", onSubmit, onSkip, onClose, onJumpAnchor }: { stageTitle: string; checks: Check[]; mode?: "quiz" | "review"; onSubmit: (answers: string[]) => Promise<QuizReply>; onSkip?: () => Promise<void>; onClose: () => void; onJumpAnchor?: (a: Anchor) => void }) {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "tutor" });
  const review = mode === "review";
  const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language === "zh" ? "zh-CN" : "en") : "");
  const [answers, setAnswers] = useState<string[]>(() => checks.map(() => ""));
  const [reply, setReply] = useState<QuizReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setError(null);
    try { setReply(await onSubmit(answers)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 md:items-center" data-testid="quiz-card" data-mode={mode}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
        <h2 className="text-base font-bold">{t(review ? "reviewDue.title" : "quiz.title", { title: stageTitle })}</h2>
        <p className="mt-0.5 text-xs text-zinc-500">{t(review ? "reviewDue.intro" : "quiz.intro")}</p>
        {checks.length === 0 && <p className="mt-3 text-sm text-amber-700">{t("quiz.noChecks")}</p>}
        <ol className="mt-3 space-y-3">
          {checks.map((c, i) => (
            <li key={i} className="rounded-lg border border-zinc-200 p-3">
              {(c.from === "selection" || c.from === "stuck") && <div className="mb-1 flex items-center gap-1 text-[11px] text-amber-800" data-testid="quiz-from"><span className="rounded-full bg-amber-100 px-2 py-0.5">{t(c.from === "stuck" ? "reviewDue.fromStuck" : "reviewDue.fromSelection")}</span>{c.anchor && onJumpAnchor && <button type="button" data-testid="quiz-anchor" onClick={() => onJumpAnchor(c.anchor!)} className="rounded bg-cyan-100 px-1.5 py-0.5 font-semibold text-cyan-800 hover:bg-cyan-200">{t("review.page", { n: c.anchor.page })}</button>}</div>}
              <div className="text-sm font-medium">{i + 1}. {c.q}</div>
              {!reply ? (
                <textarea data-testid={`quiz-answer-${i}`} value={answers[i]} onChange={(e) => setAnswers((a) => a.map((x, j) => (j === i ? e.target.value : x)))} rows={2} placeholder={t("quiz.answerPlaceholder")} className="mt-2 w-full resize-none rounded-md border border-zinc-300 px-2 py-1 text-sm outline-none focus:border-cyan-500" />
              ) : (
                <div className="mt-2 text-xs leading-5">
                  <div className={reply.results[i]?.correct ? "text-emerald-700" : "text-rose-700"}>{reply.results[i]?.correct ? "✓" : "✗"} {reply.results[i]?.why}{answers[i] ? ` —— 「${answers[i]}」` : ""}</div>
                  <div className="text-zinc-500">{t("quiz.expected")}：{c.a}</div>
                </div>
              )}
            </li>
          ))}
        </ol>
        {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
        {reply && (
          <div data-testid="quiz-result" data-passed={reply.passed ? "1" : "0"} className={`mt-3 rounded-lg px-3 py-2 text-sm font-medium ${reply.passed ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
            {t("quiz.result", { correct: reply.correct, asked: reply.asked })} · {review ? (reply.passed ? t("reviewDue.passed", { when: when(reply.nextReviewAt) }) : t("reviewDue.failed")) : reply.passed ? t("quiz.passed") : t("quiz.failed")}
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          {onSkip && !review && !reply && <button type="button" data-testid="quiz-skip" onClick={() => void onSkip()} className="mr-auto rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600">{t("quiz.skip")}</button>}
          <button type="button" data-testid="quiz-close" onClick={onClose} className="rounded-full px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100">{t("quiz.close")}</button>
          {!reply && checks.length > 0 && <button type="button" data-testid="quiz-submit" disabled={busy} onClick={() => void submit()} className="rounded-full bg-cyan-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">{t("quiz.submit")}</button>}
          {reply && !reply.passed && !review && <button type="button" data-testid="quiz-retry" onClick={() => { setReply(null); }} className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white">{t("quiz.retry")}</button>}
        </div>
      </div>
    </div>
  );
}
