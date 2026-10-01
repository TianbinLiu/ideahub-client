// 与 docs/03（格式 1.1）/ docs/05 §3 对齐的形状；只声明学习页用到的字段。服务端多回的字段一律忽略、少回的判否定。
export type Anchor = { material: string; page: number; chunk?: string; start?: number; end?: number; quote: string };
export type WalkStep = { say: string; ask?: string; anchor?: Anchor };
export type Anchored = string | { text: string; anchor?: Anchor };
export type SelfCheck = { q: string; a: string; kind: "calc" | "concept" | "debug"; rubric?: string };
export type Stage = { stage_id: string; week?: number | string; title: string; status: string; key_date?: string; summary?: string };
export type DistillStage = {
  title?: string;
  method: string;
  walkthrough?: WalkStep[];
  must_memorize: Anchored[];
  self_checks: SelfCheck[];
  student_qa: { q: string; a: string }[];
  pitfalls: Anchored[];
};
export type TutorDoc = {
  id: string;
  name: string;
  subject: string;
  format: string;
  version: number;
  card: { who: string; catchphrases: string[]; teaching_style: string; hard_rules: { text: string; locked: boolean; from?: string }[]; greeting?: string };
  map: { stages: Stage[]; key_dates: { label: string; at: string; kind: string }[]; source_material_hashes: string[] };
  distill: Record<string, DistillStage>;
  profile: { stuck_points: { stage_id: string; text: string; anchor?: Anchor }[] };
  policy?: { ai?: string; homework_mode?: string; text?: string };
};
export type StageStatus = "pending" | "taught" | "passed";
export type StageProgress = { status: StageStatus; stepIdx: number; quiz?: { correct: number; asked: number; at: string }; nextReviewAt?: string; passedAt?: string; reviewRound?: number; lastReviewAt?: string };
/** 到期回访（docs/02 4.9）：已通过且 nextReviewAt 已过的阶段 */
export type DueReview = { stage_id: string; title: string; nextReviewAt: string; reviewRound: number; overdueDays: number };
/** 回访题：先出学生圈过 / 标过没懂的那一处，再用自检题补足（docs/02 3.19） */
export type ReviewQuestion = SelfCheck & { from: "selection" | "stuck" | "self_check" | "must_memorize"; anchor?: Anchor };
/** 修订记录里的一条 op（docs/03 §7.4）：status 是它现在的处境 */
export type RevisionOpStatus = "applied" | "pending" | "rejected" | "reverted" | "noop" | "skipped";
export type RevisionOp = { opId: string; op: string; path: string; status: RevisionOpStatus; mode: "auto" | "pending"; evidence: number[]; rationale?: string; anchor?: Anchor; value: unknown; text: string; stage: string | null; stageTitle: string; reviewed_at?: string; reverted_at?: string };
export type RevisionView = { id: string; kind: string; summary: string; review: string; by: string; created_at: string; source: { turn_from?: number; turn_to?: number; reason?: string; mode?: string; stage?: string; rejected?: string[] }; of?: string; ops: RevisionOp[] };
export type Learned = { applied: number; pending: number; noop: number; rejected: number };
export type DistillReply = { ok: true; status: "done" | "empty" | "failed" | "nothing"; why?: string; errors?: string[]; window: { from: number; to: number; exchanges: number }; revision: RevisionView | null; learned: Learned | null; pendingReview: number; version: number };
export type Run = {
  id: string;
  status: "active" | "done";
  progress: Record<string, StageProgress>;
  currentStage: string | null;
  usage: { turns: number; tokens: number };
  lastTurnSeq: number;
  demo: boolean;
  startedAt?: string;
  doneAt?: string;
  dueReviews?: DueReview[];
  pendingReview?: number;
  distill?: { upTo: number; lastAt?: string; count?: number; failedFrom?: number };
};
export type Material = { sha: string; short: string; name: string; ext: string; units: number; chars: number; present: boolean; url: string; textUrl: string };
export type Selection = { anchor: Anchor; text?: string };
export type TurnFlags = { homeworkDetected?: boolean; policyBlocked?: boolean };
export type Turn = {
  seq: number;
  role: "user" | "assistant";
  kind: string;
  text: string;
  stage_id: string;
  selection?: Selection;
  flags?: TurnFlags;
  feedback?: 1 | -1 | null;
  demo?: boolean;
  at: string;
  results?: QuizResult[];
  /** 本地占位：正在流入的那一条 */
  streaming?: boolean;
};
export type Page = { idx: number; title?: string; blocks: { hash: string; text: string; bbox?: number[] }[] };
export type QuizResult = { q: string; kind?: string; expected: string; given: string; correct: boolean; why: string };
export type QuizReply = { ok: true; results: QuizResult[]; correct: number; asked: number; passed: boolean; review?: boolean; progress: Record<string, StageProgress>; status: Run["status"]; changed: string[]; nextStage: string | null; nextReviewAt?: string | null; dueReviews?: DueReview[]; distillQueued?: boolean };
export type ReviewCard = {
  done: boolean;
  doneAt?: string;
  selections: { seq: number; kind: string; stage_id: string; at: string; anchor: Anchor; text: string }[];
  stuck: { stage_id: string; text: string; anchor?: Anchor }[];
  mustMemorize: { stage_id: string; title: string; status: StageStatus; items: { text: string; anchor?: Anchor }[] }[];
  nextReview: { stage_id: string; nextReviewAt: string } | null;
};
