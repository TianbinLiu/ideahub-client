// /admin/tutor-metrics：M3「与启梦互通」的三条度量（tutor 仓 docs/06 §5.1「度量（每条都能防刷）」+ §5.2「三条度量各有一条可跑的查询并出过一次数」）。
// 数字全在服务端算（GET /api/tutor/admin/metrics：引流按来源 / 跨产品激活按 user._id 去重 / 反哺 + fork 7 天），这里只画；主站管理页的深色皮。
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getTutorMetrics, type TutorMetrics } from "../../api/tutor";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;

function Stat({ testid, label, hint, value, sub }: { testid: string; label: string; hint: string; value: string; sub: string }) {
  return (
    <section data-testid={testid} className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="text-xs font-semibold text-gray-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white" data-testid={`${testid}-value`}>{value}</div>
      <div className="mt-0.5 text-xs text-gray-300">{sub}</div>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-500">{hint}</p>
    </section>
  );
}

export default function TutorMetricsAdminPage() {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor.metrics" });
  const [data, setData] = useState<TutorMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // busy 只归「刷新」那颗键管：挂载那一次不碰它（effect 里同步 setState 会多渲染一轮，react-hooks/set-state-in-effect 拦的就是这个）
  const load = useCallback(() => getTutorMetrics().then((r) => { setData(r); setError(null); }).catch((e: unknown) => setError(msg(e))), []);
  useEffect(() => { void load(); }, [load]);
  const refresh = () => { setBusy(true); void load().finally(() => setBusy(false)); };
  return (
    <div className="mx-auto max-w-5xl p-4" data-testid="metrics-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-400">{t("subtitle")}</p>
        </div>
        <button type="button" data-testid="metrics-refresh" disabled={busy} onClick={refresh} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-200 disabled:opacity-40">{busy ? t("loading") : t("refresh")}</button>
      </div>
      {error && <p data-testid="metrics-error" className="mt-4 rounded-md border border-rose-800 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {data && (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Stat testid="metrics-activation" label={t("activation")} hint={t("activationHint")} value={pct(data.activation.ratio)} sub={t("activationSub", { cross: data.activation.crossUsers, all: data.activation.tutorUsers })} />
            <Stat testid="metrics-companion" label={t("companion")} hint={t("companionHint")} value={String(data.companion.accounts)} sub={t("companionSub", { personas: data.companion.personas })} />
            <Stat testid="metrics-fork" label={t("fork", { days: data.fork7d.days ?? 7 })} hint={t("forkHint", { days: data.fork7d.days ?? 7 })} value={pct(data.fork7d.ratio)} sub={t("forkSub", { activated: data.fork7d.activated, forks: data.fork7d.forks })} />
          </div>
          {data.activation.note && <p className="mt-2 text-[11px] text-gray-500">{data.activation.note}</p>}
          <section className="mt-6 rounded-xl border border-gray-800 bg-gray-900 p-4">
            <h2 className="text-sm font-semibold text-gray-200">{t("referrals", { days: data.days })}</h2>
            <p className="mt-1 text-[11px] text-gray-500">{t("referralsHint")}</p>
            {data.referrals.length === 0 ? (
              <p data-testid="metrics-referrals-empty" className="mt-3 text-sm text-gray-500">{t("empty")}</p>
            ) : (
              <table className="mt-3 w-full text-left text-sm text-gray-200">
                <thead className="text-xs text-gray-500"><tr><th className="py-1 pr-3 font-medium">{t("colFrom")}</th><th className="py-1 pr-3 font-medium">{t("colCount")}</th><th className="py-1 font-medium">{t("colUsers")}</th></tr></thead>
                <tbody>
                  {data.referrals.map((r) => (
                    <tr key={r.from} data-testid="metrics-referral-row" data-from={r.from} className="border-t border-gray-800">
                      <td className="py-1.5 pr-3 font-mono text-xs">{r.from}</td>
                      <td className="py-1.5 pr-3" data-testid="metrics-referral-count">{r.count}</td>
                      <td className="py-1.5">{r.users}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
      {!data && !error && <p className="mt-4 text-sm text-gray-500">{t("loading")}</p>}
    </div>
  );
}
