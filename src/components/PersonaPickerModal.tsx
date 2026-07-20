/**
 * @file PersonaPickerModal.tsx - 人格选择器弹窗（情景编辑器给聊天角色绑定人格用）。
 * @category Component
 *
 * 两个 tab：
 * - 「选人格」：搜索/浏览人格广场（全部 / 我收藏的 / 我发布的）。全部 tab 下把
 *   【我收藏的】合并置顶并标「收藏」徽标 —— 单靠列表自带的 installed 标记不够：
 *   收藏的人格可能不在热度排序的第一页，必须双请求合并才能保证真的在最前面。
 * - 「✨ 从聊天记录生成」：贴一段聊天文本 → AI 提炼人格【草稿】（不落库）→ 预览
 *   确认后才 createPersona（是否公开由用户勾选：公开=他人可在情景页收藏它）→ 直接绑定。
 *   取消/关弹窗不会留下孤儿人格。
 *
 * 只做「选择/生成」，安装/点赞/装备是人格广场的事；绑定语义由调用方（角色卡）负责。
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Sparkles, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  createPersona,
  generatePersonaDraft,
  getMyPoints,
  listPersonas,
  purchasePersona,
  type Persona,
  type PersonaDraft,
} from "../api";
import { humanizeError } from "../utils/humanizeError";

type Scope = "all" | "installed" | "mine";
type Mode = "pick" | "generate";

const SCOPE_TABS: { value: Scope; labelKey: string }[] = [
  { value: "all", labelKey: "scopeAll" },
  { value: "installed", labelKey: "scopeInstalled" },
  { value: "mine", labelKey: "scopeMine" },
];

type PersonaPickerModalProps = {
  open: boolean;
  onClose: () => void;
  /** 选中/生成了一个人格（由调用方决定怎么绑定）；弹窗由调用方关闭 */
  onSelect: (persona: Persona) => void;
};

export default function PersonaPickerModal({ open, onClose, onSelect }: PersonaPickerModalProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("pick");

  // ── 选人格 tab ──
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [loading, setLoading] = useState(false);
  const [personas, setPersonas] = useState<Persona[]>([]);
  // 请求竞态防护：只认最后一次请求的结果（快速连续输入时旧响应可能后到）
  const reqSeq = useRef(0);

  // ── 购买确认（付费人格点选后先经这里）──
  const [buyTarget, setBuyTarget] = useState<Persona | null>(null);
  const [buying, setBuying] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);

  // ── 生成 tab ──
  const [chatText, setChatText] = useState("");
  const [hint, setHint] = useState("");
  // 生成人格的售价（仅勾选公开时展示/生效）
  const [genPriceText, setGenPriceText] = useState("0");
  // 默认【不公开】（评审实锤）：素材是私人聊天记录，生成物含原话引文——
  // 公开必须是用户看过预览后的主动选择，而不是默认顺手带出去
  const [genShared, setGenShared] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<PersonaDraft | null>(null);

  // 购买确认面板随上下文失效（评审实锤）：弹窗关闭、或搜索/scope 切换换了列表，
  // 陈旧的 buyTarget 都必须清掉 —— 否则残留面板会把上一个角色挑的付费人格
  // 绑到下一个角色上（弹窗常驻挂载，state 跨开合存活）。
  useEffect(() => {
    setBuyTarget(null);
    setBalance(null);
  }, [open, q, scope]);

  useEffect(() => {
    if (!open || mode !== "pick") return;
    const seq = ++reqSeq.current;
    // 300ms 防抖：输入停顿后才发请求
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        const query = q.trim();
        let merged: Persona[];
        if (scope === "all") {
          // 收藏置顶：收藏列表 + 全部列表并行取，去重后收藏在前
          const [inst, all] = await Promise.all([
            listPersonas({ scope: "installed", sort: "hot", q: query, limit: 12 }),
            listPersonas({ scope: "all", sort: "hot", q: query, limit: 12 }),
          ]);
          const seen = new Set<string>();
          merged = [...(inst.personas || []), ...(all.personas || [])].filter((p) => {
            if (seen.has(p._id)) return false;
            seen.add(p._id);
            return true;
          });
        } else {
          const res = await listPersonas({ scope, sort: "hot", q: query, limit: 12 });
          merged = res.personas || [];
        }
        if (reqSeq.current !== seq) return;
        setPersonas(merged);
      } catch (e) {
        if (reqSeq.current === seq) toast.error(humanizeError(e));
      } finally {
        if (reqSeq.current === seq) setLoading(false);
      }
    }, q ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [open, mode, q, scope]);

  /** 点选人格：免费/已购/自己的直接绑定；付费未购的先进购买确认 */
  function handlePick(p: Persona) {
    if ((p.price || 0) > 0 && !p.purchased && !p.isOwner) {
      setBuyTarget(p);
      setBalance(null);
      getMyPoints()
        .then((res) => setBalance(res.points))
        .catch(() => setBalance(null));
      return;
    }
    setBuyTarget(null);
    onSelect(p);
  }

  async function handleBuyAndBind() {
    if (!buyTarget) return;
    try {
      setBuying(true);
      const res = await purchasePersona(buyTarget._id, buyTarget.price);
      const owned = { ...buyTarget, purchased: true };
      setPersonas((prev) => prev.map((x) => (x._id === owned._id ? owned : x)));
      toast.success(
        res.alreadyOwned
          ? t("arena.personaPicker.alreadyOwned", { name: owned.name })
          : t("arena.personaPicker.purchaseDone", { name: owned.name, price: res.price })
      );
      setBuyTarget(null);
      onSelect(owned);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setBuying(false);
    }
  }

  async function handleGenerate() {
    try {
      setGenerating(true);
      const res = await generatePersonaDraft({ chatText: chatText.trim(), hint: hint.trim() || undefined });
      setDraft(res.draft);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreateAndBind() {
    if (!draft) return;
    try {
      setCreating(true);
      const price = genShared ? Math.min(Math.max(Math.floor(Number(genPriceText) || 0), 0), 100000) : 0;
      const res = await createPersona({ ...draft, shared: genShared, price });
      toast.success(t("arena.personaPicker.generatedCreated", { name: res.persona.name }));
      setDraft(null);
      setChatText("");
      setHint("");
      onSelect(res.persona);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setCreating(false);
    }
  }

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
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-gray-700 bg-gray-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">{t("arena.personaPicker.title")}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* 模式 tab：选人格 / 从聊天记录生成 */}
        <div className="mt-2 flex gap-1 rounded-xl border border-gray-800 bg-gray-950/50 p-1">
          {(
            [
              { value: "pick", label: t("arena.personaPicker.modePick") },
              { value: "generate", label: `✨ ${t("arena.personaPicker.modeGenerate")}` },
            ] as { value: Mode; label: string }[]
          ).map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setMode(tab.value)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                mode === tab.value
                  ? "bg-gray-800 font-semibold text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {mode === "pick" ? (
          <>
            <p className="mt-2 text-xs text-gray-500">{t("arena.personaPicker.intro")}</p>

            {/* 搜索框 + scope tabs */}
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2">
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

            {/* 结果列表（收藏的置顶并标徽） */}
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
                    onClick={() => handlePick(p)}
                    className="flex w-full items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3 text-left hover:border-cyan-700/60 hover:bg-cyan-950/20"
                  >
                    <span className="text-3xl leading-none">{p.coverEmoji || "🎭"}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">{p.name}</span>
                        {p.installed && (
                          <span className="shrink-0 rounded-full border border-amber-500/50 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
                            {t("arena.personaPicker.installedBadge")}
                          </span>
                        )}
                        {(p.price || 0) > 0 && (
                          <span
                            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                              p.purchased || p.isOwner
                                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                                : "border-amber-600/60 bg-amber-950/30 text-amber-300"
                            }`}
                          >
                            {p.purchased
                              ? t("arena.personaPicker.pricePurchased")
                              : p.isOwner
                                ? t("arena.personaPicker.priceOwn")
                                : `💰 ${p.price}`}
                          </span>
                        )}
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

            {/* 购买确认：付费人格点选后先确认支付（显示价格/抽成/余额），确认即购买并绑定 */}
            {buyTarget && (
              <div className="mt-3 rounded-xl border border-amber-600/50 bg-amber-950/20 p-3">
                <p className="text-sm text-amber-100">
                  {t("arena.personaPicker.buyConfirm", { name: buyTarget.name, price: buyTarget.price })}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  {t("arena.personaPicker.buyDetail", {
                    creator: Math.ceil(buyTarget.price * 0.95),
                  })}
                  {balance != null && (
                    <span className="ml-2 text-gray-500">{t("arena.personaPicker.balance", { balance })}</span>
                  )}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={buying}
                    onClick={() => setBuyTarget(null)}
                    className="flex-1 rounded-xl border border-gray-700 px-3 py-1.5 text-xs text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                  >
                    {t("arena.personaPicker.buyCancel")}
                  </button>
                  <button
                    type="button"
                    disabled={buying || (balance != null && balance < buyTarget.price)}
                    onClick={handleBuyAndBind}
                    className="flex-1 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {buying
                      ? t("arena.personaPicker.buying")
                      : balance != null && balance < buyTarget.price
                        ? t("arena.personaPicker.insufficientBalance")
                        : t("arena.personaPicker.buyAndBind")}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto">
            {!draft ? (
              <>
                <p className="text-xs text-gray-500">{t("arena.personaPicker.generateIntro")}</p>
                <div>
                  {/* maxLength 与 server generateBody 的 max(20000) 对齐（zod 拒绝不截断，
                      超了只会得到一句笼统的「请检查输入」）；服务端实际只用前 12000 字，截断无损 */}
                  <textarea
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    maxLength={20000}
                    placeholder={t("arena.personaPicker.chatTextPlaceholder")}
                    className="h-36 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                  />
                  <p className="mt-0.5 text-right text-[11px] text-gray-600">{chatText.length}/20000</p>
                </div>
                <input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder={t("arena.personaPicker.hintPlaceholder")}
                  className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
                />
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={genShared}
                    onChange={(e) => setGenShared(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("arena.personaPicker.sharedLabel")}
                    <span className="block text-[11px] text-gray-500">{t("arena.personaPicker.sharedHint")}</span>
                  </span>
                </label>
                {genShared && (
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-amber-300">💰</span>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      value={genPriceText}
                      onChange={(e) => setGenPriceText(e.target.value)}
                      className="w-24 rounded-lg border border-gray-800 bg-gray-950/50 px-2 py-1.5"
                    />
                    <span className="text-[11px] text-gray-500">{t("arena.personaPicker.genPriceHint")}</span>
                  </div>
                )}
                <button
                  type="button"
                  disabled={chatText.trim().length < 20 || generating}
                  onClick={handleGenerate}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Sparkles size={15} />
                  {generating ? t("arena.personaPicker.generating") : t("arena.personaPicker.generateBtn")}
                </button>
                {chatText.trim().length > 0 && chatText.trim().length < 20 && (
                  <p className="text-center text-[11px] text-gray-500">{t("arena.personaPicker.chatTextTooShort")}</p>
                )}
              </>
            ) : (
              <>
                {/* 草稿预览：确认才落库+绑定 */}
                <div className="rounded-xl border border-purple-700/50 bg-purple-950/20 p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-3xl leading-none">{draft.coverEmoji || "🎭"}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{draft.name}</p>
                      {draft.description && <p className="line-clamp-2 text-xs text-gray-400">{draft.description}</p>}
                    </div>
                  </div>
                  {/* 预览必须展示【全部】将落库的字段（评审实锤）：公开与否是基于预览做的决定，
                      截断展示会让用户公开比他看到的更多的内容（含 stanceHint、全部口头禅） */}
                  {draft.style.summary && (
                    <p className="mt-2 max-h-32 overflow-y-auto text-xs text-gray-300">{draft.style.summary}</p>
                  )}
                  {draft.style.catchphrases.length > 0 && (
                    <p className="mt-2 text-xs text-purple-200/80">
                      {t("arena.personaPicker.catchphrases")}
                      {draft.style.catchphrases.join(" / ")}
                    </p>
                  )}
                  {draft.style.stanceHint && (
                    <p className="mt-1 text-xs text-purple-200/60">
                      {t("arena.personaPicker.stanceHint")}
                      {draft.style.stanceHint}
                    </p>
                  )}
                  {draft.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {draft.tags.map((tag) => (
                        <span key={tag} className="rounded-full border border-cyan-700/60 px-1.5 py-0.5 text-[10px] text-cyan-200">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <label className="flex items-start gap-2 text-xs text-gray-300">
                  <input
                    type="checkbox"
                    checked={genShared}
                    onChange={(e) => setGenShared(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {t("arena.personaPicker.sharedLabel")}
                    <span className="block text-[11px] text-gray-500">{t("arena.personaPicker.sharedHint")}</span>
                  </span>
                </label>
                {genShared && (
                  <div className="flex items-center gap-2 text-xs text-gray-300">
                    <span className="text-amber-300">💰</span>
                    <input
                      type="number"
                      min={0}
                      max={100000}
                      step={1}
                      value={genPriceText}
                      onChange={(e) => setGenPriceText(e.target.value)}
                      className="w-24 rounded-lg border border-gray-800 bg-gray-950/50 px-2 py-1.5"
                    />
                    <span className="text-[11px] text-gray-500">{t("arena.personaPicker.genPriceHint")}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={generating || creating}
                    onClick={() => {
                      setDraft(null);
                      handleGenerate();
                    }}
                    className="flex-1 rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
                  >
                    {t("arena.personaPicker.regenerate")}
                  </button>
                  <button
                    type="button"
                    disabled={creating}
                    onClick={handleCreateAndBind}
                    className="flex-1 rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-500 disabled:opacity-50"
                  >
                    {creating ? t("arena.personaPicker.creating") : t("arena.personaPicker.createAndBind")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
