/**
 * @file PersonaPickerModal.tsx - 人格选择器弹窗（情景编辑器给聊天角色绑定人格用）。
 * @category Component
 *
 * 职责：搜索/浏览人格广场的人格（全部=shared / 我收藏的 / 我发布的），选中一个交给调用方。
 * 只做「选择」，不做安装/点赞/装备 —— 那些是人格广场的事；绑定与解绑的语义由调用方
 * （ScenarioEditorPage 的角色卡）负责。
 *
 * 搜索直接复用 listPersonas 的 q（后端把 name/description/tags 一起进 haystack），
 * 所以按 tag 关键词搜也命中 —— 这正是「人格发布时打 tag 方便他人搜索」的消费端。
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import toast from "react-hot-toast";
import { listPersonas, type Persona } from "../api";
import { humanizeError } from "../utils/humanizeError";

type Scope = "all" | "installed" | "mine";

const SCOPE_TABS: { value: Scope; labelKey: string }[] = [
  { value: "all", labelKey: "scopeAll" },
  { value: "installed", labelKey: "scopeInstalled" },
  { value: "mine", labelKey: "scopeMine" },
];

type PersonaPickerModalProps = {
  open: boolean;
  onClose: () => void;
  /** 选中一个人格（由调用方决定怎么绑定）；选择后弹窗由调用方关闭 */
  onSelect: (persona: Persona) => void;
};

export default function PersonaPickerModal({ open, onClose, onSelect }: PersonaPickerModalProps) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [loading, setLoading] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  // 请求竞态防护：只认最后一次请求的结果（快速连续输入时旧响应可能后到）
  const reqSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    const seq = ++reqSeq.current;
    // 300ms 防抖：输入停顿后才发请求
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const res = await listPersonas({ scope, sort: "hot", q: q.trim(), limit: 12 });
        if (reqSeq.current !== seq) return;
        setPersonas(res.personas || []);
      } catch (e) {
        if (reqSeq.current === seq) toast.error(humanizeError(e));
      } finally {
        if (reqSeq.current === seq) setLoading(false);
      }
    }, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [open, q, scope]);

  if (!open) return null;

  return (
    // 遮罩点击关闭；内容卡 stopPropagation
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("arena.personaPicker.title")}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-gray-700 bg-gray-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">{t("arena.personaPicker.title")}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">{t("arena.personaPicker.intro")}</p>

        {/* 搜索框 + scope tabs */}
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2">
          <Search size={15} className="shrink-0 text-gray-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("arena.personaPicker.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
          />
        </div>
        <div className="mt-2 flex gap-1">
          {SCOPE_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setScope(tab.value)}
              className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
                scope === tab.value
                  ? "bg-cyan-500/20 font-semibold text-cyan-100"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              }`}
            >
              {t(`arena.personaPicker.${tab.labelKey}`)}
            </button>
          ))}
        </div>

        {/* 结果列表 */}
        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("arena.personaPicker.loading")}</p>
          ) : personas.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">{t("arena.personaPicker.empty")}</p>
          ) : (
            personas.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => onSelect(p)}
                className="flex w-full items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3 text-left hover:border-cyan-700/60 hover:bg-cyan-950/20"
              >
                <span className="text-3xl leading-none">{p.coverEmoji || "🎭"}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-white">{p.name}</span>
                    <span className="shrink-0 text-[11px] text-gray-500">
                      🎭 {p.stats?.downloadCount || 0} · ❤️ {p.stats?.likeCount || 0}
                    </span>
                  </span>
                  {p.description && (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-gray-400">{p.description}</span>
                  )}
                  {(p.tags || []).length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {(p.tags || []).slice(0, 4).map((tag) => (
                        <span key={tag} className="rounded-full border border-cyan-700/60 px-1.5 py-0.5 text-[10px] text-cyan-200">
                          #{tag}
                        </span>
                      ))}
                    </span>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
