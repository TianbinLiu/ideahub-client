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
import toast from "react-hot-toast";
import {
  Brain,
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
  getMyStyleProfile,
  listMyBounties,
  listMyScenarios,
  listPersonas,
  listStyleSamples,
  type BountyCard,
  type Persona,
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
  paste: "粘贴",
  capture: "插件抓取",
};

const BOUNTY_STATUS_LABELS: Record<string, string> = {
  open: "进行中",
  closed: "已关闭",
  completed: "已完成",
};

type TabKey = "scenario" | "bounty" | "persona";

const TABS: { key: TabKey; label: string; icon: typeof Swords }[] = [
  { key: "scenario", label: "情景模拟", icon: Swords },
  { key: "bounty", label: "赏金猎人", icon: Target },
  { key: "persona", label: "人格市场", icon: UserRoundCog },
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
  return shared ? (
    <span className="shrink-0 rounded-full border border-cyan-700/60 bg-cyan-950/40 px-2 py-0.5 text-[11px] text-cyan-200">
      已公开
    </span>
  ) : (
    <span className="shrink-0 rounded-full border border-gray-700 bg-gray-800/60 px-2 py-0.5 text-[11px] text-gray-400">
      未公开
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
    if (
      !window.confirm(
        "确定删除你的发言风格档案？\n\n只删除这份 AI 生成的档案（六边形面板 / 点评 / 口头禅），\n不会删除下方的风格记忆样本。之后可以随时重新生成。"
      )
    ) {
      return;
    }
    setDeletingProfile(true);
    try {
      const res = await deleteMyStyleProfile();
      setProfile(null);
      toast.success(res.deleted ? "已删除风格档案" : "你还没有风格档案");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setDeletingProfile(false);
    }
  }

  async function handleAddSamples() {
    const texts = parseSampleTexts(pasteText);
    if (texts.length === 0) {
      toast.error("请先粘贴你自己的发言内容");
      return;
    }
    setAdding(true);
    try {
      const res = await addStyleSamples({ texts, source: "paste" });
      toast.success(`已加入 ${res.added} 条（跳过 ${res.skipped} 条重复）`);
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
      toast.success("已删除该样本");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearSamples() {
    if (!window.confirm("确定清空全部发言样本？此操作不可撤销。")) return;
    setClearing(true);
    try {
      const res = await clearStyleSamples();
      setSamples([]);
      setSampleTotal(0);
      setSamplePage(1);
      setSamplesDirty(true);
      toast.success(`已清空 ${res.deleted} 条样本`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setClearing(false);
    }
  }

  async function handleDeactivate() {
    if (!user) return;
    if (confirmUsername !== user.username) {
      toast.error("请输入与当前用户名完全一致的名字");
      return;
    }
    if (
      !window.confirm(
        `确定停用账号「${user.username}」？\n\n停用后你将无法再登录本站。\n已发布的内容不会被删除。`
      )
    ) {
      return;
    }
    setDeactivating(true);
    try {
      await deactivateAccount(confirmUsername);
      toast.success("账号已停用，已退出登录");
      logout();
      navigate("/", { replace: true });
    } catch (e) {
      toast.error(humanizeError(e));
      setDeactivating(false);
    }
  }

  const parsedCount = parseSampleTexts(pasteText).length;
  const hasMoreSamples = samples.length < sampleTotal;
  const canDeactivate = Boolean(user) && confirmUsername === user?.username && !deactivating;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-20">
      {/* ===== 标题 ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
          <UserRoundCog className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">我的主页</h1>
          <p className="mt-1 text-sm text-gray-400">
            {user ? `@${user.username} · ` : ""}你的发言风格面板、在广场的发布、以及个人记录管理。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link to="/arena/extension" className="text-cyan-300 hover:underline">
            插件设置
          </Link>
          <Link to="/arena" className="text-cyan-300 hover:underline">
            ← 返回卢本伟广场
          </Link>
        </div>
      </div>

      {/* ===== 顶部：六边形面板 + summary ===== */}
      <section className="space-y-3">
        {profileLoading ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : profile ? (
          <StyleStandCard profile={profile} owner />
        ) : (
          <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-8 text-center">
            <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300">
              <Gauge className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm text-gray-300">你还没有生成过发言风格面板。</p>
            <Link to="/arena/style" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
              去分析我的发言风格 →
            </Link>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/arena/style"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-1.5 text-xs text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300"
          >
            <Sparkles className="h-3.5 w-3.5" />
            {profile ? "重新分析发言风格" : "分析我的发言风格"}
          </Link>
          <span className="text-xs text-gray-500">生成 / 重新生成都在「发言风格面板」页进行。</span>
        </div>
      </section>

      {/* ===== 我的发布 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-base font-semibold text-white">我的发布</h2>
        <p className="mt-0.5 text-xs text-gray-500">你在广场三个板块里创建的内容。</p>

        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="我的发布">
          {TABS.map(({ key, label, icon: Icon }) => (
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
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {tabLoading ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : tab === "scenario" ? (
            (scenarios || []).length === 0 ? (
              <MineEmpty text="你还没有创建过情景模拟。" cta="去创建一个情景" to="/arena/simulate/new" />
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
              <MineEmpty text="你还没有发布过悬赏。" cta="去发布悬赏" to="/arena/bounty/new" />
            ) : (
              <ul className="space-y-2.5">
                {(bounties || []).map((b) => (
                  <MineRow key={b._id} to={`/arena/bounty/${b._id}`}>
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="line-clamp-1 text-sm font-semibold text-white">{b.title}</h3>
                      <span className="shrink-0 rounded-full border border-amber-600/50 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">
                        {BOUNTY_STATUS_LABELS[b.status] || b.status}
                      </span>
                    </div>
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
                      <span className="rounded-md bg-gray-800 px-1.5 py-0.5 text-gray-300">{b.platform}</span>
                      <span className="text-amber-200/80">赏金 {b.reward}</span>
                      <span>
                        提交 {b.stats?.submissionCount || 0} · 通过 {b.approvedCount || 0}/{b.slots}
                      </span>
                    </p>
                  </MineRow>
                ))}
              </ul>
            )
          ) : (personas || []).length === 0 ? (
            <MineEmpty text="你还没有发布过人格。" cta="去创建人格" to="/arena/persona/new" />
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
                    {p.equipped ? <span className="text-cyan-300">已装备</span> : null}
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
            <h2 className="text-base font-semibold text-white">个人记录 · 风格记忆</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              只收录你自己的发言。样本越多，风格记忆越准；生成档案时会优先参考这些样本。
            </p>
          </div>
          <span className="ml-auto text-xs text-gray-400">
            共 <span className="font-semibold text-cyan-300">{sampleTotal}</span> 条
          </span>
        </div>

        {/* --- 粘贴录入 --- */}
        <div className="mt-5">
          <label htmlFor="style-sample-input" className="text-sm text-gray-200">
            粘贴你的过往发言
          </label>
          <textarea
            id="style-sample-input"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"每条发言之间空一行分隔，例如：\n\n这游戏平衡性早就崩了，数据摆在那儿。\n\n别急，我慢慢跟你捋一遍时间线。"}
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
              {adding ? "加入中..." : "加入风格记忆"}
            </button>
            <span className="text-xs text-gray-500">
              按空行分隔为多条（单条也可）；已识别 {parsedCount} 条，单次最多 {SAMPLE_MAX_COUNT} 条、每条 {SAMPLE_MAX_LEN} 字。
            </span>
            {sampleTotal > 0 ? (
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearSamples}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-400 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearing ? "清空中..." : "清空全部"}
              </button>
            ) : null}
          </div>
        </div>

        {/* --- 样本变动提示：只提示，不自动生成 --- */}
        {samplesDirty ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            风格记忆已更新。想让新样本生效，请去
            <Link to="/arena/style" className="mx-1 underline hover:text-amber-100">
              发言风格面板
            </Link>
            重新生成档案。
          </p>
        ) : null}

        {/* --- 样本列表 --- */}
        <div className="mt-5">
          {samplesLoading && samples.length === 0 ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : samples.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-400">
              还没有样本 —— 粘贴你的过往发言，或在插件里用 🧠 在你自己的主页/评论页收集。
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
                        {SAMPLE_SOURCE_LABELS[s.source] || s.source}
                      </span>
                      {s.platform ? <span>{s.platform}</span> : null}
                      <span>{s.createdAt ? new Date(s.createdAt).toLocaleString() : ""}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === s._id}
                    onClick={() => handleDeleteSample(s._id)}
                    title="删除该样本"
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
              {samplesLoading ? "加载中..." : `加载更多（还有 ${sampleTotal - samples.length} 条）`}
            </button>
          ) : null}
        </div>

        {/* --- 删除风格档案 --- */}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-800 pt-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white">删除风格档案</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              只删除 AI 生成的那份档案（面板 / 点评 / 口头禅），不会删除上面的风格记忆样本；之后可随时重新生成。
            </p>
          </div>
          <button
            type="button"
            disabled={deletingProfile || profileLoading}
            onClick={handleDeleteProfile}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-400 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deletingProfile ? "删除中..." : "删除风格档案"}
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
            <h2 className="text-base font-semibold text-red-200">危险区 · 注销账号</h2>
            <p className="mt-0.5 text-xs text-red-200/80">停用你的账号。请先看清下面这段说明。</p>
          </div>
        </div>

        <div className="mt-4 space-y-2 rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-100/90">
          <p className="font-semibold text-red-100">这是「停用（软删除）」，不是永久删除：</p>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              账号会被停用，你将<span className="font-semibold text-red-100">无法再登录</span>本站。
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              你<span className="font-semibold text-red-100">已发布的内容不会被删除</span>
              （想法 / 情景模拟 / 悬赏 / 人格 / 评论仍会留在站上）。
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              风格档案与风格记忆样本也不会被这一步删除。想清掉请先用上面的「清空全部」和「删除风格档案」。
            </li>
            <li className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-red-300" />
              想彻底删除数据，请联系管理员单独处理。
            </li>
          </ul>
        </div>

        <div className="mt-4">
          <label htmlFor="deactivate-confirm" className="text-sm text-red-100">
            输入你的用户名 <span className="font-mono font-semibold">{user?.username || ""}</span> 以确认
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <input
              id="deactivate-confirm"
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              autoComplete="off"
              placeholder={user?.username || "用户名"}
              className="min-w-0 flex-1 rounded-xl border border-red-900/70 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-red-500/60 focus:outline-none"
            />
            <button
              type="button"
              disabled={!canDeactivate}
              onClick={handleDeactivate}
              className="shrink-0 rounded-xl border border-red-700 bg-red-900/30 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deactivating ? "停用中..." : "停用我的账号"}
            </button>
          </div>
          <p className="mt-2 text-xs text-red-200/70">用户名不一致时按钮不可用。停用后会立即退出登录并返回首页。</p>
        </div>
      </section>

      {/* ===== 底部：相关入口 ===== */}
      <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-950/40 p-5 text-sm">
        <Link
          to="/arena/extension"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2 text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <Puzzle className="h-4 w-4" /> 插件设置
        </Link>
        <Link
          to="/arena/style"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2 text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300"
        >
          <Gauge className="h-4 w-4" /> 发言风格面板
        </Link>
        <span className="text-xs text-gray-500">账号 / 站点组件等通用设置仍在「设置」页。</span>
      </section>
    </div>
  );
}
