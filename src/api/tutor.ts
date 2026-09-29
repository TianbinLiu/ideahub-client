/**
 * tutor 端点的请求层（docs/05 §2.3：官网仓里单开 `src/api/tutor.ts`，不进 2747 行的 api.ts）。
 * 契约：docs/05 §5.6 / docs/06 §3.2；本地参考实现 src/server/devServer.mjs。
 * ★ 判「这台服务器有没有这条路」看 Content-Type 不看状态码（SPA 回退给 200 + HTML，App CLAUDE.md 坑表）。
 */
import { createSseParser, type SseEvent } from "../companion/sse";
import { API_BASE } from "../config";
import { getToken, notifyAuthExpired } from "../auth";
import type { DistillReply, DueReview, Material, Page, QuizReply, ReviewCard, ReviewQuestion, RevisionView, Run, Selection, StageProgress, Turn, TutorDoc } from "../pages/tutor/types";

export { API_BASE };

export class ApiError extends Error {
  status: number;
  code?: string;
  /** 发布五道门那种「哪一道没过」的回包字段（422 GATE）；其它端点没有 */
  gate?: string;
  details?: unknown;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function throwHttp(res: Response): Promise<never> {
  let message = `HTTP ${res.status}`;
  let code: string | undefined;
  let gate: string | undefined;
  let details: unknown;
  try {
    const j = (await res.json()) as { message?: string; code?: string; gate?: string; details?: unknown };
    if (j.message) message = j.message;
    if (j.code) code = j.code;
    if (j.gate) gate = j.gate;
    details = j.details;
  } catch { /* 非 JSON */ }
  if (res.status === 401 && getToken()) notifyAuthExpired(code || "UNAUTHORIZED"); // 与 apiFetch 同一条：带着 token 还 401 = 掉登录，弹登录框
  const err = new ApiError(message, res.status, code);
  err.gate = gate; err.details = details;
  throw err;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { ...init, headers: authHeaders({ "Content-Type": "application/json", Accept: "application/json", ...(init.headers as Record<string, string> | undefined) }) });
  if (!res.ok) await throwHttp(res);
  const ctype = res.headers.get("content-type") || "";
  if (!ctype.includes("application/json")) throw new ApiError("这台服务器还没有老师人格（/api/tutor 不在）", 501, "UNSUPPORTED");
  return (await res.json()) as T;
}

export type RunBundle = { run: Run; doc: TutorDoc; materials: Material[]; turns: Turn[] };
export const getRun = (id: string) => request<RunBundle & { ok: true }>(`/api/tutor/runs/${encodeURIComponent(id)}`);
export const patchProgress = (id: string, stage: string, stepIdx: number) =>
  request<{ ok: true; progress: Record<string, StageProgress>; status: Run["status"]; changed: string[] }>(`/api/tutor/runs/${encodeURIComponent(id)}/progress`, { method: "PATCH", body: JSON.stringify({ stage, stepIdx }) });
export const postMark = (id: string, kind: "select" | "memorize", stage: string, selection: Selection) =>
  request<{ ok: true; seq: number; status: string; pending?: boolean }>(`/api/tutor/runs/${encodeURIComponent(id)}/turns`, { method: "POST", body: JSON.stringify({ kind, stage, selection }) });
export const postQuiz = (id: string, stage: string, answers: string[], review = false) =>
  request<QuizReply>(`/api/tutor/runs/${encodeURIComponent(id)}/quiz`, { method: "POST", body: JSON.stringify({ stage, answers, ...(review ? { review: true } : {}) }) });
// 蒸馏与修订审阅（docs/02 §4、docs/03 §7.4）
export const postDistill = (id: string) => request<DistillReply>(`/api/tutor/runs/${encodeURIComponent(id)}/distill`, { method: "POST", body: "{}" });
export const getRevisions = (id: string) => request<{ ok: true; revisions: RevisionView[]; pending: number; version: number }>(`/api/tutor/runs/${encodeURIComponent(id)}/revisions`);
export const reviewRevision = (id: string, rid: string, body: { accept?: string[]; reject?: string[] }) =>
  request<{ ok: true; version: number; applied: string[]; rejected: string[]; revision: RevisionView; pendingReview: number }>(`/api/tutor/runs/${encodeURIComponent(id)}/revisions/${encodeURIComponent(rid)}/review`, { method: "POST", body: JSON.stringify(body) });
export const revertOps = (id: string, rid: string, opIds: string[]) =>
  request<{ ok: true; revision: RevisionView; revert: RevisionView; pendingReview: number }>(`/api/tutor/runs/${encodeURIComponent(id)}/revisions/${encodeURIComponent(rid)}/revert`, { method: "POST", body: JSON.stringify({ opIds }) });
// 导出 / 导入 / 使用记录（docs/02 §5、docs/05 §5.4）。导出与使用记录是文件：走裸 fetch 拿 blob，出错时回包是 JSON，按 ApiError 抛
export type ExportFormat = "md" | "json" | "zip";
export type ExportAudience = "market" | "self";
export type ExportRecord = { id: string; at: string; by: string; audience: ExportAudience; version: number; format: string; bytes: number; sha256: string; checksum: string; ProduceID: string; ContentProducer?: string; retainDays: number; cleanCheck?: "passed" | "skipped"; name?: string };
export type ExportResult = { filename: string; checksum: string; produceId: string; cleanCheck: string; exportId: string; bytes: number };
export type ImportResult = { ok: true; courseId: string; created: boolean; same: boolean; personaId: string; name: string; version: number; checksum: string; source: "md" | "json"; warnings: string[]; revisionId: string; stages: number };
async function downloadFile(path: string, fallbackName: string): Promise<{ blob: Blob; filename: string; headers: Headers }> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) await throwHttp(res);
  const cd = res.headers.get("content-disposition") || "";
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const plain = /filename="([^"]+)"/i.exec(cd);
  const filename = star ? decodeURIComponent(star[1]) : plain ? plain[1] : fallbackName;
  return { blob: await res.blob(), filename, headers: res.headers };
}
/** 把拿到的文件交给浏览器保存（同一份实现：导出件与使用记录都走它） */
export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a");
  const u = URL.createObjectURL(blob);
  a.href = u; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(u), 10_000);
}
export async function downloadExport(id: string, { format, audience, keepStuckPoints, keepStudentQa }: { format: ExportFormat; audience: ExportAudience; keepStuckPoints?: boolean; keepStudentQa?: boolean }): Promise<ExportResult> {
  const q = new URLSearchParams({ format, audience });
  if (keepStuckPoints) q.set("keepStuckPoints", "1");
  if (keepStudentQa) q.set("keepStudentQa", "1");
  const { blob, filename, headers } = await downloadFile(`/api/tutor/personas/${enc(id)}/export?${q}`, `tutor-persona.${format}`);
  saveBlob(blob, filename);
  return { filename, checksum: headers.get("x-tutor-checksum") || "", produceId: headers.get("x-tutor-produce-id") || "", cleanCheck: headers.get("x-tutor-clean-check") || "", exportId: headers.get("x-tutor-export-id") || "", bytes: blob.size };
}
export const listExports = (id: string) => request<{ ok: true; exports: ExportRecord[]; retainDays: number }>(`/api/tutor/personas/${enc(id)}/exports`);
export const importPersona = (body: { courseId?: string; text?: string; json?: unknown; filename?: string }) => request<ImportResult>("/api/tutor/personas/import", { method: "POST", body: JSON.stringify(body) });
export async function downloadUsage(runId: string, { format, from, to }: { format: "md" | "csv" | "json"; from?: string; to?: string }): Promise<{ filename: string; rows: number }> {
  const q = new URLSearchParams({ format });
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const { blob, filename, headers } = await downloadFile(`/api/tutor/runs/${enc(runId)}/usage-export?${q}`, `usage.${format}`);
  saveBlob(blob, filename);
  return { filename, rows: Number(headers.get("x-tutor-usage-rows") || 0) };
}
// 到期回访（docs/02 4.9 / 3.19）
export const getReviewDue = (id: string) => request<{ ok: true; due: DueReview[]; next: { stage_id: string; nextReviewAt: string } | null }>(`/api/tutor/runs/${encodeURIComponent(id)}/review-due`);
export const getReviewQuiz = (id: string, stage: string) => request<{ ok: true; stage: string; title: string; questions: ReviewQuestion[] }>(`/api/tutor/runs/${encodeURIComponent(id)}/review-quiz?stage=${encodeURIComponent(stage)}`);
export const postSkip = (id: string, stage: string) =>
  request<{ ok: true; progress: Record<string, StageProgress>; status: Run["status"]; nextStage: string | null }>(`/api/tutor/runs/${encodeURIComponent(id)}/skip`, { method: "POST", body: JSON.stringify({ stage }) });
export const postFeedback = (id: string, seq: number, value: 1 | -1 | null) =>
  request<{ ok: true }>(`/api/tutor/runs/${encodeURIComponent(id)}/feedback`, { method: "POST", body: JSON.stringify({ seq, value }) });
export const getReviewCard = (id: string) => request<{ ok: true; card: ReviewCard }>(`/api/tutor/runs/${encodeURIComponent(id)}/review-card`);
export const getMaterialText = (textUrl: string) => request<{ sha: string; pages: Page[] }>(textUrl);
export const materialFileUrl = (m: Material) => `${API_BASE}${m.url}`;

export type TurnBody = { kind: "ask" | "teach" | "quiz-from-selection"; stage: string; text?: string; selection?: Selection; direct?: boolean; selfExplain?: string };
export type TurnDone = { seq: number; kind: string; text: string; flags: Turn["flags"]; demo: boolean; stage: string; progress: Record<string, StageProgress>; status: Run["status"]; changed: string[]; distillQueued?: boolean };
export type TurnHandlers = { onToken?: (t: string) => void; onSentence?: (s: { index: number; text: string }) => void; onDone: (d: TurnDone) => void };

/** 多久没有新东西就放弃：按停了多久算，不按总时长（App api/stream.ts 的 SSE_STALL_MS 同口径） */
const SSE_STALL_MS = 90_000;

/** POST 一个 JSON、读回一条 SSE 流（sentence / token / done / error 四种事件）。error 事件与非 2xx 都 reject。 */
export const streamTurn = (id: string, body: TurnBody, handlers: TurnHandlers, signal?: AbortSignal) => streamSse(`/api/tutor/runs/${encodeURIComponent(id)}/turns`, body, handlers, signal);
/** 试教（docs/02 2.7）：同一条 SSE 形状，服务端不落 Turn、不翻状态 */
export const streamPreview = (courseId: string, body: { kind?: "teach" | "ask"; stage?: string; text?: string }, handlers: TurnHandlers, signal?: AbortSignal) => streamSse(`/api/tutor/personas/${encodeURIComponent(courseId)}/preview`, body, handlers, signal);

export async function streamSse(path: string, body: unknown, handlers: TurnHandlers, signal?: AbortSignal): Promise<void> {
  const ctrl = new AbortController();
  let stalled = false;
  let timer = 0;
  const arm = () => { if (timer) clearTimeout(timer); timer = window.setTimeout(() => { stalled = true; ctrl.abort(); }, SSE_STALL_MS); };
  const onExternalAbort = () => ctrl.abort();
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener("abort", onExternalAbort); }
  arm();
  try {
    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }), body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      if (stalled) throw new ApiError(`等了 ${SSE_STALL_MS / 1000} 秒还没有回话，先停下了`, 0, "TIMEOUT");
      throw e;
    }
    if (!res.ok) await throwHttp(res);
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("text/event-stream")) throw new ApiError("这台服务器还没有老师会话（/api/tutor/runs/:id/turns 不是 SSE）", 501, "UNSUPPORTED");
    let failure = "";
    const parser = createSseParser((e: SseEvent) => {
      let payload: Record<string, unknown> = {};
      try { payload = JSON.parse(e.data) as Record<string, unknown>; } catch { return; }
      if (e.event === "error") { failure = String(payload.message || "老师这一句没说出来"); return; }
      if (e.event === "token") handlers.onToken?.(String(payload.t ?? ""));
      else if (e.event === "sentence") handlers.onSentence?.({ index: Number(payload.index ?? 0), text: String(payload.text ?? "") });
      else if (e.event === "done") handlers.onDone(payload as unknown as TurnDone);
    });
    if (!res.body) parser.push(await res.text());
    else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try { chunk = await reader.read(); } catch (e) { if (stalled) throw new ApiError(`回话说到一半停住了（${SSE_STALL_MS / 1000} 秒没有新内容）`, 0, "TIMEOUT"); throw e; }
        if (chunk.done) break;
        arm();
        parser.push(decoder.decode(chunk.value, { stream: true }));
      }
      parser.flush();
    }
    if (failure) throw new ApiError(failure, 0, "UPSTREAM");
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

// ---------- 建课 / 教材 / 生成 / 试教 / 扫描（docs/06 §3.2 端点表；本地参考实现 src/server/devServer.mjs）
export type LicenseSource = "self" | "instructor_public" | "instructor_consent" | "unsure";
/** 下拉里的顺序就是这个顺序（自有 → 老师公开 → 老师同意 → 不确定），与 server 的 SUPPORTED 一致 */
export const LICENSES: LicenseSource[] = ["self", "instructor_public", "instructor_consent", "unsure"];
export type PolicyInput = { ai: "prohibited" | "limited" | "allowed"; homework_mode: "principles_only" | "full"; allowed_uses: string[]; text: string };
export type KeyDate = { label: string; at: string; kind: "exam" | "homework" | "project" | "other" };
export type CourseInput = { title: string; subject: string; code?: string; term?: string; policy: PolicyInput; key_dates: KeyDate[] };
export type CourseSummary = CourseInput & {
  id: string; createdAt: string; updatedAt?: string; materials: number; unsure: number;
  persona: { id: string; name: string; version: number; stages: number; format: string; generatedAt?: string; method?: string } | null;
  publishable: boolean; run: { status: "active" | "done"; currentStage: string | null; dueReviews?: number; pendingReview?: number } | null;
  /** 发布状态（M2）：null = 没发布过；shared:false = 取消了分享；takenDown = 被平台下架（带原因） */
  published?: PublishState | null;
  /** 从市场「开始学」开出来的课指向那位老师（教材不随老师分发） */
  source?: CourseSource | null;
};
export type MaterialEntry = Material & { bytes?: number; addedAt?: string; license: { source: LicenseSource }; parsed: { status: "ok" | "failed" | "pending"; chars?: number; sections?: number; warnings?: string[] }; inDoc: boolean };
export type Quote = { lines: { kind: string; n: number; why: string; each: number; tokens: number }[]; total: number; demo: boolean; suggested: boolean };
export type Questionnaire = { name: string; style: "calc_first" | "socratic" | "failure_first"; catchphrase?: string; strictness?: "gentle" | "firm" | "strict"; address?: string; examples_from?: string; extra_rules?: string[] };
export type Job = { id: string; kind: string; courseId: string; status: "pending" | "running" | "succeeded" | "failed"; progress: { step: string; done: number; total: number; message: string; mode: "model" | "demo" }; result?: { personaId: string; version: number; stages: number; mode: string; calls: number; warnings: string[] } | null; error?: string | null; failures: string[]; startedAt: string; finishedAt?: string };
export type ScanProposal = { i: number; title: string; summary: string; steps: number; memo: number; checks: number; method: string };
export type HardRule = { text: string; locked: boolean; from: "policy" | "author" };

const enc = encodeURIComponent;
const POST = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });
export const listCourses = () => request<{ ok: true; courses: CourseSummary[] }>("/api/tutor/courses");
export const createCourse = (body: CourseInput) => request<{ ok: true; course: CourseSummary }>("/api/tutor/courses", POST(body));
export const getCourse = (id: string) => request<{ ok: true; course: CourseSummary; materials: MaterialEntry[] }>(`/api/tutor/courses/${enc(id)}`);
export const patchCourse = (id: string, body: Partial<CourseInput>) => request<{ ok: true; course: CourseSummary }>(`/api/tutor/courses/${enc(id)}`, { method: "PATCH", body: JSON.stringify(body) });
export const getRules = (id: string) => request<{ ok: true; rules: HardRule[] }>(`/api/tutor/courses/${enc(id)}/rules`);
export const materialExists = (id: string, sha256: string) => request<{ ok: true; exists: boolean; material: MaterialEntry | null }>(`/api/tutor/courses/${enc(id)}/materials?sha256=${sha256}`);
/** 直传票：putUrl 是 Cloudinary 的上传地址，params 要**原样逐字段**转发（多签一个没发、发了一个没签都只会得到 Invalid Signature） */
export type DirectTicket = { ok: true; ticket: string; putUrl: string; publicId: string; params: Record<string, string | number | boolean>; maxBytes: number; chunkBytes: number };
export const signMaterial = (body: { courseId: string; format: string; bytes: number; name: string }) => request<DirectTicket>("/api/tutor/materials/sign", POST(body));
/** 成人声明（v1 只做成人）：真相在服务端 User.tutorAdultDeclaredAt */
export const getTutorConfig = () => request<{ ok: true; prices: Record<string, number>; demo: boolean; adultDeclared: boolean; adultDeclaredAt: string | null }>("/api/tutor/config");
export const declareAdult = () => request<{ ok: true; adultDeclaredAt: string }>("/api/tutor/declare-adult", POST({}));
/** 事后改一份教材的授权来源（上传时选了「不确定」、后来问到教授了）；回包带整位老师重算后的 license.source（取最差的那一档） */
export const setMaterialLicense = (courseId: string, sha: string, source: LicenseSource) => request<{ ok: true; sha: string; license: { source: LicenseSource }; docLicense: LicenseSource | null }>(`/api/tutor/materials/${enc(sha)}`, { method: "PATCH", body: JSON.stringify({ courseId, license: { source } }) });
export const confirmMaterial = (body: { ticket: string; courseId: string; sha256: string; name: string; mime: string; bytes: number; license: { source: LicenseSource }; pages: Page[]; warnings: string[] }) => request<{ ok: true; duplicate: boolean; material: MaterialEntry; message?: string }>("/api/tutor/materials/confirm", POST(body));
export const getQuote = (id: string) => request<{ ok: true; materials: number; sections: number; stages: number; quote: Quote | null; demo: boolean }>(`/api/tutor/courses/${enc(id)}/quote`);
export const startGenerate = (courseId: string, questionnaire: Questionnaire) => request<{ ok: true; jobId: string; quote: Quote; nameHint: string | null }>("/api/tutor/personas/generate", POST({ courseId, questionnaire }));
export const getJob = (id: string) => request<{ ok: true; job: Job }>(`/api/tutor/jobs/${enc(id)}`);
export const scanCourse = (id: string) => request<{ ok: true; patchId: string | null; proposals: ScanProposal[]; materials: { sha: string; name: string }[]; failures?: string[]; message?: string }>(`/api/tutor/personas/${enc(id)}/scan`, POST({}));
export const acceptScan = (id: string, patchId: string, indices: number[]) => request<{ ok: true; added: string[]; version: number; stages: number }>(`/api/tutor/personas/${enc(id)}/patches/${enc(patchId)}/accept`, POST({ indices }));

// ── 市场 / 发布 / 举报（tutor 仓 docs/02 §6 §7，M2）
export type MarketCard = { id: string; name: string; description: string; coverEmoji: string; coverImageUrl: string; tags: string[]; subject: string; author: { _id: string; username: string }; price: number; version: number; shared: boolean; takenDown: boolean; stats: { downloadCount: number; likeCount: number; ratingAvg: number; ratingCount: number }; installed: boolean; isOwner: boolean; publishedAt?: string; createdAt?: string; updatedAt?: string; remixOf?: { id: string; name: string } | null };
export type MarketSort = "new" | "hot" | "rating";
export type MarketScope = "all" | "installed" | "mine";
export type MarketQuery = { q?: string; tag?: string; subject?: string; sort?: MarketSort; scope?: MarketScope; page?: number; limit?: number; author?: string };
export type MarketPreview = { card: { who: string; teaching_style: string; catchphrases: string[]; hard_rules: { text: string; locked: boolean }[] }; stages: { stage_id: string; title: string; summary: string; steps: number; memo: number; checks: number }[]; guide: string; subject?: string; language?: string; policy?: unknown; license?: { source?: string } | null };
export type MarketRelease = { version: number; sha256: string; checksum: string; produceId: string; publishedAt: string; note: string; stages: number };
export type MarketDetail = { persona: MarketCard; release: MarketRelease | null; preview: MarketPreview | null; others: MarketCard[]; relation: { isOwner: boolean; installed: boolean; learning: { courseId: string; version: number } | null; ownCourse: string | null }; takedown?: { at: string | null; reason: string } };
export type PublishGate = "persona" | "license" | "cleanCheck" | "adult" | "aigc" | "name" | "tags" | "doc";
export type PublishState = { personaId: string; name: string; description: string; tags: string[]; coverEmoji: string; subject: string; shared: boolean; takenDown: boolean; takenDownReason?: string; version: number; sha256?: string; checksum?: string; produceId?: string; publishedAt?: string; aigcDeclaredAt: string | null; marketPath: string; remixOf?: { id: string; name: string } | null; companion?: { enabled: boolean; at?: string | null } | null };
/** 举报理由（与 server Report.REASONS 逐字相等，服务端先上；顺序按老师人格最常见的排：教授认领在最前） */
export const REPORT_REASONS = ["instructorClaim", "infringe", "abuse", "spam", "porn", "violence", "csae", "other"] as const;
const qs = (o: Record<string, string | number | undefined>) => { const u = new URLSearchParams(); for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "" && v !== null) u.set(k, String(v)); return u.toString(); };
export const listMarket = (q: MarketQuery) => request<{ ok: true; items: MarketCard[]; page: number; limit: number; total: number; totalPages: number; sort: string; scope: string }>(`/api/tutor/market?${qs(q)}`);
export const getMarketDetail = (id: string) => request<{ ok: true } & MarketDetail>(`/api/tutor/market/${enc(id)}`);
/** 发布：五道门在服务端（tutor 仓 src/publish），任一不过 422 GATE + gate 指明哪一道 —— 这里只发身份 / 简介 / 标签 / 主动声明 */
export const publishPersona = (courseId: string, body: { name?: string; description?: string; tags?: string[]; coverEmoji?: string; aigcDeclared: boolean; note?: string; alsoCompanion?: boolean }) => request<{ ok: true; persona: PublishState; warnings: string[] }>(`/api/tutor/personas/${enc(courseId)}/publish`, POST(body));
export const unpublishPersona = (courseId: string) => request<{ ok: true; persona: PublishState }>(`/api/tutor/personas/${enc(courseId)}/publish`, { method: "DELETE" });
/** 「开始跟这位老师学」：从发布版复制出自己的一门课（教材不复制、进度全 pending）；同一人再点回同一门 */
export const startLearning = (persona: string) => request<{ ok: true; courseId: string; created: boolean; own?: boolean; version?: number; latest?: number; downloadCount?: number }>("/api/tutor/runs", POST({ persona }));
/** 举报（server 的 POST /api/reports；targetType persona 是 2026-09-28 加的）；同一人对同一位老师只能一次（409） */
export const reportPersona = (targetId: string, reason: string, detail: string) => request<{ ok: true; report: { id?: string; _id?: string; status?: string } }>("/api/reports", POST({ targetType: "persona", targetId, reason, detail }));

// ---- 评分（tutor 仓 docs/02 §9.6；规则只在 server core/publish/rating：能不能评 / 1~5 星 / ≤500 字 / 均分怎么算）
export type RatingDist = Record<"1" | "2" | "3" | "4" | "5", number>;
export type RatingSummary = { avg: number; count: number; dist: RatingDist };
export type RatingItem = { id: string; user: { _id: string; username: string }; stars: number; text: string; atVersion: number; createdAt: string; updatedAt: string };
/** 不能评的原因（服务端给 reason，message 是兜底人话）：login / owner / blocked / notStarted / noneDone */
export type CanRate = { ok: true } | { ok: false; reason: string; message?: string };
export type RatingsReply = { ok: true; summary: RatingSummary; items: RatingItem[]; page: number; totalPages: number; total: number; mine: RatingItem | null; canRate: CanRate };
export const getRatings = (personaId: string, page = 1) => request<RatingsReply>(`/api/tutor/market/${encodeURIComponent(personaId)}/ratings?page=${page}`);
export const putRating = (personaId: string, body: { stars: number; text?: string }) =>
  request<{ ok: true; created: boolean; mine: RatingItem; summary: RatingSummary }>(`/api/tutor/market/${encodeURIComponent(personaId)}/rating`, { method: "PUT", body: JSON.stringify(body) });
export const deleteRating = (personaId: string) => request<{ ok: true; summary: RatingSummary }>(`/api/tutor/market/${encodeURIComponent(personaId)}/rating`, { method: "DELETE" });
// ---- 合并新版（tutor 仓 docs/03 §6.3）：只换 ③ 结构与 ④ 内容，② 与进度保留；报告的形状 = core/publish/merge 的 report
export type MergeReport = { fromVersion: number; releaseVersion: number; baseKnown: boolean; added: string[]; removed: string[]; renamed: { from: string; to: string; split: boolean }[]; changed: string[]; kept: number; learnerKept: number; studentQaKept: number; truncated: { stage_id: string; kind: string; dropped: number }[] };
/** 课程 summary 的 source 格（从市场开出来的课）：钉的版本 + 最新版 + 有没有可合的；gone = 那位老师已不在市场上 */
export type CourseSource = { personaId: string; personaName?: string; version: number; latest?: number | null; updateAvailable?: boolean; mergedAt?: string | null; gone?: boolean; orphaned?: boolean };
export const mergeRelease = (courseId: string) =>
  request<{ ok: true; version: number; note: string; report: MergeReport; source: CourseSource }>(`/api/tutor/courses/${encodeURIComponent(courseId)}/merge-release`, { method: "POST", body: "{}" });

// ---- 管理后台：教授认领（instructorClaim）的人工核实队列（server tutorClaims.service；与通用举报队列同一张表、同一份处置正文，只是单独一条车道）
export type ClaimStage = "new" | "awaiting" | "upheld" | "rejected" | "all";
export type ClaimPersona = { exists: false } | { exists: true; id: string; name: string; subject: string; author: { _id: string; username: string }; shared: boolean; takenDown: boolean; takenDownReason: string; version: number; downloadCount: number; ratingCount: number; createdAt?: string; marketPath: string };
export type ClaimItem = { id: string; stage: Exclude<ClaimStage, "all"> | "closed"; status: string; reason: string; detail: string; createdAt: string; reporter: { _id: string; username: string; displayName: string }; handler: { _id: string; username: string } | null; handledAt: string | null; handleNote: string; review: { contactedAt: string | null; contactCount: number; log: { at: string; by: string | null; action: string; note: string }[] }; persona: ClaimPersona };
export type ClaimsReply = { ok: true; items: ClaimItem[]; total: number; page: number; limit: number; stage: ClaimStage; counts: Record<"new" | "awaiting" | "upheld" | "rejected", number> };
export const listClaims = (stage: ClaimStage, page = 1) => request<ClaimsReply>(`/api/tutor/admin/claims?stage=${stage}&page=${page}`);
export const contactClaim = (id: string, message: string) => request<{ ok: true; notified: boolean; claim: ClaimItem }>(`/api/tutor/admin/claims/${encodeURIComponent(id)}/contact`, { method: "POST", body: JSON.stringify({ message }) });
export const verdictClaim = (id: string, verdict: "upheld" | "rejected", note?: string) => request<{ ok: true; verdict: string; applied: boolean; alsoResolved: number; claim: ClaimItem }>(`/api/tutor/admin/claims/${encodeURIComponent(id)}/verdict`, { method: "POST", body: JSON.stringify({ verdict, ...(note ? { note } : {}) }) });

// ---- M3 与启梦互通（tutor 仓 docs/06 §5.1）：引流位 ?from= 记一行（只记不奖励；白名单与按天去重都在服务端）+ 管理员的三条度量（数字全在服务端算）
export const postReferral = (from: string, path: string) => request<{ ok: true; recorded: boolean; from?: string; reason?: string }>("/api/tutor/referral", POST({ from, path }));
export type TutorMetrics = { ok: true; days: number; since: string; referrals: { from: string; count: number; users: number }[]; activation: { tutorUsers: number; crossUsers: number; ratio: number; note?: string }; companion: { personas: number; accounts: number }; fork7d: { days?: number; forks: number; activated: number; ratio: number } };
export const getTutorMetrics = () => request<TutorMetrics>("/api/tutor/admin/metrics");
