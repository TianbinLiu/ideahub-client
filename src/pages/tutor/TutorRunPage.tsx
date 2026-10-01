// 学习页 /tutor/run/:id（docs/02 §3、docs/05 §5.6、docs/08 #15–#22）：
//   桌面左教材右老师；手机教材全屏 + 老师底部抽屉。进入阶段 k → 按 ④ 的讲解步跳页 / 高亮 / 旁注；「下一步」只改本地 stepIdx
//   （PATCH progress 合并发送、不计费）；圈选 → 动作条；最后一步 →「有问题吗，还是下一阶段」→ 自检 → 通过才进下一阶段；全部通过 → 复习卡。
// ★ 阶段状态一个字不在这里判：翻页、圈选、看完讲解步都不改状态（docs/02 3.20），passed 只来自服务端的自检结果。
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpenText, GraduationCap, Languages, MessageSquare, X } from "lucide-react";
import { getMaterialText, getReviewCard, getReviewQuiz, getRevisions, getRun, materialFileUrl, patchProgress, postDistill, postFeedback, postMark, postQuiz, postSkip, reviewRevision, revertOps, streamTurn, type RunBundle, type TurnBody } from "../../api/tutor";
import type { Anchor, DueReview, Material, Page, ReviewCard, ReviewQuestion, RevisionView, StageProgress, Turn, WalkStep } from "./types";
import { PdfDocumentView } from "./reader/PdfDocumentView";
import { CardPageView } from "./reader/CardPageView";
import type { ReaderApi } from "./reader/readerApi";
import { useSelection, type ReaderSelection } from "./reader/useSelection";
import { SelectionBar } from "./reader/SelectionBar";
import { WalkthroughCard } from "./reader/Walkthrough";
import type { Pin } from "./reader/TeacherPin";
import { TeacherPanel, type SendOpts } from "./teacher/TeacherPanel";
import { QuizCard } from "./teacher/QuizCard";
import { ReviewCardView } from "./teacher/ReviewCardView";
import { LearnedCard } from "./teacher/LearnedCard";
import { ReviewDueBanner } from "./teacher/ReviewDueBanner";
import { StageList } from "./teacher/StageList";
import { useMediaQuery } from "./useMediaQuery";

const PROGRESS_DEBOUNCE_MS = 1200; // 「下一步」连点只发一次 PATCH（docs/05 §5.6「可合并发送」）
const TWO_HOURS_MS = 2 * 60 * 60 * 1000; // 拟人化办法第十八条，自愿采用（docs/02 3.6）
const AUTO_DISTILL_POLL_MS = 1500; // 自动蒸馏在服务端 done 之后异步跑：轮询最新修订，出现新的一条就弹卡（演示模式几百毫秒，模型路几秒到几十秒）
const AUTO_DISTILL_POLLS = 40;
const isPdf = (m: Material) => m.ext === ".pdf";
const WALK_CARD_W = 360;
/** 旁注摆在高亮那一行的右侧（放得下时，不盖正文）；右边不够 360px 才摆到那一行下面。坐标是阅读面滚动内容的坐标。 */
function walkCardPos(rect: { top: number; left: number; width: number; height: number }, containerWidth: number) {
  const right = rect.left + rect.width + 16;
  if (right + WALK_CARD_W <= containerWidth - 12) return { top: Math.max(4, rect.top - 8), left: right };
  return { top: rect.top + rect.height + 10, left: Math.max(8, Math.min(rect.left, containerWidth - WALK_CARD_W - 12)) };
}

export function TutorRunPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation(undefined, { keyPrefix: "tutor" });
  const nav = useNavigate();
  const isMobile = useMediaQuery("(max-width: 767px)");
  const [bundle, setBundle] = useState<RunBundle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, StageProgress>>({});
  const [status, setStatus] = useState<"active" | "done">("active");
  const [stageId, setStageId] = useState<string | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [materialShort, setMaterialShort] = useState<string | null>(null);
  const [pagesBySha, setPagesBySha] = useState<Record<string, Page[]>>({});
  const [readerReady, setReaderReady] = useState(0);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [walk, setWalk] = useState<{ found: boolean; rect?: { top: number; left: number; width: number; height: number } } | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [review, setReview] = useState<ReviewCard | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [pendingSel, setPendingSel] = useState<ReaderSelection | null>(null);
  const [learned, setLearned] = useState<{ revision: RevisionView; auto: boolean } | null>(null);
  // 自动蒸馏不弹模态卡（会盖住正在读的教材与旁注），只在老师面板顶上放一条「老师刚自动整理了一次 · 查看」；手动「整理一下」才当场弹卡
  const [learnedToast, setLearnedToast] = useState<RevisionView | null>(null);
  const [distilling, setDistilling] = useState(false);
  const [dueReviews, setDueReviews] = useState<DueReview[]>([]);
  const [pendingReview, setPendingReview] = useState(0);
  const [docVersion, setDocVersion] = useState<number | null>(null);
  const [reviewQuiz, setReviewQuiz] = useState<{ stage: string; title: string; questions: ReviewQuestion[] } | null>(null);
  const latestRev = useRef<string | null>(null); // 轮询自动蒸馏用：上一次见到的最新修订 id
  const pollRun = useRef(0);
  const readerRef = useRef<ReaderApi | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stepRun = useRef(0);
  const progressTimer = useRef(0);
  const dirtyStep = useRef<{ stage: string; stepIdx: number } | null>(null);

  const doc = bundle?.doc ?? null;
  const materials = useMemo(() => bundle?.materials ?? [], [bundle]);
  const material = useMemo(() => materials.find((m) => m.short === materialShort) ?? null, [materials, materialShort]);
  const stages = useMemo(() => doc?.map.stages ?? [], [doc]); // ★ `?? []` 直接写在渲染里每次都是新数组，下面两个 useMemo 就等于没记
  const currentStageId = useMemo(() => stages.find((s) => progress[s.stage_id]?.status !== "passed")?.stage_id ?? null, [stages, progress]);
  const stage = stages.find((s) => s.stage_id === stageId) ?? null;
  const distill = stageId && doc ? doc.distill[stageId] : undefined;
  const steps: WalkStep[] = useMemo(() => distill?.walkthrough ?? [], [distill]);
  const step = steps[stepIdx];
  const stepCounts = useMemo(() => Object.fromEntries(stages.map((s) => [s.stage_id, doc?.distill[s.stage_id]?.walkthrough?.length ?? 0])), [stages, doc]);
  const { sel, clear: clearSel } = useSelection(scrollRef, material, material ? pagesBySha[material.sha] : undefined);

  const say = useCallback((msg: string | null) => { setNotice(msg); if (msg) window.setTimeout(() => setNotice((m) => (m === msg ? null : m)), 5000); }, []);

  // 装载
  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const b = await getRun(id);
      setBundle(b);
      setProgress(b.run.progress);
      setStatus(b.run.status);
      setTurns(b.turns.filter((x) => x.role === "user" || x.role === "assistant"));
      setDueReviews(b.run.dueReviews ?? []);
      setPendingReview(b.run.pendingReview ?? 0);
      setDocVersion(b.doc.version);
      getRevisions(id).then((r) => { latestRev.current = r.revisions[0]?.id ?? null; setPendingReview(r.pending); }).catch(() => { /* 没有修订也能上课 */ });
      const first = b.run.currentStage ?? b.doc.map.stages[0]?.stage_id ?? null;
      setStageId(first);
      setStepIdx(first ? b.run.progress[first]?.stepIdx ?? 0 : 0);
      const firstAnchor = first ? b.doc.distill[first]?.walkthrough?.find((w) => w.anchor)?.anchor : undefined;
      const pick = (firstAnchor && b.materials.find((m) => m.short === firstAnchor.material && m.present)) || b.materials.find((m) => m.present) || b.materials[0] || null;
      setMaterialShort(pick?.short ?? null);
      for (const m of b.materials) getMaterialText(m.textUrl).then((r) => setPagesBySha((p) => ({ ...p, [m.sha]: r.pages }))).catch(() => { /* 没有块级文本也能读 */ });
    } catch (e) { setLoadError(e instanceof Error ? e.message : String(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { const tm = window.setTimeout(() => say(t("teacher.twoHours")), TWO_HOURS_MS); return () => window.clearTimeout(tm); }, [say, t]);

  // 漫游：阶段 / 步 / 阅读面就绪 变了就跳页 + 高亮；找不到 → found:false（页不跳、不报错，旁注挪到老师面板）
  useEffect(() => {
    const run = ++stepRun.current;
    readerRef.current?.clear();
    if (!step) { setWalk(null); return; }
    const a = step.anchor;
    if (!a) { setWalk({ found: false }); return; }
    const m = materials.find((x) => x.short === a.material);
    if (!m || !m.present) { setWalk({ found: false }); return; }
    if (m.short !== materialShort) { setMaterialShort(m.short); return; } // 换教材后 readerReady 变了会再进来
    const api = readerRef.current;
    if (!api || api.pageCount === 0) return;
    void api.highlight(a).then((r) => { if (stepRun.current === run) setWalk(r.found ? { found: true, rect: r.rect } : { found: false }); });
  }, [step, materials, materialShort, readerReady]);

  // 进度合并发送
  const flushProgress = useCallback(() => {
    const d = dirtyStep.current;
    if (!d) return;
    dirtyStep.current = null;
    patchProgress(id, d.stage, d.stepIdx).then((r) => { setProgress(r.progress); setStatus(r.status); }).catch(() => { /* 进度丢了下次再补 */ });
  }, [id]);
  const goStep = useCallback((i: number) => {
    if (!stageId) return;
    const n = Math.max(0, Math.min(i, Math.max(steps.length - 1, 0)));
    setStepIdx(n);
    dirtyStep.current = { stage: stageId, stepIdx: n };
    window.clearTimeout(progressTimer.current);
    progressTimer.current = window.setTimeout(flushProgress, PROGRESS_DEBOUNCE_MS);
  }, [stageId, steps.length, flushProgress]);
  useEffect(() => { const h = () => { if (document.visibilityState === "hidden") { window.clearTimeout(progressTimer.current); flushProgress(); } }; document.addEventListener("visibilitychange", h); return () => document.removeEventListener("visibilitychange", h); }, [flushProgress]);

  const selectStage = (sid: string) => { setStageId(sid); setStepIdx(progress[sid]?.stepIdx ?? 0); setQuizOpen(false); };

  // 蒸馏（docs/02 §4）：手动「整理一下」当场弹卡；自动触发（8 轮 / 阶段完成 / 30 分钟）在服务端 done 之后异步跑，这里轮询最新修订
  const showRevision = useCallback((revision: RevisionView, auto: boolean, version?: number) => { latestRev.current = revision.id; setLearned({ revision, auto }); if (version) setDocVersion(version); }, []);
  const watchAutoDistill = useCallback(() => {
    const run = ++pollRun.current;
    let n = 0;
    const tick = async () => {
      if (pollRun.current !== run) return;
      try {
        const r = await getRevisions(id);
        setPendingReview(r.pending);
        const top = r.revisions[0];
        if (top && top.id !== latestRev.current && top.kind === "distill") { latestRev.current = top.id; if (r.version) setDocVersion(r.version); setLearnedToast(top); return; }
      } catch { /* 下一拍再试 */ }
      if (++n < AUTO_DISTILL_POLLS) window.setTimeout(() => void tick(), AUTO_DISTILL_POLL_MS);
    };
    window.setTimeout(() => void tick(), 300);
  }, [id]);
  const onDistill = async () => {
    if (distilling) return;
    setDistilling(true);
    try {
      const r = await postDistill(id);
      setPendingReview(r.pendingReview);
      if (r.status === "done" && r.revision) showRevision(r.revision, false, r.version);
      else if (r.status === "nothing") say(t("distill.nothing"));
      else if (r.status === "empty") { latestRev.current = r.revision?.id ?? latestRev.current; say(t("distill.emptyBatch")); }
      else say(t("distill.failed", { n: r.errors?.length ?? 0, charged: bundle?.run.demo ? "" : t("distill.charged") }));
    } catch (e) { say(t("distill.error", { message: e instanceof Error ? e.message : String(e) })); } finally { setDistilling(false); }
  };
  const [learnedBusy, setLearnedBusy] = useState(false);
  const learnedAct = async (fn: () => Promise<{ revision: RevisionView; pendingReview: number; version?: number }>, okMsg: (v?: number) => string) => {
    setLearnedBusy(true);
    try { const r = await fn(); setPendingReview(r.pendingReview); setLearned((l) => (l ? { ...l, revision: r.revision } : l)); if (r.version) setDocVersion(r.version); say(okMsg(r.version)); }
    catch (e) { say(t("distill.error", { message: e instanceof Error ? e.message : String(e) })); } finally { setLearnedBusy(false); }
  };
  const jumpTurn = (seq: number) => {
    if (isMobile) setTeacherOpen(true);
    window.setTimeout(() => { const el = document.getElementById(`turn-${seq}`); if (!el) { say(`t:${seq}`); return; } el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("bg-amber-100"); window.setTimeout(() => el.classList.remove("bg-amber-100"), 1600); }, 60);
  };
  // 到期回访（docs/02 4.9 / 3.19）：只出题不重讲；题从复习卡 + 自检题来
  const startReview = async (sid: string) => {
    try { const r = await getReviewQuiz(id, sid); setReviewQuiz({ stage: r.stage, title: r.title, questions: r.questions }); setQuizOpen(false); }
    catch (e) { say(t("distill.error", { message: e instanceof Error ? e.message : String(e) })); }
  };
  const onReviewSubmit = async (answers: string[]) => {
    if (!reviewQuiz) throw new Error("no review");
    const r = await postQuiz(id, reviewQuiz.stage, answers, true);
    setProgress(r.progress); setStatus(r.status); setDueReviews(r.dueReviews ?? []);
    if (r.distillQueued) watchAutoDistill();
    window.setTimeout(() => {
      setReviewQuiz(null);
      if (!r.passed && r.nextStage) { setStageId(r.nextStage); setStepIdx(0); } // 回访没过：退回已讲，老师从第 1 步再带一遍
    }, 1800);
    return r;
  };
  const jumpTo = useCallback((page: number) => { readerRef.current?.jumpTo(page); if (isMobile) setTeacherOpen(false); }, [isMobile]);
  const jumpAnchor = useCallback((a: Anchor) => { const m = materials.find((x) => x.short === a.material); if (m && m.short !== materialShort) setMaterialShort(m.short); void readerRef.current?.highlight(a, "tutor-pin"); setReview(null); }, [materials, materialShort]);

  // 一轮（SSE）
  const send = useCallback(async (body: TurnBody) => {
    if (busy) { say(t("teacher.busy")); return; }
    setBusy(true);
    if (body.kind !== "teach") setTurns((ts) => [...ts, { seq: -Date.now(), role: "user", kind: body.kind === "ask" ? "ask" : "quiz", text: body.text || "", stage_id: body.stage, selection: body.selection, at: new Date().toISOString() }]);
    setStreamingText("");
    try {
      await streamTurn(id, body, {
        onToken: (tk) => setStreamingText((s) => (s ?? "") + tk),
        onDone: (d) => { setTurns((ts) => [...ts, { seq: d.seq, role: "assistant", kind: d.kind, text: d.text, stage_id: d.stage, flags: d.flags, demo: d.demo, at: new Date().toISOString() }]); setProgress(d.progress); setStatus(d.status); if (d.distillQueued) watchAutoDistill(); },
      });
    } catch (e) {
      setTurns((ts) => [...ts, { seq: -Date.now(), role: "assistant", kind: "error", text: t("teacher.failed", { message: e instanceof Error ? e.message : String(e) }), stage_id: body.stage, at: new Date().toISOString() }]);
    } finally { setStreamingText(null); setBusy(false); }
  }, [busy, id, say, t, watchAutoDistill]);
  const onSend = (text: string, opts?: SendOpts) => { if (!stageId) return; const selection = pendingSel ? { anchor: pendingSel.anchor, text: pendingSel.text } : undefined; setPendingSel(null); clearSel(); void send({ kind: "ask", stage: stageId, text, selection, ...(opts?.direct ? { direct: true, selfExplain: opts.selfExplain } : {}) }); };
  const onWalkAsk = (text: string) => { if (!stageId || !step) return; void send({ kind: "ask", stage: stageId, text, selection: step.anchor ? { anchor: step.anchor } : undefined }); if (isMobile) setTeacherOpen(true); };

  // 圈选动作
  const askSel = () => { if (!sel) return; setPendingSel(sel); document.getSelection()?.removeAllRanges(); if (isMobile) setTeacherOpen(true); window.setTimeout(() => inputRef.current?.focus(), 50); };
  const quizSel = () => { if (!sel || !stageId) return; const s = { anchor: sel.anchor, text: sel.text }; clearSel(); void send({ kind: "quiz-from-selection", stage: stageId, selection: s }); if (isMobile) setTeacherOpen(true); };
  const markSel = async (kind: "select" | "memorize") => {
    if (!sel || !stageId) return;
    const s = { anchor: sel.anchor, text: sel.text };
    clearSel();
    try { await postMark(id, kind, stageId, s); say(t(kind === "select" ? "sel.stuckDone" : "sel.memoDone")); } catch (e) { say(t("sel.failed", { message: e instanceof Error ? e.message : String(e) })); }
  };

  // 自检
  const onQuizSubmit = async (answers: string[]) => {
    if (!stageId) throw new Error("no stage");
    const r = await postQuiz(id, stageId, answers);
    setProgress(r.progress); setStatus(r.status); setDueReviews(r.dueReviews ?? []);
    if (r.distillQueued) watchAutoDistill();
    setTurns((ts) => [...ts, { seq: -Date.now(), role: "assistant", kind: "quizResult", text: `${t("quiz.result", { correct: r.correct, asked: r.asked })} · ${r.passed ? t("quiz.passed") : t("quiz.failed")}`, stage_id: stageId, at: new Date().toISOString() }]);
    if (r.passed) window.setTimeout(() => { setQuizOpen(false); if (r.status === "done") void getReviewCard(id).then((x) => setReview(x.card)); else if (r.nextStage) { setStageId(r.nextStage); setStepIdx(0); } }, 900);
    return r;
  };
  const onSkip = async () => {
    if (!stageId) return;
    const r = await postSkip(id, stageId);
    setProgress(r.progress); setStatus(r.status); setQuizOpen(false);
    if (r.status === "done") void getReviewCard(id).then((x) => setReview(x.card)); else if (r.nextStage) { setStageId(r.nextStage); setStepIdx(0); }
  };

  const pins: Pin[] = useMemo(() => {
    if (!doc || !material) return [];
    const out: Pin[] = [];
    for (const [sid, st] of Object.entries(doc.distill)) {
      for (const x of st.must_memorize) if (typeof x !== "string" && x.anchor && x.anchor.material === material.short) out.push({ kind: "memo", text: x.text, anchor: x.anchor, stage_id: sid });
      for (const x of st.pitfalls) if (typeof x !== "string" && x.anchor && x.anchor.material === material.short) out.push({ kind: "pitfall", text: x.text, anchor: x.anchor, stage_id: sid });
    }
    return out;
  }, [doc, material]);

  if (loadError) return <div className="flex h-dvh flex-col items-center justify-center gap-3 p-6 text-sm text-zinc-700"><p>{t("app.error", { message: loadError })}</p><button type="button" onClick={() => void load()} className="rounded-full bg-zinc-900 px-4 py-1 text-xs text-white">{t("app.retry")}</button></div>;
  if (!bundle || !doc) return <div className="flex h-dvh items-center justify-center text-sm text-zinc-500">{t("app.loading")}</div>;

  const walkCard = step && stageId ? (
    <WalkthroughCard step={step} index={stepIdx} total={steps.length} notFound={walk?.found === false} busy={busy} compact={isMobile || walk?.found === false}
      onPrev={() => goStep(stepIdx - 1)} onNext={() => goStep(stepIdx + 1)} onAsk={onWalkAsk}
      onFinishAsk={() => { if (isMobile) setTeacherOpen(true); window.setTimeout(() => inputRef.current?.focus(), 50); }} onFinishNext={() => { flushProgress(); setQuizOpen(true); }} />
  ) : null;
  const walkInReader = !!walk?.found && !!walk.rect && !isMobile;
  const teacher = (
    <TeacherPanel turns={turns} streamingText={streamingText} busy={busy} demo={bundle.run.demo} selection={pendingSel} hasSteps={steps.length > 0}
      onClearSelection={() => setPendingSel(null)} onSend={onSend} onNext={() => { flushProgress(); setQuizOpen(true); }} onTeach={() => stageId && void send({ kind: "teach", stage: stageId })}
      onJump={jumpTo} onFeedback={(seq, v) => { setTurns((ts) => ts.map((x) => (x.seq === seq ? { ...x, feedback: v } : x))); void postFeedback(id, seq, v).catch(() => { /* 反馈丢了不打扰 */ }); }}
      onDistill={() => void onDistill()} distilling={distilling} inputRef={inputRef} notice={notice}>
      {learnedToast && (
        <div data-testid="learned-toast" className="flex flex-wrap items-center gap-2 border-b border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">
          <span className="min-w-0 flex-1">{t("distill.auto", { reason: t(`distill.reason_${learnedToast.source.reason || "manual"}`) })} · {learnedToast.summary}</span>
          <button type="button" data-testid="learned-open" onClick={() => { setLearned({ revision: learnedToast, auto: true }); setLearnedToast(null); }} className="rounded-full bg-cyan-600 px-3 py-0.5 text-[11px] font-semibold text-white">{t("distill.view")}</button>
          <button type="button" onClick={() => setLearnedToast(null)} aria-label={t("distill.close")} className="rounded p-0.5 text-cyan-800 hover:bg-cyan-100"><X size={12} /></button>
        </div>
      )}
      <ReviewDueBanner due={dueReviews} busy={busy} onStart={(sid) => void startReview(sid)} />
      {walkCard && !walkInReader && !isMobile && <div className="border-b border-zinc-200 p-2" data-testid="walk-in-panel">{walkCard}</div>}
    </TeacherPanel>
  );
  const readerBody = !material ? (
    <div className="p-6 text-sm text-zinc-600" data-testid="reader-empty">{t("reader.noMaterial")}</div>
  ) : !material.present ? (
    <div className="p-6 text-sm text-zinc-600" data-testid="reader-missing">{t("reader.noMaterial")}</div>
  ) : isPdf(material) ? (
    <PdfDocumentView key={material.sha} ref={readerRef} url={materialFileUrl(material)} pages={pagesBySha[material.sha]} pins={pins} scrollRef={scrollRef} onReady={() => setReaderReady((x) => x + 1)} onError={(m) => setReaderError(m)} />
  ) : pagesBySha[material.sha] ? (
    <CardPageView key={material.sha} ref={readerRef} pages={pagesBySha[material.sha]} ext={material.ext} pins={pins} scrollRef={scrollRef} />
  ) : (
    <div className="p-6 text-sm text-zinc-500">{t("app.loading")}</div>
  );
  // 文字卡就绪：pages 到了就算
  const cardReadyKey = material && !isPdf(material) && pagesBySha[material.sha] ? material.sha : "";

  return (
    <div className="flex h-dvh flex-col bg-zinc-100 text-zinc-900" data-testid="tutor-run" data-status={status} data-stage={stageId ?? ""} data-step={stepIdx} data-card-ready={cardReadyKey}>
      <header className="flex h-12 flex-none items-center gap-2 border-b border-zinc-200 bg-white px-3">
        <Link to={`/tutor/courses/${encodeURIComponent(id)}`} className="flex items-center" aria-label={t("course.back")}><GraduationCap size={18} className="text-cyan-600" /></Link>
        <div className="min-w-0 flex-1 truncate text-sm font-semibold">{doc.name} · {doc.subject} <span className="ml-1 text-[11px] font-normal text-zinc-500" data-testid="doc-version">{t("app.version", { v: docVersion ?? doc.version })}</span></div>
        {stage && <div className="hidden truncate text-xs text-zinc-600 md:block" data-testid="stage-title">{stage.stage_id} · {stage.title}</div>}
        {pendingReview > 0 && <Link to={`/tutor/personas/${encodeURIComponent(id)}/review`} data-testid="pending-review-link" className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-900">{t("revisions.openN", { n: pendingReview })}</Link>}
        {status === "done" && <button type="button" data-testid="review-open" onClick={() => void getReviewCard(id).then((x) => setReview(x.card))} className="rounded-full bg-emerald-600 px-3 py-0.5 text-[11px] font-semibold text-white">{t("review.open")}</button>}
        <button type="button" onClick={() => void i18n.changeLanguage(i18n.language.startsWith("zh") ? "en" : "zh")} className="flex items-center gap-1 rounded-full border border-zinc-300 px-2 py-0.5 text-[11px] text-zinc-700" aria-label="language"><Languages size={12} />{t("app.lang")}</button>
      </header>
      <div className="flex min-h-0 flex-1 md:grid md:grid-cols-[minmax(0,1fr)_400px]">
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {materials.length > 1 && (
            <div className="flex flex-none items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-2 py-1 text-[11px]">
              <BookOpenText size={12} className="text-zinc-500" />
              {materials.map((m) => <button key={m.sha} type="button" onClick={() => setMaterialShort(m.short)} className={`rounded-full px-2 py-0.5 ${m.short === materialShort ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700"}`}>{m.name}{m.present ? "" : " ⚠"}</button>)}
            </div>
          )}
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable]" data-testid="reader-scroll">
            {readerError ? <div className="p-6 text-sm text-rose-700">{t("reader.pdfFailed", { message: readerError })}</div> : readerBody}
            {walkInReader && walk?.rect && (
              <div className="absolute z-30" style={walkCardPos(walk.rect, scrollRef.current?.clientWidth ?? 800)}>{walkCard}</div>
            )}
            {sel && !isMobile && <SelectionBar sel={sel} mobile={false} busy={busy} onAsk={askSel} onQuiz={quizSel} onStuck={() => void markSel("select")} onMemo={() => void markSel("memorize")} />}
          </div>
          {sel && isMobile && <SelectionBar sel={sel} mobile busy={busy} onAsk={askSel} onQuiz={quizSel} onStuck={() => void markSel("select")} onMemo={() => void markSel("memorize")} />}
          {isMobile && !teacherOpen && dueReviews.length > 0 && (
            <div className="absolute inset-x-0 top-0 z-20"><ReviewDueBanner due={dueReviews} busy={busy} onStart={(sid) => void startReview(sid)} /></div>
          )}
          {isMobile && walkCard && !teacherOpen && (
            <div className="absolute inset-x-2 bottom-14 z-20" data-testid="walk-sheet">{walkCard}</div>
          )}
          {isMobile && (
            <button type="button" data-testid="teacher-toggle" onClick={() => setTeacherOpen((v) => !v)} className="absolute bottom-3 right-3 z-40 flex h-11 w-11 items-center justify-center rounded-full bg-cyan-600 text-white shadow-lg" aria-label={t("teacher.title")}>{teacherOpen ? <X size={18} /> : <MessageSquare size={18} />}</button>
          )}
        </section>
        {!isMobile && (
          <aside className="flex min-h-0 flex-col border-l border-zinc-200 bg-white">
            <details className="border-b border-zinc-200 px-3 py-2" open={false}>
              <summary className="cursor-pointer text-xs font-semibold text-zinc-600">{t("stages.title")} · {stages.filter((s) => progress[s.stage_id]?.status === "passed").length}/{stages.length}</summary>
              <div className="mt-2 max-h-56 overflow-y-auto"><StageList stages={stages} progress={progress} currentId={currentStageId} viewingId={stageId} stepCounts={stepCounts} onSelect={selectStage} /></div>
            </details>
            <div className="min-h-0 flex-1">{teacher}</div>
          </aside>
        )}
      </div>
      {isMobile && teacherOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 h-[62dvh] rounded-t-2xl border-t border-zinc-200 bg-white shadow-2xl" data-testid="teacher-drawer">
          <details className="border-b border-zinc-200 px-3 py-1.5"><summary className="cursor-pointer text-xs font-semibold text-zinc-600">{t("stages.title")}</summary><div className="mt-1 max-h-40 overflow-y-auto"><StageList stages={stages} progress={progress} currentId={currentStageId} viewingId={stageId} stepCounts={stepCounts} onSelect={selectStage} /></div></details>
          <div className="h-[calc(62dvh-40px)]">{teacher}</div>
          {walkCard && walk?.found === false && <div className="absolute inset-x-2 top-10 z-10">{walkCard}</div>}
        </div>
      )}
      {quizOpen && stage && <QuizCard stageTitle={stage.title} checks={distill?.self_checks ?? []} onSubmit={onQuizSubmit} onSkip={onSkip} onClose={() => setQuizOpen(false)} />}
      {reviewQuiz && <QuizCard key={reviewQuiz.stage} mode="review" stageTitle={reviewQuiz.title} checks={reviewQuiz.questions} onSubmit={onReviewSubmit} onClose={() => setReviewQuiz(null)} onJumpAnchor={(a) => { setReviewQuiz(null); jumpAnchor(a); }} />}
      {review && <ReviewCardView card={review} onJump={jumpAnchor} onClose={() => setReview(null)} />}
      {learned && (
        <LearnedCard revision={learned.revision} auto={learned.auto} version={docVersion ?? undefined} busy={learnedBusy}
          onAccept={(opId) => void learnedAct(() => reviewRevision(id, learned.revision.id, { accept: [opId] }), (v) => (v ? t("distill.version", { v }) : t("distill.done")))}
          onReject={(opId) => void learnedAct(() => reviewRevision(id, learned.revision.id, { reject: [opId] }), () => t("distill.done"))}
          onRevert={(opId) => void learnedAct(() => revertOps(id, learned.revision.id, [opId]), () => t("distill.reverted"))}
          onJump={(seq) => { setLearned(null); jumpTurn(seq); }} onOpenAll={() => nav(`/tutor/personas/${encodeURIComponent(id)}/review`)} onClose={() => setLearned(null)} />
      )}
    </div>
  );
}
