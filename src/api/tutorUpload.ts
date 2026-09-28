// 教材直传客户端（tutor 仓 docs/05 §4.3、docs/02 1.3 / 1.5 / 1.7）：先按 sha256 问一句去重 → sign 领票 → 分块 POST 到 Cloudinary（带真进度）→ confirm 送浏览器抽好的 pages。
// ★ 与 App `src/api/uploads.ts` 的 putDirect 同一条纪律（tutor 仓 docs/04 C12）：
//   · 票里的 params 原样逐字段转发；同一次上传的每一块带**同一个** X-Unique-Upload-Id，Content-Range 的 end 是闭区间；
//   · 一块就装得下时走普通上传（官方 SDK 也这么分：upload vs upload_large）；
//   · 超时按「多久没传出一个字节」算（STALL），不按总时长 —— 慢网上字节还在动就不该掐；HARD 是兜底的绝对上限。
import { ApiError, confirmMaterial, materialExists, signMaterial, type DirectTicket, type LicenseSource, type MaterialEntry } from "./tutor";
import type { Extracted } from "../extract";

export type UploadProgress = { phase: "check" | "sign" | "put" | "confirm" | "done"; sent: number; total: number };
const CHUNK_STALL_MS = 90_000;
const CHUNK_HARD_MS = 30 * 60_000;

export async function uploadMaterial({ courseId, file, extracted, license, onProgress, signal }: { courseId: string; file: File; extracted: Extracted; license: LicenseSource; onProgress?: (p: UploadProgress) => void; signal?: AbortSignal }): Promise<{ material: MaterialEntry; duplicate: boolean }> {
  onProgress?.({ phase: "check", sent: 0, total: file.size });
  const ex = await materialExists(courseId, extracted.sha256);
  if (ex.exists && ex.material) { onProgress?.({ phase: "done", sent: file.size, total: file.size }); return { material: ex.material, duplicate: true }; }
  onProgress?.({ phase: "sign", sent: 0, total: file.size });
  const ticket = await signMaterial({ courseId, format: extracted.ext.slice(1), bytes: file.size, name: file.name });
  await postDirect(ticket, file, (sent) => onProgress?.({ phase: "put", sent, total: file.size }), signal);
  onProgress?.({ phase: "confirm", sent: file.size, total: file.size });
  const conf = await confirmMaterial({ ticket: ticket.ticket, courseId, sha256: extracted.sha256, name: file.name, mime: extracted.mime, bytes: file.size, license: { source: license }, pages: extracted.pages, warnings: extracted.warnings });
  onProgress?.({ phase: "done", sent: file.size, total: file.size });
  return { material: conf.material, duplicate: conf.duplicate };
}

/** 整份分块推给 Cloudinary；一块就装得下就一发 */
export async function postDirect(ticket: DirectTicket, file: Blob, onBytes: (sent: number) => void, signal?: AbortSignal): Promise<void> {
  const chunk = Number.isInteger(ticket.chunkBytes) && ticket.chunkBytes > 0 ? ticket.chunkBytes : 6_000_000;
  if (file.size <= chunk) { await postChunk(ticket, file, null, "", onBytes, signal); return; }
  const uploadId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  for (let start = 0; start < file.size; start += chunk) {
    const end = Math.min(start + chunk, file.size) - 1;
    await postChunk(ticket, file.slice(start, end + 1), { start, end, total: file.size }, uploadId, (sentInChunk) => onBytes(start + sentInChunk), signal);
  }
}

function postChunk(ticket: DirectTicket, blob: Blob, range: { start: number; end: number; total: number } | null, uploadId: string, onBytes: (sentInThisChunk: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("file", blob);
    for (const [k, v] of Object.entries(ticket.params)) fd.append(k, String(v));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.putUrl);
    if (range) {
      xhr.setRequestHeader("X-Unique-Upload-Id", uploadId);
      xhr.setRequestHeader("Content-Range", `bytes ${range.start}-${range.end}/${range.total}`);
    }
    let lastLoaded = 0;
    let lastMoveAt = Date.now();
    const startedAt = lastMoveAt;
    const watchdog = window.setInterval(() => {
      const now = Date.now();
      const stalled = now - lastMoveAt > CHUNK_STALL_MS;
      if (!stalled && now - startedAt < CHUNK_HARD_MS) return;
      window.clearInterval(watchdog);
      xhr.onabort = null;
      xhr.abort();
      reject(new ApiError(stalled ? `这一小段有 ${Math.round(CHUNK_STALL_MS / 1000)} 秒没传出去一个字节——网络断了或太不稳，换个网络再试` : `这一小段传了 ${Math.round(CHUNK_HARD_MS / 60_000)} 分钟还没完成——网络太慢，换个网络再试`, 0, "TIMEOUT"));
    }, 5_000);
    xhr.onloadend = () => window.clearInterval(watchdog);
    xhr.upload.onprogress = (ev) => { if (ev.loaded > lastLoaded) { lastLoaded = ev.loaded; lastMoveAt = Date.now(); } onBytes(ev.loaded); };
    xhr.onload = () => {
      let body: { error?: { message?: string } } = {};
      try { body = JSON.parse(xhr.responseText) as typeof body; } catch { /* 非 JSON：按状态码报 */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      // Cloudinary 的错误体是 { error: { message } }，原样带出来 —— "Invalid Signature" 这种一眼定位的信息别盖掉
      reject(new ApiError(`文件存储拒绝了这一段：${String(body.error?.message || `HTTP ${xhr.status}`)}`, xhr.status, "UPSTREAM"));
    };
    xhr.onerror = () => reject(new ApiError("上传中断了（网络不可用）", 0, "NETWORK"));
    xhr.onabort = () => reject(new DOMException("aborted", "AbortError"));
    if (signal) { if (signal.aborted) return reject(new DOMException("aborted", "AbortError")); signal.addEventListener("abort", () => xhr.abort(), { once: true }); }
    xhr.send(fd);
  });
}
