/**
 * @file ArenaProfilePage.tsx - 卢本伟广场 · 我的主页（个人中心）
 * @category Page
 * @route /arena/profile (ProtectedRoute)
 * @i18n none（页面内容以中文为主，与 ArenaPage / StyleProfilePage 等既有广场页面一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 顶部：复用 <StyleStandCard owner /> 展示六边形面板 + summary（getMyStyleProfile）；
 *   无档案时引导去 /arena/style 生成（本页【不做】生成，生成只留在 StyleProfilePage 一处）
 * - 三个 tab —— 我的发布：情景模拟(listMyScenarios) / 赏金猎人(listMyBounties) /
 *   人格市场(listPersonas scope=mine)。按 tab 懒加载，加载过就缓存，不重复请求
 * - 「个人记录」：风格记忆样本管理（由 StyleProfilePage 整块搬来）——
 *   粘贴录入 / 列表 / 删除单条 / 清空全部；外加「删除风格档案」(deleteMyStyleProfile，二次确认)。
 *   样本增删后只提示可去 /arena/style 重新生成，绝不自动触发 AI。
 * - 「危险区」：注销账号 = 【软删除/停用】，不是永久删除。要求输入用户名二次确认 →
 *   deactivateAccount({confirmUsername}) → 清本地登录态 → 跳首页。
 *   ⚠️ 文案不得谎称“永久删除”：账号只是无法登录，已发布内容不会被删除。
 *
 * ★ 本页【不包含】home 页面的任何内容（排行榜 / 帖子 / ideas），只管广场侧的个人数据。
 *
 * 依赖文件:
 * @uses ../components/StyleStandCard.tsx - 六边形面板（纯展示）
 * @uses ../authContext.tsx - 当前用户 / logout（注销成功后清登录态）
 * @uses ../api.ts - getMyStyleProfile / deleteMyStyleProfile / 样本增删查 / 三个 scope=mine 列表 / deactivateAccount
 *
 * 被使用于:
 * @used_in App.tsx - 路由 /arena/profile
 */

import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Brain,
  Coins,
  Gauge,
  Puzzle,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  UserRoundCog,
  Swords,
} from "lucide-react";
import {
  addStyleSamples,
  clearStyleSamples,
  deactivateAccount,
  deleteMyStyleProfile,
  deleteStyleSample,
  getMyPoints,
  getMyStyleProfile,
  listMyBounties,
  listMyPointsLedger,
  listMyScenarios,
  listPersonas,
  listStyleSamples,
  type BountyCard,
  type Persona,
  type PointsLedgerEntry,
  type ScenarioCard,
  type SpeakingProfile,
  type StyleSample,
} from "../api";
import StyleStandCard from "../components/StyleStandCard";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";

/** 风格记忆：每页样本数 / 单条上限 / 单批上限（与后端 samplesBody 校验保持一致） */
const SAMPLE_PAGE_SIZE = 20;
const SAMPLE_MAX_LEN = 1000;
const SAMPLE_MAX_COUNT = 50;

/** 我的发布：每个 tab 拉多少条 */
const MINE_LIMIT = 50;

const SAMPLE_SOURCE_LABELS: Record<string, string> = {
  paste: "sourcePaste",
  capture: "sourceCapture",
};

const BOUNTY_STATUS_LABELS: Record<string, string> = {
  open: "statusOpen",
  closed: "statusClosed",
  completed: "statusCompleted",
};

/** 点数流水：每页条数 */
const LEDGER_PAGE_SIZE = 20;

/** 流水文案：把记账 reason 翻译成人话。★不得出现任何暗示真实货币/收益的说法 */
const LEDGER_REASON_LABELS: Record<PointsLedgerEntry["reason"], string> = {
  signup: "reasonSignup",
  bounty_hold: "reasonBountyHold",
  bounty_reward: "reasonBountyReward",
  bounty_refund: "reasonBountyRefund",
  persona_buy: "reasonPersonaBuy",
  persona_income: "reasonPersonaIncome",
  // 平台内部分录，不会出现在个人流水里；类型上兜一个键防御后端异常
  persona_fee: "reasonPersonaFee",
};

type TabKey = "scenario" | "bounty" | "persona";

const TABS: { key: TabKey; labelKey: string; icon: typeof Swords }[] = [
  { key: "scenario", labelKey: "tabScenario", icon: Swords },
  { key: "bounty", labelKey: "tabBounty", icon: Target },
  { key: "persona", labelKey: "tabPersona", icon: UserRoundCog },
];

/** 把粘贴的整段文本按空行拆成多条（无空行时即单条）；过滤空串、每条截断 1000、最多 50 条。 */
function parseSampleTexts(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.slice(0, SAMPLE_MAX_LEN))
    .slice(0, SAMPLE_MAX_COUNT);
}

/** 我的发布：统一的列表行外壳（三种内容形状不同，但排版一致） */
function MineRow({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        to={to}
        className="block rounded-xl border border-gray-800 bg-gray-950/60 p-4 hover:border-cyan-500/50"
      >
        {children}
      </Link>
    </li>
  );
}

function SharedBadge({ shared }: { shared: boolean }) {
  const { t } = useTranslation();
  return shared ? (
    <span className="shrink-0 rounded-full border border-cyan-700/60 bg-cyan-950/40 px-2 py-0.5 text-[11px] text-cyan-200">
      {t("arena.profile.sharedPublic")}
    </span>
  ) : (
    <span className="shrink-0 rounded-full border border-gray-700 bg-gray-800/60 px-2 py-0.5 text-[11px] text-gray-400">
      {t("arena.profile.sharedPrivate")}
    </span>
  );
}

function MineEmpty({ text, cta, to }: { text: string; cta: string; to: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
      <p className="text-sm text-gray-400">{text}</p>
      <Link to={to} className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
        {cta} →
      </Link>
    </div>
  );
}

export default function ArenaProfilePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // ===== 顶部：风格面板 =====
  const [profile, setProfile] = useState<SpeakingProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [deletingProfile, setDeletingProfile] = useState(false);

  // ===== 我的发布（按 tab 懒加载，null = 还没加载过） =====
  const [tab, setTab] = useState<TabKey>("scenario");
  const [scenarios, setScenarios] = useState<ScenarioCard[] | null>(null);
  const [bounties, setBounties] = useState<BountyCard[] | null>(null);
  const [personas, setPersonas] = useState<Persona[] | null>(null);
  const [tabLoading, setTabLoading] = useState(false);

  // ===== 虚拟点数：余额 + 流水 =====
  const [points, setPoints] = useState<number | null>(null);
  const [pointsLoading, setPointsLoading] = useState(true);
  const [ledger, setLedger] = useState<PointsLedgerEntry[]>([]);
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerLoading, setLedgerLoading] = useState(true);

  // ===== 个人记录：风格记忆样本 =====
  const [samples, setSamples] = useState<StyleSample[]>([]);
  const [sampleTotal, setSampleTotal] = useState(0);
  const [samplePage, setSamplePage] = useState(1);
  const [samplesLoading, setSamplesLoading] = useState(true);
  const [pasteText, setPasteText] = useState("");
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** 样本有增删后置为 true：提示用户可去 /arena/style 手动重新生成（绝不自动触发 AI） */
  const [samplesDirty, setSamplesDirty] = useState(false);

  // ===== 危险区：注销（停用）账号 =====
  const [confirmUsername, setConfirmUsername] = useState("");
  const [deactivating, setDeactivating] = useState(false);

  const loadSamples = useCallback(async (targetPage: number, append: boolean) => {
    setSamplesLoading(true);
    try {
      const res = await listStyleSamples({ page: targetPage, limit: SAMPLE_PAGE_SIZE });
      setSamples((prev) => (append ? [...prev, ...res.samples] : res.samples));
      setSampleTotal(res.total);
      setSamplePage(res.page);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSamplesLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setProfileLoading(true);
        const res = await getMyStyleProfile();
        if (!mounted) return;
        setProfile(res.profile);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setProfileLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void loadSamples(1, false);
  }, [loadSamples]);

  const loadLedger = useCallback(async (targetPage: number, append: boolean) => {
    setLedgerLoading(true);
    try {
      const res = await listMyPointsLedger({ page: targetPage, limit: LEDGER_PAGE_SIZE });
      setLedger((prev) => (append ? [...prev, ...res.entries] : res.entries));
      setLedgerTotal(res.total);
      setLedgerPage(res.page);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setLedgerLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setPointsLoading(true);
        const res = await getMyPoints();
        if (mounted) setPoints(res.points);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setPointsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void loadLedger(1, false);
  }, [loadLedger]);

  // 我的发布：只在首次切到该 tab 时拉一次
  useEffect(() => {
    const alreadyLoaded =
      (tab === "scenario" && scenarios !== null) ||
      (tab === "bounty" && bounties !== null) ||
      (tab === "persona" && personas !== null);
    if (alreadyLoaded) return;

    let mounted = true;
    (async () => {
      setTabLoading(true);
      try {
        if (tab === "scenario") {
          const res = await listMyScenarios({ limit: MINE_LIMIT });
          if (mounted) setScenarios(res.scenarios || []);
        } else if (tab === "bounty") {
          const res = await listMyBounties({ limit: MINE_LIMIT });
          if (mounted) setBounties(res.bounties || []);
        } else {
          const res = await listPersonas({ scope: "mine", limit: MINE_LIMIT });
          if (mounted) setPersonas(res.personas || []);
        }
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setTabLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [tab, scenarios, bounties, personas]);

  async function handleDeleteProfile() {
    if (!window.confirm(t("arena.profile.confirmDeleteProfile"))) {
      return;
    }
    setDeletingProfile(true);
    try {
      const res = await deleteMyStyleProfile();
      setProfile(null);
      toast.success(res.deleted ? t("arena.profile.profileDeleted") : t("arena.profile.noProfileToDelete"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setDeletingProfile(false);
    }
  }

  async function handleAddSamples() {
    const texts = parseSampleTexts(pasteText);
    if (texts.length === 0) {
      toast.error(t("arena.profile.toastPasteFirst"));
      return;
    }
    setAdding(true);
    try {
      const res = await addStyleSamples({ texts, source: "paste" });
      toast.success(t("arena.profile.toastSamplesAdded", { added: res.added, skipped: res.skipped }));
      setPasteText("");
      if (res.added > 0) setSamplesDirty(true);
      await loadSamples(1, false);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteSample(id: string) {
    setDeletingId(id);
    try {
      await deleteStyleSample(id);
      setSamples((prev) => prev.filter((s) => s._id !== id));
      setSampleTotal((prev) => Math.max(prev - 1, 0));
      setSamplesDirty(true);
      toast.success(t("arena.profile.toastSampleDeleted"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearSamples() {
    if (!window.confirm(t("arena.profile.confirmClearSamples"))) return;
    setClearing(true);
    try {
      const res = await clearStyleSamples();
      setSamples([]);
      setSampleTotal(0);
      setSamplePage(1);
      setSamplesDirty(true);
      toast.success(t("arena.profile.toastSamplesCleared", { count: res.deleted }));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setClearing(false);
    }
  }

  async function handleDeactivate() {
    if (!user) return;
    if (confirmUsername !== user.username) {
      toast.error(t("arena.profile.toastUsernameMismatch"));
      return;
    }
    if (!window.confirm(t("arena.profile.confirmDeactivate", { username: user.username }))) {
      return;
    }
    setDeactivating(true);
    try {
      await deactivateAccount(confirmUsername);
      toast.success(t("arena.profile.toastDeactivated"));
      logout();
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(humanizeError(e));
      setDeactivating(false);
    }
  }

  const parsedCount = parseSampleTexts(pasteText).length;
  const hasMoreSamples = samples.length < sampleTotal;
  const hasMoreLedger = ledger.length < ledgerTotal;
  const canDeactivate = Boolean(user) && confirmUsername === user?.username && !deactivating;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-20">
      {/* ===== 标题 ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
          <UserRoundCog className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">{t("arena.profile.pageTitle")}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {user ? `@${user.username} · ` : ""}{t("arena.profile.subtitle")}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link to="/arena/extension" className="text-cyan-300 hover:underline">
            {t("arena.profile.extensionSettings")}
          </Link>
          <Link to="/arena" className="text-cyan-300 hover:underline">
            ← {t("arena.profile.backToArena")}
          </Link>
        </div>
      </div>

      {/* ===== 顶部：六边形面板 + summary ===== */}
      <section className="space-y-3">
        {profileLoading ? (
          <p className="text-sm text-gray-400">{t("arena.profile.loading")}</p>
        ) : profile ? (
          <StyleStandCard profile={profile} owner />
        ) : (
          <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-8 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300">
              <Gauge className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm text-gray-300">{t("arena.profile.noStyleProfile")}</p>
            <Link to="/arena/style" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
              {t("arena.profile.analyzeMyStyleCta")} →
            </Link>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/arena/style"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {profile ? t("arena.profile.reanalyzeStyle") : t("arena.profile.analyzeStyle")}
          </Link>
          <span className="text-xs text-gray-500">{t("arena.profile.generateHint")}</span>
        </div>
      </section>

      {/* ===== 虚拟点数：余额 + 流水 ===== */}
      {/* ★文案红线：这是虚拟点数，无现金价值、不可提现/兑换。
          任何时候都不得改成「余额 / 收益 / 钱包 / ¥」之类暗示真实货币的说法。 */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300">
            <Coins className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">{t("arena.profile.myPoints")}</h2>
            <p className="mt-0.5 text-xs text-gray-500">{t("arena.profile.pointsHint")}</p>
          </div>
          <div className="ml-auto text-right">
            <div className="text-2xl font-bold text-amber-200">
              {pointsLoading ? "—" : (points ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-gray-500">{t("arena.profile.virtualPoints")}</div>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2 text-xs leading-relaxed text-amber-200/90">
          ⚠️ {t("arena.profile.pointsDisclaimerLead")}
          <span className="font-semibold">{t("arena.profile.pointsDisclaimerEmphasis")}</span>
          {t("arena.profile.pointsDisclaimerRest")}
        </p>

        <div className="mt-5">
          <h3 className="text-sm font-semibold text-gray-200">{t("arena.profile.pointsLedger")}</h3>
          {ledgerLoading && ledger.length === 0 ? (
            <p className="mt-3 text-sm text-gray-400">{t("arena.profile.loading")}</p>
          ) : ledger.length === 0 ? (
            <div className="mt-3 rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-400">
              {t("arena.profile.noLedger")}
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {ledger.map((e) => (
                <li
                  key={e._id}
                  className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/60 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-200">{LEDGER_REASON_LABELS[e.reason] ? t(`arena.profile.${LEDGER_REASON_LABELS[e.reason]}`) : e.reason}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                      <span>{e.createdAt ? new Date(e.createdAt).toLocaleString() : ""}</span>
                      {e.memo ? <span className="truncate">· {e.memo}</span> : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {/* delta 正负决定颜色；显式带上 +/- 号，避免「-100」被看成「100」 */}
                    <div
                      className={`text-sm font-semibold tabular-nums ${
                        e.delta >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {e.delta >= 0 ? "+" : "−"}
                      {Math.abs(e.delta).toLocaleString()}
                    </div>
                    {e.balanceAfter !== null ? (
                      <div className="text-[11px] text-gray-600 tabular-nums">{t("arena.profile.balanceAfter", { balance: e.balanceAfter.toLocaleString() })}</div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {hasMoreLedger ? (
            <button
              type="button"
              disabled={ledgerLoading}
              onClick={() => loadLedger(ledgerPage + 1, true)}
              className="mt-3 w-full rounded-xl border border-gray-800 py-2 text-sm text-gray-300 hover:border-amber-500/50 hover:text-amber-300 disabled:opacity-60"
            >
              {ledgerLoading ? t("arena.profile.loading") : t("arena.profile.loadMore", { count: ledgerTotal - ledger.length })}
            </button>
          ) : null}
        </div>
      </section>

      {/* ===== 我的发布 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-base font-semibold text-white">{t("arena.profile.myPosts")}</h2>
        <p className="mt-0.5 text-xs text-gray-500">{t("arena.profile.myPostsHint")}</p>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label={t("arena.profile.myPosts")}>
          {TABS.map(({ key, labelKey, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-medium ${
                tab === key
                  ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-200"
                  : "border-gray-800 text-gray-300 hover:bg-gray-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t(`arena.profile.${labelKey}`)}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tabLoading ? (
            <p className="text-sm text-gray-400">{t("arena.profile.loading")}</p>
          ) : tab === "scenario" ? (
            (scenarios || []).length === 0 ? (
              <MineEmpty text={t("arena.profile.emptyScenarios")} cta={t("arena.profile.createScenario")} to="/arena/simulate/new" />
            ) : (
              <ul className="space-y-2.5">
                {(scenarios || []).map((s) => (
                  <MineRow key={s._id} to={`/arena/simulate/${s._id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="line-clamp-1 text-sm font-semibold text-white">{s.title}</h3>
                      <SharedBadge shared={s.shared} />
                    </div>
                    {s.summary ? (
                      <p className="mt-1 line-clamp-2 text-xs text-gray-400">{s.summary}</p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className="rounded-md bg-gray-800 px-1.5 py-0.5 text-gray-300">{s.platform}</span>
                      <span>👁 {s.stats?.viewCount || 0}</span>
                      <span>❤ {s.stats?.likeCount || 0}</span>
                      <span>▶ {s.stats?.playCount || 0}</span>
                    </p>
                  </MineRow>
                ))}
              </ul>
            )
          ) : tab === "bounty" ? (
            (bounties || []).length === 0 ? (
              <MineEmpty text={t("arena.profile.emptyBounties")} cta={t("arena.profile.createBounty")} to="/arena/bounty/new" />
            ) : (
              <ul className="space-y-2.5">
                {(bounties || []).map((b) => (
                  <MineRow key={b._id} to={`/arena/bounty/${b._id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="line-clamp-1 text-sm font-semibold text-white">{b.title}</h3>
                      <span className="shrink-0 rounded-full border border-amber-600/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                        {BOUNTY_STATUS_LABELS[b.status] ? t(`arena.profile.${BOUNTY_STATUS_LABELS[b.status]}`) : b.status}
                      </span>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className="rounded-md bg-gray-800 px-1.5 py-0.5 text-gray-300">{b.platform}</span>
                      <span className="text-amber-200/80">{t("arena.profile.rewardAmount", { reward: b.reward })}</span>
                      <span>
                        {t("arena.profile.bountyStats", {
                          submissions: b.stats?.submissionCount || 0,
                          approved: b.approvedCount || 0,
                          slots: b.slots,
                        })}
                      </span>
                    </p>
                  </MineRow>
                ))}
              </ul>
            )
          ) : (personas || []).length === 0 ? (
            <MineEmpty text={t("arena.profile.emptyPersonas")} cta={t("arena.profile.createPersona")} to="/arena/persona/new" />
          ) : (
            <ul className="space-y-2.5">
              {(personas || []).map((p) => (
                <MineRow key={p._id} to={`/arena/persona/${p._id}`}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-1 text-sm font-semibold text-white">
                      <span className="mr-1.5">{p.coverEmoji}</span>
                      {p.name}
                    </h3>
                    <SharedBadge shared={p.shared} />
                  </div>
                  {p.description ? (
                    <p className="mt-1 line-clamp-2 text-xs text-gray-400">{p.description}</p>
                  ) : null}
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                    <span>⬇ {p.stats?.downloadCount || 0}</span>
                    <span>❤ {p.stats?.likeCount || 0}</span>
                    {p.equipped ? <span className="text-cyan-300">{t("arena.profile.equipped")}</span> : null}
                  </p>
                </MineRow>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ===== 个人记录：风格记忆样本 + 删除风格档案 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">{t("arena.profile.styleMemoryTitle")}</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              {t("arena.profile.styleMemoryHint")}
            </p>
          </div>
          <span className="ml-auto text-xs text-gray-400">
            {t("arena.profile.samplesTotalPrefix")}<span className="font-semibold text-cyan-300">{sampleTotal}</span>{t("arena.profile.samplesTotalSuffix")}
          </span>
        </div>

        {/* --- 粘贴录入 --- */}
        <div className="mt-5">
          <label htmlFor="style-sample-input" className="text-sm text-gray-200">
            {t("arena.profile.pasteLabel")}
          </label>
          <textarea
            id="style-sample-input"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={t("arena.profile.pastePlaceholder")}
            className="mt-2 w-full resize-y rounded-xl border border-gray-800 bg-gray-950 p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={adding || parsedCount === 0}
              onClick={handleAddSamples}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
            >
              <Brain className="h-4 w-4" />
              {adding ? t("arena.profile.adding") : t("arena.profile.addToMemory")}
            </button>
            <span className="text-xs text-gray-500">
              {t("arena.profile.pasteHint", { count: parsedCount, max: SAMPLE_MAX_COUNT, maxLen: SAMPLE_MAX_LEN })}
            </span>
            {sampleTotal > 0 ? (
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearSamples}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-400 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearing ? t("arena.profile.clearing") : t("arena.profile.clearAll")}
              </button>
            ) : null}
          </div>
        </div>

        {/* --- 样本变动提示：只提示，不自动生成 --- */}
        {samplesDirty ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {t("arena.profile.samplesDirtyPrefix")}
            <Link to="/arena/style" className="mx-1 underline hover:text-amber-100">
              {t("arena.profile.styleProfileLink")}
            </Link>
            {t("arena.profile.samplesDirtySuffix")}
          </p>
        ) : null}

        {/* --- 样本列表 --- */}
        <div className="mt-5">
          {samplesLoading && samples.length === 0 ? (
            <p className="text-sm text-gray-400">{t("arena.profile.loading")}</p>
          ) : samples.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-400">
              {t("arena.profile.emptySamples")}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {samples.map((s) => (
                <li
                  key={s._id}
                  className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-gray-200">{s.text}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                      <span className="rounded-md bg-gray-800 px-1.5 py-0.5 text-gray-300">
                        {SAMPLE_SOURCE_LABELS[s.source] ? t(`arena.profile.${SAMPLE_SOURCE_LABELS[s.source]}`) : s.source}
                      </span>
                      {s.platform ? <span>{s.platform}</span> : null}
                      <span>{s.createdAt ? new Date(s.createdAt).toLocaleString() : ""}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === s._id}
                    onClick={() => handleDeleteSample(s._id)}
                    title={t("arena.profile.deleteSampleTitle")}
                    className="shrink-0 rounded-lg border border-gray-800 p-1.5 text-gray-500 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasMoreSamples ? (
            <button
              type="button"
              disabled={samplesLoading}
              onClick={() => loadSamples(samplePage + 1, true)}
              className="mt-3 w-full rounded-xl border border-gray-800 py-2 text-sm text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-60"
            >
              {samplesLoading ? t("arena.profile.loading") : t("arena.profile.loadMore", { count: sampleTotal - samples.length })}
            </button>
          ) : null}
        </div>

        {/* --- 删除风格档案 --- */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-800 pt-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">{t("arena.profile.deleteStyleProfile")}</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {t("arena.profile.deleteStyleProfileHint")}
            </p>
          </div>
          <button
            type="button"
            disabled={deletingProfile || profileLoading}
            onClick={handleDeleteProfile}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-400 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deletingProfile ? t("arena.profile.deleting") : t("arena.profile.deleteStyleProfile")}
          </button>
        </div>
      </section>

      {/* ===== 危险区：注销（停用）账号 ===== */}
      <section className="rounded-2xl border border-red-900/70 bg-red-950/20 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-500/15 text-red-300">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-red-200">{t("arena.profile.dangerZoneTitle")}</h2>
            <p className="mt-0.5 text-xs text-red-200/80">{t("arena.profile.dangerZoneHint")}</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-100/90">
          <p className="font-semibold text-red-100">{t("arena.profile.softDeleteTitle")}</p>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              {t("arena.profile.deactivateBullet1Prefix")}<span className="font-semibold text-red-100">{t("arena.profile.deactivateBullet1Emphasis")}</span>{t("arena.profile.deactivateBullet1Suffix")}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              {t("arena.profile.deactivateBullet2Prefix")}<span className="font-semibold text-red-100">{t("arena.profile.deactivateBullet2Emphasis")}</span>
              {t("arena.profile.deactivateBullet2Suffix")}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              {t("arena.profile.deactivateBullet3")}
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              {t("arena.profile.deactivateBullet4")}
            </li>
          </ul>
        </div>

        <div className="mt-4">
          <label htmlFor="deactivate-confirm" className="text-sm text-red-100">
            {t("arena.profile.confirmUsernamePrefix")}<span className="font-mono font-semibold">{user?.username || ""}</span>{t("arena.profile.confirmUsernameSuffix")}
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              id="deactivate-confirm"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              autoComplete="off"
              placeholder={user?.username || t("arena.profile.usernamePlaceholder")}
              className="min-w-0 flex-1 rounded-xl border border-red-900/70 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-red-500/60 focus:outline-none"
            />
            <button
              type="button"
              disabled={!canDeactivate}
              onClick={handleDeactivate}
              className="shrink-0 rounded-xl border border-red-700 bg-red-900/30 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deactivating ? t("arena.profile.deactivating") : t("arena.profile.deactivateAccount")}
            </button>
          </div>
          <p className="mt-2 text-xs text-red-200/70">{t("arena.profile.deactivateFootnote")}</p>
        </div>
      </section>

      {/* ===== 底部：相关入口 ===== */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 text-sm">
        <Link
          to="/arena/extension"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2 text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <Puzzle className="h-4 w-4" /> {t("arena.profile.extensionSettings")}
        </Link>
        <Link
          to="/arena/style"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2 text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <Gauge className="h-4 w-4" /> {t("arena.profile.styleProfileLink")}
        </Link>
        <span className="text-xs text-gray-500">{t("arena.profile.settingsFootnote")}</span>
      </section>
    </div>
  );
}
