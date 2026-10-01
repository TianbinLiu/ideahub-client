// 圈选后的动作条（docs/09 §4.2、docs/02 3.17）：问老师 / 出一题 / 没懂 / 加入必背。桌面浮在选区上方，手机贴底。
// ★ onMouseDown 上 preventDefault：点按钮不能把选区点没了（那就是它存在的全部理由）。
import { useTranslation } from "react-i18next";
import { MessageCircleQuestion, ListChecks, CircleHelp, BookmarkPlus } from "lucide-react";
import type { ReaderSelection } from "./useSelection";

// ★ 定义在模块层而不是 SelectionBar 里：渲染中定义的组件每次都是新类型，React 会把四颗键整棵卸载重挂（焦点、按压态都丢）。
function Btn({ icon, label, onClick, testid, busy }: { icon: React.ReactNode; label: string; onClick: () => void; testid: string; busy: boolean }) {
  return (
    <button type="button" data-testid={testid} disabled={busy} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-white hover:bg-white/15 disabled:opacity-40">
      {icon}{label}
    </button>
  );
}

export function SelectionBar({ sel, mobile, busy, onAsk, onQuiz, onStuck, onMemo }: { sel: ReaderSelection; mobile: boolean; busy: boolean; onAsk: () => void; onQuiz: () => void; onStuck: () => void; onMemo: () => void }) {
  const { t } = useTranslation(undefined, { keyPrefix: "tutor" });
  const style = mobile ? undefined : { top: Math.max(4, sel.rect.top - 44), left: Math.max(8, sel.rect.left) };
  return (
    <div data-testid="sel-bar" className={`${mobile ? "fixed inset-x-3 bottom-3 justify-around" : "absolute"} z-30 flex items-center gap-1 rounded-full bg-zinc-900/95 px-1.5 py-1 shadow-lg`} style={style}>
      <Btn busy={busy} testid="sel-ask" icon={<MessageCircleQuestion size={14} />} label={t("sel.ask")} onClick={onAsk} />
      <Btn busy={busy} testid="sel-quiz" icon={<ListChecks size={14} />} label={t("sel.quiz")} onClick={onQuiz} />
      <Btn busy={busy} testid="sel-stuck" icon={<CircleHelp size={14} />} label={t("sel.stuck")} onClick={onStuck} />
      <Btn busy={busy} testid="sel-memo" icon={<BookmarkPlus size={14} />} label={t("sel.memo")} onClick={onMemo} />
    </div>
  );
}
