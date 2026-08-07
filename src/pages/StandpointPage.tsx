/**
 * @file StandpointPage.tsx - 立场展开 · 控制台
 * @category Page
 * @route /arena/standpoint (ProtectedRoute)
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 配置每个用户的“后台监控代理（OpenClaw 监控引擎）”：立场 / 人格 / 知识库 / 开关
 * - 绑定演示账号、模拟一条来消息、查看事件流并批准/重生成/忽略回复
 *
 * 安全说明（演示环境）:
 * - 不存储真实凭证、不真正登录、不真正向第三方平台发帖
 * - “发送”仅在本系统内标记为已回复（模拟/记录）
 * - 自动发送（autoSendEnabled）默认关闭
 *
 * 被使用于:
 * @used_in App.tsx - 路由 /arena/standpoint
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import {
  Activity,
  AlertTriangle,
  Pause,
  Play,
  Plus,
  Radar,
  RefreshCw,
  Send,
  ShieldAlert,
  Square,
  Trash2,
  X,
} from "lucide-react";
import {
  addStandpointAccount,
  dismissStandpointEvent,
  getStandpoint,
  listStandpointEvents,
  regenerateStandpointReply,
  removeStandpointAccount,
  sendStandpointReply,
  setStandpointStatus,
  simulateStandpointEvent,
  updateStandpointConfig,
  type StandpointAgent,
  type StandpointConfig,
  type StandpointEvent,
} from "../api";
import { humanizeError } from "../utils/humanizeError";

const PLATFORM_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "weibo", labelKey: "platformWeibo" },
  { value: "bilibili", labelKey: "platformBilibili" },
  { value: "zhihu", labelKey: "platformZhihu" },
  { value: "tieba", labelKey: "platformTieba" },
  { value: "douyin", labelKey: "platformDouyin" },
  { value: "xiaohongshu", labelKey: "platformXiaohongshu" },
  { value: "instagram", labelKey: "platformInstagram" },
];

const STANCE_OPTIONS: { value: StandpointConfig["stance"]; labelKey: string; hintKey: string }[] = [
  { value: "aggressive", labelKey: "stanceAggressive", hintKey: "stanceAggressiveHint" },
  { value: "peaceful", labelKey: "stancePeaceful", hintKey: "stancePeacefulHint" },
  { value: "rational", labelKey: "stanceRational", hintKey: "stanceRationalHint" },
  { value: "sarcastic", labelKey: "stanceSarcastic", hintKey: "stanceSarcasticHint" },
];

const CLASSIFICATION_META: Record<StandpointEvent["classification"], { labelKey: string; cls: string }> = {
  malicious: { labelKey: "classMalicious", cls: "border-rose-600/60 bg-rose-500/10 text-rose-200" },
  question: { labelKey: "classQuestion", cls: "border-blue-600/60 bg-blue-500/10 text-blue-200" },
  request: { labelKey: "classRequest", cls: "border-cyan-600/60 bg-cyan-500/10 text-cyan-200" },
  other: { labelKey: "classOther", cls: "border-gray-600/60 bg-gray-500/10 text-gray-300" },
};

const STATUS_META: Record<StandpointEvent["status"], { labelKey: string; cls: string }> = {
  pending: { labelKey: "statusPending", cls: "border-gray-600/60 bg-gray-500/10 text-gray-300" },
  drafted: { labelKey: "statusDrafted", cls: "border-amber-600/60 bg-amber-500/10 text-amber-200" },
  sent: { labelKey: "statusSent", cls: "border-emerald-600/60 bg-emerald-500/10 text-emerald-200" },
  dismissed: { labelKey: "statusDismissed", cls: "border-gray-700 bg-gray-800/40 text-gray-500" },
};

const ENGINE_META: Record<StandpointAgent["status"], { labelKey: string; cls: string }> = {
  running: { labelKey: "engineRunning", cls: "border-emerald-600/60 bg-emerald-500/10 text-emerald-200" },
  paused: { labelKey: "enginePaused", cls: "border-amber-600/60 bg-amber-500/10 text-amber-200" },
  stopped: { labelKey: "engineStopped", cls: "border-gray-600/60 bg-gray-500/10 text-gray-300" },
};

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

function Toggle({
  checked,
  onChange,
  disabled,
  activeColor = "bg-cyan-500",
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? activeColor : "bg-gray-700"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function StandpointPage() {
  const { t } = useTranslation();

  const platformLabel = (value: string) => {
    const p = PLATFORM_OPTIONS.find((x) => x.value === value);
    return p ? t(`arena.standpoint.${p.labelKey}`) : value;
  };

  const kindLabel = (kind: StandpointEvent["kind"]) =>
    kind === "dm" ? t("arena.standpoint.kindDm") : t("arena.standpoint.kindReply");

  const [agent, setAgent] = useState<StandpointAgent | null>(null);
  const [events, setEvents] = useState<StandpointEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(true);

  const [statusBusy, setStatusBusy] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [accountBusy, setAccountBusy] = useState(false);
  const addAccountRef = useRef(false);
  const [simulating, setSimulating] = useState(false);
  const [eventBusy, setEventBusy] = useState<string | null>(null);

  // 人格与知识库文本本地镜像（仅在初始加载时同步，避免覆盖未保存的编辑）
  const [personaText, setPersonaText] = useState("");
  const [personalInfo, setPersonalInfo] = useState("");

  // 绑定账号表单
  const [newPlatform, setNewPlatform] = useState(PLATFORM_OPTIONS[0].value);
  const [newHandle, setNewHandle] = useState("");

  // 模拟一条来消息表单
  const [simKind, setSimKind] = useState<"dm" | "reply">("reply");
  const [simPlatform, setSimPlatform] = useState(PLATFORM_OPTIONS[0].value);
  const [simFromHandle, setSimFromHandle] = useState("");
  const [simText, setSimText] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      // 代理（含配置/状态）是主体，独立加载
      try {
        setLoading(true);
        const a = await getStandpoint();
        if (!mounted) return;
        setAgent(a.agent);
        setPersonaText(a.agent.config.personaText || "");
        setPersonalInfo(a.agent.config.personalInfo || "");
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
      // 事件流独立加载，失败不拖垮整个代理面板
      try {
        setEventsLoading(true);
        const ev = await listStandpointEvents({ limit: 50 });
        if (mounted) setEvents(ev.events || []);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setEventsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 刷新代理（含 stats），不回写文本镜像
  async function reloadAgent() {
    try {
      const res = await getStandpoint();
      setAgent(res.agent);
    } catch {
      // 保留当前状态
    }
  }

  async function handleSetStatus(status: "running" | "paused" | "stopped") {
    setStatusBusy(true);
    try {
      const res = await setStandpointStatus(status);
      setAgent(res.agent);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setStatusBusy(false);
    }
  }

  async function patchConfig(partial: Partial<StandpointConfig>) {
    setSavingConfig(true);
    try {
      const res = await updateStandpointConfig(partial);
      setAgent(res.agent);
      toast.success(t("arena.standpoint.toastSaved"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleAddAccount() {
    const handle = newHandle.trim();
    // 用 ref 做同步重入保护：连续回车不会重复登记（setState 是异步的，state 判断挡不住）
    if (!handle || addAccountRef.current) return;
    addAccountRef.current = true;
    setAccountBusy(true);
    try {
      const res = await addStandpointAccount({ platform: newPlatform, handle });
      setAgent(res.agent);
      setNewHandle("");
      toast.success(t("arena.standpoint.toastAccountRegistered"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      addAccountRef.current = false;
      setAccountBusy(false);
    }
  }

  async function handleRemoveAccount(accountId: string) {
    setAccountBusy(true);
    try {
      const res = await removeStandpointAccount(accountId);
      setAgent(res.agent);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setAccountBusy(false);
    }
  }

  async function handleSimulate() {
    const fromHandle = simFromHandle.trim();
    const incomingText = simText.trim();
    if (!fromHandle || !incomingText) {
      toast.error(t("arena.standpoint.toastFillSourceAndContent"));
      return;
    }
    setSimulating(true);
    try {
      const res = await simulateStandpointEvent({
        kind: simKind,
        platform: simPlatform,
        fromHandle,
        incomingText,
      });
      setEvents((prev) => [res.event, ...prev]);
      setSimText("");
      await reloadAgent();
      toast.success(t("arena.standpoint.toastMessageFed"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSimulating(false);
    }
  }

  function fillMaliciousExample() {
    setSimKind("reply");
    setSimFromHandle("hater_233");
    setSimText(t("arena.standpoint.exampleMaliciousText"));
  }

  function fillQuestionExample() {
    setSimKind("dm");
    setSimFromHandle("fan_xiaobai");
    setSimText(t("arena.standpoint.exampleQuestionText"));
  }

  async function handleSendEvent(id: string) {
    setEventBusy(id);
    try {
      const res = await sendStandpointReply(id);
      setEvents((prev) => prev.map((ev) => (ev._id === id ? res.event : ev)));
      await reloadAgent();
      toast.success(t("arena.standpoint.toastMarkedReplied"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setEventBusy(null);
    }
  }

  async function handleRegenerate(id: string) {
    setEventBusy(id);
    try {
      const res = await regenerateStandpointReply(id);
      setEvents((prev) => prev.map((ev) => (ev._id === id ? res.event : ev)));
      toast.success(t("arena.standpoint.toastReplyRegenerated"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setEventBusy(null);
    }
  }

  async function handleDismiss(id: string) {
    setEventBusy(id);
    try {
      const res = await dismissStandpointEvent(id);
      setEvents((prev) => prev.map((ev) => (ev._id === id ? res.event : ev)));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setEventBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl p-4 pb-20">
        <p className="text-gray-400">{t("arena.standpoint.loading")}</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-5xl p-4 pb-20">
        <p className="text-gray-400">{t("arena.standpoint.loadAgentFailed")}</p>
      </div>
    );
  }

  const config = agent.config;
  const engineMeta = ENGINE_META[agent.status];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-20">
      {/* ===== 标题 ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
          <Radar className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">{t("arena.standpoint.title")}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.standpoint.subtitle")}
          </p>
        </div>
        <Link to="/arena" className="ml-auto text-sm text-cyan-300 hover:underline">
          ← {t("arena.standpoint.backToArena")}
        </Link>
      </div>

      {/* ===== 安全提示条 ===== */}
      <div className="rounded-2xl border border-amber-600/50 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="text-sm leading-relaxed text-amber-100">
            <div className="font-semibold text-amber-200">{t("arena.standpoint.safetyTitle")}</div>
            <ul className="mt-2 space-y-1 text-amber-100/90">
              <li>· {t("arena.standpoint.safetyItem1Lead")}<b>{t("arena.standpoint.safetyItem1Strong")}</b>{t("arena.standpoint.safetyItem1Tail")}</li>
              <li>· <b>{t("arena.standpoint.safetyItem2Strong")}</b>{t("arena.standpoint.safetyItem2Tail")}</li>
              <li>· {t("arena.standpoint.safetyItem3")}</li>
              <li>· <b>{t("arena.standpoint.safetyItem4Strong")}</b>{t("arena.standpoint.safetyItem4Tail")}</li>
              <li>· <b>{t("arena.standpoint.safetyItem5Strong")}</b>{t("arena.standpoint.safetyItem5Tail")}</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ===== 代理状态卡 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
              <Activity className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-white">{t("arena.standpoint.engineName")}</h2>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${engineMeta.cls}`}>
                  {t(`arena.standpoint.${engineMeta.labelKey}`)}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">{t("arena.standpoint.lastActive", { time: formatTime(agent.lastActiveAt) })}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={statusBusy || agent.status === "running"}
              onClick={() => handleSetStatus("running")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> {t("arena.standpoint.start")}
            </button>
            <button
              type="button"
              disabled={statusBusy || agent.status !== "running"}
              onClick={() => handleSetStatus("paused")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800 disabled:opacity-50"
            >
              <Pause className="h-4 w-4" /> {t("arena.standpoint.pause")}
            </button>
            <button
              type="button"
              disabled={statusBusy || agent.status === "stopped"}
              onClick={() => handleSetStatus("stopped")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800 disabled:opacity-50"
            >
              <Square className="h-4 w-4" /> {t("arena.standpoint.stop")}
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { k: "detected", label: t("arena.standpoint.statDetected"), value: agent.stats.detected },
            { k: "drafted", label: t("arena.standpoint.statDrafted"), value: agent.stats.drafted },
            { k: "sent", label: t("arena.standpoint.statSent"), value: agent.stats.sent },
          ].map((s) => (
            <div key={s.k} className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="mt-1 text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 配置面板 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <h2 className="text-lg font-semibold text-white">{t("arena.standpoint.configTitle")}</h2>

        {/* 立场 */}
        <div>
          <div className="mb-2 text-sm font-medium text-gray-200">{t("arena.standpoint.stanceLabel")}</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {STANCE_OPTIONS.map((opt) => {
              const active = config.stance === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={savingConfig}
                  onClick={() => {
                    if (!active) void patchConfig({ stance: opt.value });
                  }}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-60 ${
                    active
                      ? "border-cyan-500/70 bg-cyan-500/10 text-cyan-100"
                      : "border-gray-800 bg-gray-950/50 text-gray-300 hover:bg-gray-800/60"
                  }`}
                >
                  <div className="text-sm font-semibold">{t(`arena.standpoint.${opt.labelKey}`)}</div>
                  <div className="mt-0.5 text-[11px] text-gray-400">{t(`arena.standpoint.${opt.hintKey}`)}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 人格描述 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">{t("arena.standpoint.personaLabel")}</label>
          <textarea
            value={personaText}
            onChange={(e) => setPersonaText(e.target.value)}
            placeholder={t("arena.standpoint.personaPlaceholder")}
            className="min-h-[80px] w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
        </div>

        {/* 个人信息 / 知识库 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">{t("arena.standpoint.personalInfoLabel")}</label>
          <textarea
            value={personalInfo}
            onChange={(e) => setPersonalInfo(e.target.value)}
            placeholder={t("arena.standpoint.personalInfoPlaceholder")}
            className="min-h-[100px] w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            {t("arena.standpoint.personalInfoHint")}
          </p>
        </div>

        <button
          type="button"
          disabled={savingConfig}
          onClick={() => void patchConfig({ personaText, personalInfo })}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {savingConfig ? t("arena.standpoint.saving") : t("arena.standpoint.savePersona")}
        </button>

        {/* 开关 */}
        <div className="space-y-3 border-t border-gray-800 pt-4">
          {/* 自动发送（红色警告） */}
          <div className="rounded-xl border border-rose-800/50 bg-rose-950/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <div>
                  <div className="text-sm font-semibold text-rose-100">{t("arena.standpoint.autoSendTitle")}</div>
                  <p className="mt-0.5 text-xs text-rose-200/80">
                    {t("arena.standpoint.autoSendDescLead")}<b>{t("arena.standpoint.autoSendDescStrong")}</b>{t("arena.standpoint.autoSendDescTail")}
                  </p>
                </div>
              </div>
              <Toggle
                checked={config.autoSendEnabled}
                disabled={savingConfig}
                activeColor="bg-rose-500"
                onChange={() => void patchConfig({ autoSendEnabled: !config.autoSendEnabled })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/50 p-3">
            <div>
              <div className="text-sm font-medium text-gray-200">{t("arena.standpoint.replyMaliciousTitle")}</div>
              <p className="mt-0.5 text-xs text-gray-500">{t("arena.standpoint.replyMaliciousDesc")}</p>
            </div>
            <Toggle
              checked={config.replyToMalicious}
              disabled={savingConfig}
              onChange={() => void patchConfig({ replyToMalicious: !config.replyToMalicious })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/50 p-3">
            <div>
              <div className="text-sm font-medium text-gray-200">{t("arena.standpoint.replyQuestionsTitle")}</div>
              <p className="mt-0.5 text-xs text-gray-500">{t("arena.standpoint.replyQuestionsDesc")}</p>
            </div>
            <Toggle
              checked={config.replyToQuestions}
              disabled={savingConfig}
              onChange={() => void patchConfig({ replyToQuestions: !config.replyToQuestions })}
            />
          </div>
        </div>
      </section>

      {/* ===== 绑定账号 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("arena.standpoint.accountsTitle")}</h2>
          <p className="mt-1 text-xs text-gray-500">{t("arena.standpoint.accountsHint")}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          >
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {t(`arena.standpoint.${p.labelKey}`)}
              </option>
            ))}
          </select>
          <input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddAccount();
            }}
            placeholder={t("arena.standpoint.handlePlaceholder")}
            className="min-w-[180px] flex-1 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
          <button
            type="button"
            disabled={accountBusy || !newHandle.trim()}
            onClick={handleAddAccount}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> {t("arena.standpoint.add")}
          </button>
        </div>

        {agent.accounts.length === 0 ? (
          <p className="text-sm text-gray-500">{t("arena.standpoint.noAccounts")}</p>
        ) : (
          <ul className="space-y-2">
            {agent.accounts.map((acc) => (
              <li
                key={acc.id}
                className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2.5"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
                    {platformLabel(acc.platform)}
                  </span>
                  <span className="text-sm text-white">@{acc.handle}</span>
                  {acc.connected ? (
                    <span className="rounded-full border border-emerald-600/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
                      {t("arena.standpoint.registered")}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={accountBusy}
                  onClick={() => handleRemoveAccount(acc.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> {t("arena.standpoint.delete")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== 模拟一条来消息 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("arena.standpoint.simulateTitle")}</h2>
          <p className="mt-1 text-xs text-gray-500">
            {t("arena.standpoint.simulateHint")}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fillMaliciousExample}
            className="rounded-lg border border-rose-800/60 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-950/40"
          >
            {t("arena.standpoint.fillMaliciousExample")}
          </button>
          <button
            type="button"
            onClick={fillQuestionExample}
            className="rounded-lg border border-blue-800/60 bg-blue-950/20 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-950/40"
          >
            {t("arena.standpoint.fillQuestionExample")}
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={simKind}
            onChange={(e) => setSimKind(e.target.value as "dm" | "reply")}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          >
            <option value="reply">{t("arena.standpoint.kindReply")}</option>
            <option value="dm">{t("arena.standpoint.kindDm")}</option>
          </select>
          <select
            value={simPlatform}
            onChange={(e) => setSimPlatform(e.target.value)}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          >
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {t(`arena.standpoint.${p.labelKey}`)}
              </option>
            ))}
          </select>
          <input
            value={simFromHandle}
            onChange={(e) => setSimFromHandle(e.target.value)}
            placeholder={t("arena.standpoint.fromHandlePlaceholder")}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
        </div>

        <textarea
          value={simText}
          onChange={(e) => setSimText(e.target.value)}
          placeholder={t("arena.standpoint.simTextPlaceholder")}
          className="min-h-[80px] w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
        />

        <button
          type="button"
          disabled={simulating || !simFromHandle.trim() || !simText.trim()}
          onClick={handleSimulate}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {simulating ? t("arena.standpoint.processing") : t("arena.standpoint.feedMessage")}
        </button>
      </section>

      {/* ===== 事件流 ===== */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">{t("arena.standpoint.eventStreamTitle")}</h2>

        {eventsLoading ? (
          <p className="text-sm text-gray-400">{t("arena.standpoint.loading")}</p>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">{t("arena.standpoint.noEvents")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {events.map((ev) => {
              const cMeta = CLASSIFICATION_META[ev.classification];
              const sMeta = STATUS_META[ev.status];
              const busy = eventBusy === ev._id;
              const canSend = ev.status === "drafted";
              const canDismiss = ev.status !== "dismissed";
              const canRegenerate = ev.status !== "dismissed";
              return (
                <div key={ev._id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
                      {kindLabel(ev.kind)}
                    </span>
                    <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
                      {platformLabel(ev.platform)}
                    </span>
                    <span className="text-sm font-medium text-white">@{ev.fromHandle}</span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${cMeta.cls}`}>
                      {t(`arena.standpoint.${cMeta.labelKey}`)}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${sMeta.cls}`}>
                      {t(`arena.standpoint.${sMeta.labelKey}`)}
                    </span>
                    {ev.autoSent ? (
                      <span className="rounded-full border border-emerald-600/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                        {t("arena.standpoint.autoReplied")}
                      </span>
                    ) : null}
                    {ev.threadUrl ? (
                      <a
                        href={ev.threadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] font-medium text-cyan-300 hover:bg-gray-800"
                      >
                        {t("arena.standpoint.goToPost")} ↗
                      </a>
                    ) : null}
                    <span className="ml-auto text-[11px] text-gray-500">{formatTime(ev.createdAt)}</span>
                  </div>

                  <p className="mt-3 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-200">
                    {ev.incomingText}
                  </p>

                  {ev.reply ? (
                    <div className="mt-3 rounded-xl border border-cyan-900/40 bg-cyan-950/20 px-3 py-2">
                      <div className="mb-1 flex items-center gap-2 text-[11px] text-cyan-300/80">
                        <span>{t("arena.standpoint.agentReply")}</span>
                        <span className="rounded-full border border-cyan-800/60 px-1.5 py-0.5">{ev.reply.style}</span>
                        {ev.reply.heuristic ? (
                          <span className="rounded-full border border-gray-700 bg-gray-800/60 px-1.5 py-0.5 text-gray-400">
                            {t("arena.standpoint.heuristicNoAi")}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-cyan-50">{ev.reply.text}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">{t("arena.standpoint.noReplyYet")}</p>
                  )}

                  {canSend || canRegenerate || canDismiss ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canSend ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleSendEvent(ev._id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
                        >
                          <Send className="h-3.5 w-3.5" /> {t("arena.standpoint.markReplied")}
                        </button>
                      ) : null}
                      {canRegenerate ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRegenerate(ev._id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> {t("arena.standpoint.regenerate")}
                        </button>
                      ) : null}
                      {canDismiss ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDismiss(ev._id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-gray-800 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" /> {t("arena.standpoint.ignore")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
