// 复习卡（docs/02 3.19）：全部阶段通过后给的一张卡 —— 圈过 / 标过没懂的锚点 + 各阶段必背；点锚点回跳。
import { useTranslation } from "react-i18next";
import type { Anchor, ReviewCard } from "../types";

export function ReviewCardView({ card, onJump, onClose }: { card: ReviewCard; onJump: (a: Anchor) => void; onClose: () => void }) {
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "tutor" });
  const Ref = ({ a }: { a: Anchor }) => <button type="button" onClick={() => onJump(a)} className="rounded bg-cyan-100 px-1.5 py-0.5 text-[11px] font-semibold text-cyan-800 hover:bg-cyan-200">{t("review.page", { n: a.page })}</button>;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 md:items-center" data-testid="review-card">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl">
        <h2 className="text-base font-bold">{t("review.title")}</h2>
        {card.done && <p className="mt-1 text-sm text-emerald-700" data-testid="review-done">{t("review.done")}</p>}
        {card.nextReview && <p className="mt-1 text-xs text-zinc-500">{t("review.nextReview", { when: new Date(card.nextReview.nextReviewAt).toLocaleString(i18n.language === "zh" ? "zh-CN" : "en") })}</p>}
        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("review.selections")}</h3>
        <ul className="mt-1 space-y-1 text-sm">{card.selections.length ? card.selections.map((s) => <li key={s.seq} className="flex items-start gap-2"><Ref a={s.anchor} /><span>「{s.anchor.quote}」{s.text ? ` — ${s.text}` : ""}</span></li>) : <li className="text-zinc-400">{t("review.none")}</li>}</ul>
        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("review.stuck")}</h3>
        <ul className="mt-1 space-y-1 text-sm">{card.stuck.length ? card.stuck.map((s, i) => <li key={i} className="flex items-start gap-2">{s.anchor && <Ref a={s.anchor} />}<span>[{s.stage_id}] {s.text}</span></li>) : <li className="text-zinc-400">{t("review.none")}</li>}</ul>
        <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t("review.memo")}</h3>
        <div className="mt-1 space-y-2">{card.mustMemorize.map((m) => (
          <div key={m.stage_id}><div className="text-xs font-semibold text-zinc-700">{m.stage_id} · {m.title}</div><ul className="ml-4 list-disc text-sm">{m.items.map((x, i) => <li key={i}>{x.text} {x.anchor && <Ref a={x.anchor} />}</li>)}</ul></div>
        ))}</div>
        <div className="mt-3 flex justify-end"><button type="button" onClick={onClose} className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white">{t("review.close")}</button></div>
      </div>
    </div>
  );
}
