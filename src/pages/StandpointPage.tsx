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
import { Link } from "react-router-dom";
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

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "weibo", label: "微博" },
  { value: "bilibili", label: "哔哩哔哩" },
  { value: "zhihu", label: "知乎" },
  { value: "tieba", label: "贴吧" },
  { value: "douyin", label: "抖音" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "instagram", label: "Instagram" },
];

const STANCE_OPTIONS: { value: StandpointConfig["stance"]; label: string; hint: string }[] = [
  { value: "aggressive", label: "激进", hint: "强硬回击" },
  { value: "peaceful", label: "和平", hint: "克制化解" },
  { value: "rational", label: "理性", hint: "讲道理" },
  { value: "sarcastic", label: "阴阳", hint: "阴阳怪气" },
];

const CLASSIFICATION_META: Record<StandpointEvent["classification"], { label: string; cls: string }> = {
  malicious: { label: "恶意", cls: "border-rose-600/60 bg-rose-500/10 text-rose-200" },
  question: { label: "提问", cls: "border-blue-600/60 bg-blue-500/10 text-blue-200" },
  request: { label: "请求", cls: "border-cyan-600/60 bg-cyan-500/10 text-cyan-200" },
  other: { label: "其它", cls: "border-gray-600/60 bg-gray-500/10 text-gray-300" },
};

const STATUS_META: Record<StandpointEvent["status"], { label: string; cls: string }> = {
  pending: { label: "处理中", cls: "border-gray-600/60 bg-gray-500/10 text-gray-300" },
  drafted: { label: "待批准", cls: "border-amber-600/60 bg-amber-500/10 text-amber-200" },
  sent: { label: "已回复", cls: "border-emerald-600/60 bg-emerald-500/10 text-emerald-200" },
  dismissed: { label: "已忽略", cls: "border-gray-700 bg-gray-800/40 text-gray-500" },
};

const ENGINE_META: Record<StandpointAgent["status"], { label: string; cls: string }> = {
  running: { label: "运行中", cls: "border-emerald-600/60 bg-emerald-500/10 text-emerald-200" },
  paused: { label: "已暂停", cls: "border-amber-600/60 bg-amber-500/10 text-amber-200" },
  stopped: { label: "已停止", cls: "border-gray-600/60 bg-gray-500/10 text-gray-300" },
};

function platformLabel(value: string) {
  return PLATFORM_OPTIONS.find((p) => p.value === value)?.label || value;
}

function kindLabel(kind: StandpointEvent["kind"]) {
  return kind === "dm" ? "私信" : "回复";
}

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
      toast.success("已保存");
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
      toast.success("已登记账号（演示）");
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
      toast.error("请填写来源账号与消息内容");
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
      toast.success("已喂入一条来消息");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSimulating(false);
    }
  }

  function fillMaliciousExample() {
    setSimKind("reply");
    setSimFromHandle("hater_233");
    setSimText("就你也配发言？纯纯的nc");
  }

  function fillQuestionExample() {
    setSimKind("dm");
    setSimFromHandle("fan_xiaobai");
    setSimText("请问粉丝群怎么加入？");
  }

  async function handleSendEvent(id: string) {
    setEventBusy(id);
    try {
      const res = await sendStandpointReply(id);
      setEvents((prev) => prev.map((ev) => (ev._id === id ? res.event : ev)));
      await reloadAgent();
      toast.success("已在本系统内标记为已回复（模拟）");
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
      toast.success("已重新生成回复");
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
        <p className="text-gray-400">加载中...</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="mx-auto max-w-5xl p-4 pb-20">
        <p className="text-gray-400">未能加载代理，请稍后重试。</p>
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
          <h1 className="text-2xl font-bold text-white md:text-3xl">立场展开 · 控制台</h1>
          <p className="mt-1 text-sm text-gray-400">
            后台监控代理（OpenClaw 监控引擎）在你离线时自动展开、分类并按你的立场生成回复
          </p>
        </div>
        <Link to="/arena" className="ml-auto text-sm text-cyan-300 hover:underline">
          ← 返回卢本伟广场
        </Link>
      </div>

      {/* ===== 安全提示条 ===== */}
      <div className="rounded-2xl border border-amber-600/50 bg-amber-500/10 p-4">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="text-sm leading-relaxed text-amber-100">
            <div className="font-semibold text-amber-200">受控演示环境 · 安全须知</div>
            <ul className="mt-2 space-y-1 text-amber-100/90">
              <li>· 账号“绑定”仅登记 平台 + handle 的表示，<b>不存储真实凭证、不真正登录</b>。</li>
              <li>· <b>不会真正向第三方平台发帖</b>（真实自动发帖违反多数平台使用条款）。</li>
              <li>· “发送”只是在本系统内标记为已回复（模拟 / 记录）。</li>
              <li>· <b>自动发送默认关闭</b>，开启前请确认你了解其含义。</li>
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
                <h2 className="text-lg font-semibold text-white">OpenClaw 监控引擎</h2>
                <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${engineMeta.cls}`}>
                  {engineMeta.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">上次活跃：{formatTime(agent.lastActiveAt)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={statusBusy || agent.status === "running"}
              onClick={() => handleSetStatus("running")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> 启动
            </button>
            <button
              type="button"
              disabled={statusBusy || agent.status !== "running"}
              onClick={() => handleSetStatus("paused")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800 disabled:opacity-50"
            >
              <Pause className="h-4 w-4" /> 暂停
            </button>
            <button
              type="button"
              disabled={statusBusy || agent.status === "stopped"}
              onClick={() => handleSetStatus("stopped")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800 disabled:opacity-50"
            >
              <Square className="h-4 w-4" /> 停止
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {[
            { label: "检测", value: agent.stats.detected },
            { label: "草稿", value: agent.stats.drafted },
            { label: "已回复", value: agent.stats.sent },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-800 bg-gray-950/50 px-4 py-3 text-center">
              <div className="text-2xl font-bold text-white">{s.value}</div>
              <div className="mt-1 text-xs text-gray-400">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 配置面板 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-5">
        <h2 className="text-lg font-semibold text-white">代理配置</h2>

        {/* 立场 */}
        <div>
          <div className="mb-2 text-sm font-medium text-gray-200">立场（stance）</div>
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
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="mt-0.5 text-[11px] text-gray-400">{opt.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 人格描述 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">人格描述（personaText）</label>
          <textarea
            value={personaText}
            onChange={(e) => setPersonaText(e.target.value)}
            placeholder="描述你的说话人设，例如：一个直率但讲道理的科技博主，喜欢用简短有力的短句。"
            className="min-h-[80px] w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
        </div>

        {/* 个人信息 / 知识库 */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-200">个人信息 / 知识库（personalInfo）</label>
          <textarea
            value={personalInfo}
            onChange={(e) => setPersonalInfo(e.target.value)}
            placeholder="填写可用于自动回答的资料，例如：粉丝群加入方式、常见专业问题的答复、合作联系方式等。"
            className="min-h-[100px] w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
          <p className="mt-1.5 text-xs text-gray-500">
            当有人提问或提出请求（如“粉丝群怎么加”“某专业问题”）时，代理会依据这里的信息生成有用的回复。
          </p>
        </div>

        <button
          type="button"
          disabled={savingConfig}
          onClick={() => void patchConfig({ personaText, personalInfo })}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {savingConfig ? "保存中..." : "保存人格与知识库"}
        </button>

        {/* 开关 */}
        <div className="space-y-3 border-t border-gray-800 pt-4">
          {/* 自动发送（红色警告） */}
          <div className="rounded-xl border border-rose-800/50 bg-rose-950/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
                <div>
                  <div className="text-sm font-semibold text-rose-100">自动发送（autoSendEnabled）</div>
                  <p className="mt-0.5 text-xs text-rose-200/80">
                    开启后，运行中的代理会对命中规则的消息<b>直接标记为已回复</b>（仍仅限本系统内的模拟）。默认关闭，请谨慎开启。
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
              <div className="text-sm font-medium text-gray-200">回击恶意（replyToMalicious）</div>
              <p className="mt-0.5 text-xs text-gray-500">对判定为恶意的消息按你的立场生成回击。</p>
            </div>
            <Toggle
              checked={config.replyToMalicious}
              disabled={savingConfig}
              onChange={() => void patchConfig({ replyToMalicious: !config.replyToMalicious })}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-950/50 p-3">
            <div>
              <div className="text-sm font-medium text-gray-200">回答提问 / 请求（replyToQuestions）</div>
              <p className="mt-0.5 text-xs text-gray-500">对提问或请求依据你的知识库生成有用回复。</p>
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
          <h2 className="text-lg font-semibold text-white">绑定账号</h2>
          <p className="mt-1 text-xs text-gray-500">演示用，仅登记 平台 + handle；不存储真实凭证 / 不实际发帖。</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          >
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleAddAccount();
            }}
            placeholder="@你的账号 handle"
            className="min-w-[180px] flex-1 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
          <button
            type="button"
            disabled={accountBusy || !newHandle.trim()}
            onClick={handleAddAccount}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> 添加
          </button>
        </div>

        {agent.accounts.length === 0 ? (
          <p className="text-sm text-gray-500">还没有绑定任何账号。</p>
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
                      已登记
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={accountBusy}
                  onClick={() => handleRemoveAccount(acc.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ===== 模拟一条来消息 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-white">模拟一条来消息</h2>
          <p className="mt-1 text-xs text-gray-500">
            真实部署会由各平台官方 API 连接器 / webhook 喂入事件；此处用于演示，手动喂入一条来消息。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fillMaliciousExample}
            className="rounded-lg border border-rose-800/60 bg-rose-950/20 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-950/40"
          >
            一键填“恶意示例”
          </button>
          <button
            type="button"
            onClick={fillQuestionExample}
            className="rounded-lg border border-blue-800/60 bg-blue-950/20 px-3 py-1.5 text-xs font-medium text-blue-200 hover:bg-blue-950/40"
          >
            一键填“提问示例”
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <select
            value={simKind}
            onChange={(e) => setSimKind(e.target.value as "dm" | "reply")}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          >
            <option value="reply">回复</option>
            <option value="dm">私信</option>
          </select>
          <select
            value={simPlatform}
            onChange={(e) => setSimPlatform(e.target.value)}
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          >
            {PLATFORM_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            value={simFromHandle}
            onChange={(e) => setSimFromHandle(e.target.value)}
            placeholder="来源账号 handle"
            className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          />
        </div>

        <textarea
          value={simText}
          onChange={(e) => setSimText(e.target.value)}
          placeholder="对方发来的私信 / 回复内容"
          className="min-h-[80px] w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
        />

        <button
          type="button"
          disabled={simulating || !simFromHandle.trim() || !simText.trim()}
          onClick={handleSimulate}
          className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {simulating ? "处理中..." : "喂入这条来消息"}
        </button>
      </section>

      {/* ===== 事件流 ===== */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-white">事件流</h2>

        {eventsLoading ? (
          <p className="text-sm text-gray-400">加载中...</p>
        ) : events.length === 0 ? (
          <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">还没有任何事件。用上方的“模拟一条来消息”开始演示。</p>
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
                      {cMeta.label}
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${sMeta.cls}`}>
                      {sMeta.label}
                    </span>
                    {ev.autoSent ? (
                      <span className="rounded-full border border-emerald-600/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                        已自动回复
                      </span>
                    ) : null}
                    <span className="ml-auto text-[11px] text-gray-500">{formatTime(ev.createdAt)}</span>
                  </div>

                  <p className="mt-3 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-200">
                    {ev.incomingText}
                  </p>

                  {ev.reply ? (
                    <div className="mt-3 rounded-xl border border-cyan-900/40 bg-cyan-950/20 px-3 py-2">
                      <div className="mb-1 flex items-center gap-2 text-[11px] text-cyan-300/80">
                        <span>代理回复</span>
                        <span className="rounded-full border border-cyan-800/60 px-1.5 py-0.5">{ev.reply.style}</span>
                        {ev.reply.heuristic ? (
                          <span className="rounded-full border border-gray-700 bg-gray-800/60 px-1.5 py-0.5 text-gray-400">
                            启发式 · 未配置AI
                          </span>
                        ) : null}
                      </div>
                      <p className="text-sm text-cyan-50">{ev.reply.text}</p>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">（暂无回复）</p>
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
                          <Send className="h-3.5 w-3.5" /> 批准发送
                        </button>
                      ) : null}
                      {canRegenerate ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRegenerate(ev._id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                        >
                          <RefreshCw className="h-3.5 w-3.5" /> 重新生成
                        </button>
                      ) : null}
                      {canDismiss ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDismiss(ev._id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-gray-800 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" /> 忽略
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
