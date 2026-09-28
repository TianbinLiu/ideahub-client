// 教材条目的状态机（一次只处理一份，串行）：queued → extracting（浏览器抽文本）→ extracted（等选来源）→ uploading（sign → PUT → confirm）→ done | duplicate | failed。
// 抽文本不等来源：拖进来就抽、页数字数马上可见（1.5 解析状态可见）；来源一选就传（1.4 每份文件必选）。
import { useEffect, useRef } from "react";
import { extractFile, type Extracted } from "../../../extract";
import { uploadMaterial } from "../../../api/tutorUpload";
import type { WizardFile } from "../new/wizardStore";
import type { LicenseSource } from "../../../api/tutor";

const extractedCache = new Map<string, Extracted>();

export function useUploadEngine(courseId: string | null, files: WizardFile[], update: (key: string, patch: Partial<WizardFile>) => void, fileOf: (key: string) => File | undefined, onDone?: () => void) {
  const running = useRef(false);
  useEffect(() => {
    if (running.current) return;
    const next = files.find((f) => f.status === "queued") || (courseId ? files.find((f) => f.status === "extracted" && f.license) : undefined);
    if (!next) return;
    const file = fileOf(next.key);
    if (!file) { update(next.key, { status: "failed", error: "刷新后文件不在了，重新拖一次" }); return; }
    running.current = true;
    (async () => {
      try {
        if (next.status === "queued") {
          update(next.key, { status: "extracting", progress: 0 });
          const ex = await extractFile(file, (p) => { if (p.step === "parse" && p.page) update(next.key, { page: p.page, pages: p.pages, progress: p.pages ? p.page / p.pages : 0 }); });
          extractedCache.set(next.key, ex);
          update(next.key, { status: "extracted", sha: ex.sha256, pages: ex.pages.length, chars: ex.chars, warnings: ex.warnings, progress: 0 });
        } else if (courseId) {
          const ex = extractedCache.get(next.key);
          if (!ex) { update(next.key, { status: "queued" }); return; }
          update(next.key, { status: "uploading", progress: 0 });
          const r = await uploadMaterial({ courseId, file, extracted: ex, license: next.license as LicenseSource, onProgress: (p) => update(next.key, { progress: p.total ? p.sent / p.total : 0 }) });
          update(next.key, { status: r.duplicate ? "duplicate" : "done", progress: 1, sha: r.material.sha });
          onDone?.();
        }
      } catch (e) {
        update(next.key, { status: "failed", error: e instanceof Error ? e.message : String(e) });
      } finally {
        running.current = false;
        // 下一份：状态变了 effect 会再进来；这里补一脚防止没有任何 state 变化的死等
        setTimeout(() => update(next.key, {}), 0);
      }
    })();
  }, [courseId, files, update, fileOf, onDone]);
}
