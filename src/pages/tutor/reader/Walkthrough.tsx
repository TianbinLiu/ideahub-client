// 导学漫游的旁注（docs/08 #22、docs/02 3.15）：这一步老师说的话（say）+ 可选反问（ask）+ 就地提问栏 + 上一步 / 下一步。
// 桌面浮在高亮那一句的旁边；手机（或锚点没对上时）由宿主决定摆在哪 —— 这个组件只画内容，不知道自己在页面的哪儿。
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, MessageSquareText, Send } from "lucide-react";
import type { WalkStep } from "../types";

export function WalkthroughCard({ step, index, total, notFound, busy, onPrev, onNext, onAsk, onFinishAsk, onFinishNext, compact }: {
  step: WalkStep; index: number; total: number; notFound: boolean; busy: boolean;
  onPrev: () => void; onNext: () => void; onAsk: (text: string) => void; onFinishAsk: () => void; onFinishNext: () => void; compact?: boolean;
}) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [text, setText] = useState("");
  const last = index >= total - 1;
  const submit = () => { const v = text.trim(); if (!v) return; onAsk(v); setText(""); };
  return (
    <div data-testid="walk-popover" className={`rounded-xl border border-amber-300 bg-amber-50 shadow-xl ${compact ? "w-full" : "w-[360px] max-w-[calc(100vw-24px)]"}`}>
      <div className="flex items-center justify-between border-b border-amber-200 px-3 py-1.5 text-[11px] font-semibold text-amber-800">
        <span className="flex items-center gap-1"><MessageSquareText size={12} />{t("walk.teacherSays")} · {t("walk.step", { i: index + 1, n: total })}</span>
        {notFound && <span data-testid="walk-notfound" className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] text-amber-900">{t("walk.notFound")}</span>}
      </div>
      <div className="px-3 py-2 text-sm leading-6 text-zinc-800">
        <p data-testid="walk-say">{step.say}</p>
        {step.ask && <p className="mt-1 font-medium text-amber-900" data-testid="walk-ask">{t("walk.teacherAsks")}：{step.ask}</p>}
      </div>
      <form className="flex items-center gap-1 px-3 pb-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input data-testid="walk-input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("walk.askPlaceholder")} className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2 py-1 text-sm outline-none focus:border-amber-500" />
        <button type="submit" data-testid="walk-send" disabled={busy || !text.trim()} className="rounded-md bg-amber-600 p-1.5 text-white disabled:opacity-40" aria-label={t("walk.ask")}><Send size={14} /></button>
      </form>
      <div className="flex items-center justify-between border-t border-amber-200 px-2 py-1.5">
        <button type="button" data-testid="walk-prev" onClick={onPrev} disabled={index === 0} className="flex items-center gap-0.5 rounded-md px-2 py-1 text-xs text-amber-900 hover:bg-amber-100 disabled:opacity-30"><ChevronLeft size={14} />{t("walk.prev")}</button>
        {last ? (
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-amber-900">{t("walk.finish")}</span>
            <button type="button" data-testid="walk-finish-ask" onClick={onFinishAsk} className="rounded-md px-2 py-1 text-xs text-amber-900 hover:bg-amber-100">{t("teacher.haveQuestion")}</button>
            <button type="button" data-testid="walk-finish-next" onClick={onFinishNext} className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white">{t("teacher.next")}</button>
          </div>
        ) : (
          <button type="button" data-testid="walk-next" onClick={onNext} className="flex items-center gap-0.5 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white">{t("walk.next")}<ChevronRight size={14} /></button>
        )}
      </div>
    </div>
  );
}
