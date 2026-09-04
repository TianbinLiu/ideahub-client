/**
 * @file VoiceTemplateBrowser.tsx - 声音市场模板的紧凑浏览器（搜索 + 全部/我的 + 最热/最新），每张卡带试听与一个主动作
 * @category Component
 * @i18n_module voiceMarket
 *
 * 两处复用：VoiceTemplatePickerModal（人格 / 模型编辑器里「声音市场模板」→ 选一个当配方）和
 * 首页「声音」面板的「模板市场」tab（主动作「设为我的声音」）。动作语义由调用方决定，这里只管列出来。
 * ★ 与 PersonaPickerModal 同款：300ms 防抖 + 请求序号，只认最后一次请求的结果（快速连续输入时旧响应可能后到）。
 * ★ 不分页，一次最多 30 条：这是弹窗里的快速挑选，要翻页、点赞、看详情的去 /voices/market（底部给了入口）。
 * ★ 「我的」tab 要登录（接口 401），游客不显示这个 tab。
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Search } from "lucide-react";
import toast from "react-hot-toast";
import { listVoiceTemplates, type VoiceTemplate } from "../api";
import { useAuth } from "../authContext";
import { useTtsVoices, voiceDisplayName } from "../companion/ttsVoices";
import { usePreviewSentence, voiceErrorMessage } from "../companion/voiceTemplates";
import VoiceTemplateCard from "./VoiceTemplateCard";

type Scope = "all" | "mine";
type Sort = "hot" | "new";

type Props = {
  onPick: (template: VoiceTemplate) => void;
  pickLabel: string;
  /** 正在处理哪一个（按钮转圈 / 禁用） */
  pickingId?: string;
  /** 徽标：当前用的 / 已选用的模板 */
  activeTemplateId?: string | null;
  activeLabel?: string;
  /** 试听句子；缺省「你好，我是小梦，这是我的新声音。」 */
  previewText?: string;
  /** 底部要不要「去声音市场」链接（在市场页本身里就不用了） */
  marketLink?: boolean;
};

export default function VoiceTemplateBrowser({ onPick, pickLabel, pickingId = "", activeTemplateId, activeLabel, previewText, marketLink = true }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { voices, mixable } = useTtsVoices();
  const defaultSentence = usePreviewSentence();

  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [sort, setSort] = useState<Sort>("hot");
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<VoiceTemplate[]>([]);
  const reqSeq = useRef(0);

  // 登出后「我的」tab 消失，scope 不能还停在 mine（接口会 401 并触发登录过期弹窗）
  const effectiveScope: Scope = !user && scope === "mine" ? "all" : scope;

  useEffect(() => {
    const seq = ++reqSeq.current;
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const res = await listVoiceTemplates({ scope: effectiveScope, sort, q: q.trim(), limit: 30 });
        if (reqSeq.current !== seq) return;
        setTemplates(res.templates || []);
      } catch (e) {
        if (reqSeq.current === seq) toast.error(voiceErrorMessage(e));
      } finally {
        if (reqSeq.current === seq) setLoading(false);
      }
    }, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [q, effectiveScope, sort]);

  const nameOf = (id: string) => voiceDisplayName(id, voices, mixable);
  const sentence = (previewText || "").trim() || defaultSentence;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2">
        <Search size={15} className="shrink-0 text-gray-500" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("voiceMarket.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm text-gray-100 placeholder-gray-500 outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {(user ? (["all", "mine"] as Scope[]) : (["all"] as Scope[])).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setScope(key)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              effectiveScope === key ? "bg-cyan-500/20 font-semibold text-cyan-100" : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
            }`}
          >
            {t(key === "all" ? "voiceMarket.scopeAll" : "voiceMarket.scopeMine")}
          </button>
        ))}
        <span className="mx-1 text-gray-700">|</span>
        {(["hot", "new"] as Sort[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSort(key)}
            className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
              sort === key ? "bg-gray-800 font-semibold text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t(key === "hot" ? "voiceMarket.sortHot" : "voiceMarket.sortNew")}
          </button>
        ))}
      </div>

      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {loading ? (
          <p className="py-8 text-center text-sm text-gray-500">{t("voiceMarket.loading")}</p>
        ) : templates.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            {effectiveScope === "mine" ? t("voiceMarket.emptyMine") : t("voiceMarket.emptyAll")}
          </p>
        ) : (
          templates.map((tpl) => (
            <VoiceTemplateCard
              key={tpl._id}
              template={tpl}
              active={Boolean(activeTemplateId) && tpl._id === activeTemplateId}
              activeLabel={activeLabel}
              nameOf={nameOf}
              previewText={sentence}
              primaryLabel={pickLabel}
              primaryBusy={pickingId === tpl._id}
              onPrimary={onPick}
              linkToDetail={false}
              compact
            />
          ))
        )}
      </div>

      {marketLink && (
        <Link to="/voices/market" className="mt-3 inline-block text-xs text-cyan-300 hover:underline">
          {t("voiceMarket.goToMarket")} →
        </Link>
      )}
    </div>
  );
}
