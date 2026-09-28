// 课程地图侧栏：③ 的阶段 + 运行态状态（未讲 / 已讲 / 已通过）；一次一阶段，后面的阶段点不动。
import { useTranslation } from "react-i18next";
import { Check, Circle, CircleDot, Lock } from "lucide-react";
import type { Stage, StageProgress } from "../types";

export function StageList({ stages, progress, currentId, viewingId, stepCounts, onSelect }: { stages: Stage[]; progress: Record<string, StageProgress>; currentId: string | null; viewingId: string | null; stepCounts: Record<string, number>; onSelect: (id: string) => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const curIdx = stages.findIndex((s) => s.stage_id === currentId);
  return (
    <ol className="space-y-0.5 text-xs" data-testid="stage-list">
      {stages.map((s, i) => {
        const p = progress[s.stage_id];
        const locked = curIdx >= 0 && i > curIdx;
        const status = p?.status ?? "pending";
        const Icon = status === "passed" ? Check : s.stage_id === currentId ? CircleDot : locked ? Lock : Circle;
        return (
          <li key={s.stage_id}>
            <button type="button" data-testid={`stage-item-${s.stage_id}`} data-status={status} disabled={locked} onClick={() => onSelect(s.stage_id)} className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-zinc-100 disabled:opacity-40 ${s.stage_id === viewingId ? "bg-cyan-50 text-cyan-900" : ""}`}>
              <Icon size={13} className={status === "passed" ? "text-emerald-600" : s.stage_id === currentId ? "text-cyan-600" : "text-zinc-400"} />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <span className="text-[10px] text-zinc-400">{stepCounts[s.stage_id] ? t("stages.steps", { n: stepCounts[s.stage_id] }) : ""} {t(`stages.${status}`)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
