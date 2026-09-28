// /tutor/market/:id：老师详情（tutor 仓 docs/02 §7）= 卡 + 简介 + tag + ① 教学面 + ③ 课程地图预览（只读，不给 ② ④ 正文）+ ⑥ 复刻指南 + 发布版 / AI 标识
// + 讨论（官网 CommentThread，targetType=persona 原样用）+ 作者的其它老师。「开始跟这位老师学」= POST /api/tutor/runs { persona }（教材不复制、进度全 pending）→ 进学习页；
// 举报走 POST /api/reports（targetType persona，2026-09-28 加）。游客可看，两个动作要登录（去 /login?next= 回来）。
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Download, Flag, Lock, Star } from "lucide-react";
import { ApiError, getMarketDetail, reportPersona, startLearning, REPORT_REASONS, type MarketDetail } from "../../api/tutor";
import { useAuth } from "../../authContext";
import CommentThread from "../../components/CommentThread";

const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

function ReportDialog({ targetId, onClose }: { targetId: string; onClose: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setBusy(true); setError(null);
    try { await reportPersona(targetId, reason, detail.trim()); setDone(true); }
    catch (e) { setError(e instanceof ApiError && e.status === 409 ? t("report.already") : msg(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="report-dialog">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <h2 className="text-base font-bold">{t("report.title")}</h2>
        {done ? (
          <p data-testid="report-done" className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{t("report.done")}</p>
        ) : (
          <>
            <label className="mt-3 block text-xs"><span className="font-semibold text-zinc-600">{t("report.reason")}</span>
              <select data-testid="report-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm">{REPORT_REASONS.map((r) => <option key={r} value={r}>{t(`report.r_${r}`)}</option>)}</select>
            </label>
            <label className="mt-3 block text-xs"><span className="font-semibold text-zinc-600">{t("report.detail")}</span>
              <textarea data-testid="report-detail" value={detail} maxLength={500} rows={3} onChange={(e) => setDetail(e.target.value)} className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm" />
            </label>
            {error && <p data-testid="report-error" className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>}
          </>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" data-testid="report-close" onClick={onClose} className="rounded-full border border-zinc-300 px-3 py-1 text-xs">{done ? t("report.close") : t("report.cancel")}</button>
          {!done && <button type="button" data-testid="report-submit" disabled={busy} onClick={() => void submit()} className="rounded-full bg-rose-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">{t("report.submit")}</button>}
        </div>
      </div>
    </div>
  );
}

export function TutorDetailPage() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const [d, setD] = useState<MarketDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const load = useCallback(() => getMarketDetail(id).then((r) => { setD(r); setMissing(false); }).catch((e: unknown) => { if (e instanceof ApiError && e.status === 404) setMissing(true); else setError(msg(e)); }), [id]);
  useEffect(() => { void load(); }, [load]);
  const toLogin = () => nav(`/login?next=${encodeURIComponent(loc.pathname)}`);
  const mode: "start" | "continue" | "own" = !d ? "start" : d.relation.isOwner ? "own" : d.relation.learning ? "continue" : "start";
  const start = async () => {
    if (!d) return;
    if (!user) { toLogin(); return; }
    if (mode === "own" && d.relation.ownCourse) { nav(`/tutor/courses/${encodeURIComponent(d.relation.ownCourse)}`); return; }
    if (mode === "continue" && d.relation.learning) { nav(`/tutor/run/${encodeURIComponent(d.relation.learning.courseId)}`); return; }
    setBusy(true); setNotice(null);
    try { const r = await startLearning(id); nav(`/tutor/run/${encodeURIComponent(r.courseId)}`); }
    catch (e) { setNotice(msg(e)); }
    finally { setBusy(false); }
  };
  if (missing) return <div className="min-h-dvh bg-zinc-100 p-6 text-sm text-zinc-700" data-testid="detail-missing">{t("detail.missing")} <Link to="/tutor/market" className="underline underline-offset-2">{t("detail.backMarket")}</Link></div>;
  if (error) return <div className="p-6 text-sm text-rose-700">{t("app.error", { message: error })}</div>;
  if (!d) return <div className="p-6 text-sm text-zinc-500">{t("app.loading")}</div>;
  const { persona: p, preview, release } = d;
  const startLabel = busy ? t("detail.starting") : !user ? t("detail.loginToStart") : mode === "own" ? t("detail.own") : mode === "continue" ? t("detail.continue") : t("detail.start");
  return (
    <div className="min-h-dvh bg-zinc-100 text-zinc-900" data-testid="detail-page">
      <header className="flex h-12 items-center gap-2 border-b border-zinc-200 bg-white px-4">
        <Link to="/tutor/market" className="flex items-center gap-1 text-xs text-zinc-600"><ArrowLeft size={14} />{t("detail.backMarket")}</Link>
        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{p.name}</div>
        <span className="rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">{t("app.aiBadge")}</span>
      </header>
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {d.takedown && <p data-testid="detail-takedown" className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{t("publish.takenDown", { reason: d.takedown.reason || "—" })}</p>}
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-14 w-14 flex-none items-center justify-center rounded-2xl bg-zinc-100 text-3xl">{p.coverEmoji}</div>
            <div className="min-w-0 flex-1">
              <h1 data-testid="detail-name" className="text-lg font-bold">{p.name}</h1>
              <div className="text-xs text-zinc-500">{p.subject} · {t("market.by", { name: p.author.username || "—" })}{release && <> · <span data-testid="detail-version">{t("market.version", { v: release.version })}</span></>}</div>
              {p.description && <p className="mt-1 text-sm text-zinc-700">{p.description}</p>}
              {p.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.tags.map((x) => <Link key={x} to={`/tutor/market?tag=${encodeURIComponent(x)}`} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">#{x}</Link>)}</div>}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><Download size={12} />{t("market.downloads", { n: p.stats.downloadCount })}</span>
            <span className="flex items-center gap-1"><Star size={12} />{p.stats.ratingCount ? t("market.rating", { avg: p.stats.ratingAvg.toFixed(1), n: p.stats.ratingCount }) : t("market.noRating")}</span>
            <span className="ml-auto flex gap-2">
              <button type="button" data-testid="detail-report" onClick={() => (user ? setReporting(true) : toLogin())} className="flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-700"><Flag size={12} />{t("detail.report")}</button>
              <button type="button" data-testid="detail-start" data-mode={mode} disabled={busy} onClick={() => void start()} className="rounded-full bg-cyan-600 px-4 py-1 text-xs font-semibold text-white disabled:opacity-40">{startLabel}</button>
            </span>
          </div>
          {notice && <p data-testid="detail-notice" className="mt-2 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800">{notice}</p>}
          <p className="mt-2 text-[11px] text-zinc-500">{t("detail.materialsNote")}</p>
        </section>
        {preview && (
          <>
            <section className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="detail-card">
              <div className="mb-2 text-xs font-semibold text-zinc-600">{t("detail.card")}</div>
              <dl className="space-y-2 text-sm">
                {preview.card.who && <div><dt className="text-[11px] text-zinc-500">{t("detail.who")}</dt><dd className="whitespace-pre-wrap leading-6">{preview.card.who}</dd></div>}
                {preview.card.teaching_style && <div><dt className="text-[11px] text-zinc-500">{t("detail.style")}</dt><dd className="whitespace-pre-wrap leading-6">{preview.card.teaching_style}</dd></div>}
                {preview.card.catchphrases.length > 0 && <div><dt className="text-[11px] text-zinc-500">{t("detail.catchphrases")}</dt><dd className="flex flex-wrap gap-1">{preview.card.catchphrases.map((c, i) => <span key={i} className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-900">「{c}」</span>)}</dd></div>}
                {preview.card.hard_rules.length > 0 && <div data-testid="detail-rules"><dt className="text-[11px] text-zinc-500">{t("detail.rules")}</dt><dd><ul className="mt-1 space-y-0.5 text-xs">{preview.card.hard_rules.map((r, i) => <li key={i} className="flex items-start gap-1">{r.locked && <Lock size={11} className="mt-0.5 flex-none text-zinc-500" />}<span>{r.text}</span></li>)}</ul></dd></div>}
              </dl>
            </section>
            <section className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="detail-map">
              <div className="mb-2 text-xs font-semibold text-zinc-600">{t("detail.map", { n: preview.stages.length })}</div>
              <ol className="space-y-1.5 text-sm">{preview.stages.map((s, i) => <li key={s.stage_id} data-testid="detail-stage" className="flex gap-2"><span className="w-5 flex-none text-right text-xs text-zinc-400">{i + 1}</span><span className="min-w-0"><span className="font-medium">{s.title}</span>{s.summary && <span className="text-zinc-600"> — {s.summary}</span>}<span className="ml-1 text-[11px] text-zinc-500">{t("detail.counts", { steps: s.steps, memo: s.memo, checks: s.checks })}</span></span></li>)}</ol>
            </section>
            {preview.guide && <details className="rounded-xl border border-zinc-200 bg-white p-4"><summary className="cursor-pointer text-xs font-semibold text-zinc-600">{t("detail.guide")}</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-5 text-zinc-700">{preview.guide}</pre></details>}
          </>
        )}
        {release && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-600" data-testid="detail-release">
            <div className="font-semibold text-zinc-600">{t("detail.release")}</div>
            <div className="mt-1 font-mono text-[11px]">{t("detail.releaseLine", { v: release.version, at: new Date(release.publishedAt).toLocaleString(), sha: release.sha256.slice(0, 16) })}</div>
            {release.note && <div className="mt-1">{release.note}</div>}
            <div className="mt-2 rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-cyan-900">{t("detail.aigc", { id: release.produceId || "—" })}</div>
          </section>
        )}
        {d.others.length > 0 && (
          <section className="rounded-xl border border-zinc-200 bg-white p-4" data-testid="detail-others">
            <div className="mb-2 text-xs font-semibold text-zinc-600">{t("detail.others")}</div>
            <ul className="flex flex-wrap gap-2">{d.others.map((o) => <li key={o.id}><Link to={`/tutor/market/${encodeURIComponent(o.id)}`} className="flex items-center gap-1 rounded-full border border-zinc-300 px-3 py-1 text-xs">{o.coverEmoji} {o.name}<span className="text-zinc-400">· {o.subject}</span></Link></li>)}</ul>
          </section>
        )}
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <div className="mb-2 text-xs font-semibold text-zinc-600">{t("detail.comments")}</div>
          <CommentThread targetType="persona" targetId={p.id} canModerate={d.relation.isOwner} />
        </section>
      </main>
      {reporting && <ReportDialog targetId={p.id} onClose={() => setReporting(false)} />}
    </div>
  );
}
