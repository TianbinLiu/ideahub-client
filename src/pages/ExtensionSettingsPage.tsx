/**
 * @file ExtensionSettingsPage.tsx - 卢本伟广场 · 浏览器插件设置
 * @category Page
 * @route /arena/extension (ProtectedRoute)
 * @i18n none（页面内容以中文为主，与 ArenaPage / ArenaProfilePage 等既有广场页面一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 经【设置桥】(window.postMessage ↔ content.js ↔ background) 读写插件设置：
 *   enabled / apiBase / siteOrigin / activePersona + personaText / anonymizeCapture / watchReplies
 * - 展示 hasToken 登录态（★只显示有/无，绝不显示 token 明文；token 也【不在】SET 白名单里
 *   —— 网页无权改插件登录态，要登录得去插件弹窗）
 * - 未检测到插件（GET_SETTINGS 后 1.5s 无回应）→ 显示空态 + 重新检测，不要一直转圈
 * - 素材库 / 创意工坊 → 跳 /arena/memes（复用 MemeLibraryPage，不重写）；立场展开 → /arena/standpoint
 *
 * ===== 设置桥协议（冻结契约，勿改） =====
 *   网页发：{ __lbw:true, kind:"GET_SETTINGS", reqId }              , location.origin
 *   网页发：{ __lbw:true, kind:"SET_SETTINGS", reqId, patch }       , location.origin
 *   插件回：{ __lbw:true, kind:"SETTINGS", reqId, ok, settings?, error? }
 *   settings 形状绝不含 token 明文，只有 hasToken:boolean。
 *   SET 白名单：enabled / apiBase / siteOrigin / activePersona / personaText /
 *              anonymizeCapture / watchReplies —— 由 SettingsPatch 类型钉死（Omit 掉 hasToken）。
 *
 * 依赖文件:
 * @uses ../api.ts - listPersonas({scope:'installed'})，把已下载人格喂给 activePersona 下拉
 *
 * 被使用于:
 * @used_in App.tsx - 路由 /arena/extension
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  KeyRound,
  Puzzle,
  Radar,
  RefreshCw,
  Save,
  Smile,
  UserRoundCog,
} from "lucide-react";
import { listPersonas, type Persona } from "../api";
import { humanizeError } from "../utils/humanizeError";

/** 插件设置（★绝不含 token 明文，只有 hasToken） */
type ExtensionSettings = {
  enabled: boolean;
  apiBase: string;
  siteOrigin: string;
  activePersona: string;
  personaText: string;
  anonymizeCapture: boolean;
  watchReplies: boolean;
  hasToken: boolean;
};

/**
 * SET_SETTINGS 的 patch = 设置里【网页可改】的部分。
 * Omit<..., "hasToken"> 就是白名单本身：hasToken/token 是插件登录态，网页无权改。
 */
type SettingsPatch = Partial<Omit<ExtensionSettings, "hasToken">>;

/** 表单草稿 = 全部可改字段 */
type Draft = Omit<ExtensionSettings, "hasToken">;

type Status = "detecting" | "missing" | "ready" | "error";

/** 契约要求：GET_SETTINGS 1.5s 无回应 = 未检测到插件 */
const DETECT_TIMEOUT_MS = 1500;
/** 写入要慢一些（background 可能在落盘），给宽一点 */
const ACTION_TIMEOUT_MS = 4000;

const TIMEOUT_MESSAGE = "LBW_BRIDGE_TIMEOUT";

function isTimeoutError(e: unknown) {
  return e instanceof Error && e.message === TIMEOUT_MESSAGE;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

/**
 * 插件回来的 settings 是【外部数据】，一律按已知键防御式取值 + 类型收敛；
 * 多余的键（比如万一带了 token）直接丢掉，绝不进 state、绝不渲染。
 */
function normalizeSettings(raw: unknown): ExtensionSettings {
  if (!raw || typeof raw !== "object") throw new Error("插件返回的设置格式不正确");
  const s = raw as Record<string, unknown>;
  return {
    enabled: s.enabled === true,
    apiBase: asString(s.apiBase),
    siteOrigin: asString(s.siteOrigin),
    activePersona: asString(s.activePersona, "self") || "self",
    personaText: asString(s.personaText),
    anonymizeCapture: s.anonymizeCapture === true,
    watchReplies: s.watchReplies === true,
    hasToken: s.hasToken === true,
  };
}

function toDraft(s: ExtensionSettings): Draft {
  return {
    enabled: s.enabled,
    apiBase: s.apiBase,
    siteOrigin: s.siteOrigin,
    activePersona: s.activePersona,
    personaText: s.personaText,
    anonymizeCapture: s.anonymizeCapture,
    watchReplies: s.watchReplies,
  };
}

function newReqId() {
  return `lbw-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 向插件发一条桥消息并等它按 reqId 回。
 * 超时 = 没装插件 / 插件没在本站注入 content.js；调用方用 isTimeoutError 区分。
 */
function bridgeRequest(
  kind: "GET_SETTINGS" | "SET_SETTINGS",
  patch: SettingsPatch | undefined,
  timeoutMs: number
): Promise<ExtensionSettings> {
  return new Promise<ExtensionSettings>((resolve, reject) => {
    const reqId = newReqId();
    const origin = window.location.origin;

    function cleanup() {
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return;
      if (event.origin !== origin) return;
      const data = event.data as Record<string, unknown> | null;
      if (!data || typeof data !== "object") return;
      if (data.__lbw !== true || data.kind !== "SETTINGS" || data.reqId !== reqId) return;

      cleanup();
      if (data.ok !== true) {
        reject(new Error(asString(data.error) || "插件处理失败"));
        return;
      }
      try {
        resolve(normalizeSettings(data.settings));
      } catch (e) {
        reject(e instanceof Error ? e : new Error("插件返回的设置格式不正确"));
      }
    }

    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error(TIMEOUT_MESSAGE));
    }, timeoutMs);

    window.addEventListener("message", onMessage);
    window.postMessage({ __lbw: true, kind, reqId, ...(patch ? { patch } : {}) }, origin);
  });
}

function ToggleRow({
  id,
  label,
  desc,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/60 p-4">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-cyan-500"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-gray-100">
          {label}
        </label>
        <p className="mt-0.5 text-xs leading-relaxed text-gray-500">{desc}</p>
      </div>
    </div>
  );
}

export default function ExtensionSettingsPage() {
  const [status, setStatus] = useState<Status>("detecting");
  const [errorMessage, setErrorMessage] = useState("");
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [installedPersonas, setInstalledPersonas] = useState<Persona[]>([]);

  const detect = useCallback(async () => {
    setStatus("detecting");
    setErrorMessage("");
    try {
      const next = await bridgeRequest("GET_SETTINGS", undefined, DETECT_TIMEOUT_MS);
      setSettings(next);
      setDraft(toDraft(next));
      setStatus("ready");
    } catch (e) {
      if (isTimeoutError(e)) {
        setStatus("missing");
        return;
      }
      // 插件在，但回了 ok:false / 形状不对 —— 是错误，不是“没装”
      setErrorMessage(humanizeError(e));
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  useEffect(() => {
    if (status !== "ready") return;
    let mounted = true;
    (async () => {
      try {
        const res = await listPersonas({ scope: "installed", limit: 50 });
        if (mounted) setInstalledPersonas(res.personas || []);
      } catch (e) {
        // 人格列表只是 activePersona 下拉的锦上添花，拉不到不该打断设置页
        if (mounted) console.warn("[extension-settings] 已下载人格加载失败:", humanizeError(e));
      }
    })();
    return () => {
      mounted = false;
    };
  }, [status]);

  function patchDraft(patch: SettingsPatch) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  function handlePersonaChange(value: string) {
    if (value === "self") {
      patchDraft({ activePersona: "self" });
      return;
    }
    const persona = installedPersonas.find((p) => p._id === value);
    patchDraft({
      activePersona: value,
      ...(persona?.styleDescriptor ? { personaText: persona.styleDescriptor } : {}),
    });
  }

  async function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      const patch: SettingsPatch = {
        enabled: draft.enabled,
        apiBase: draft.apiBase.trim(),
        siteOrigin: draft.siteOrigin.trim(),
        activePersona: draft.activePersona.trim() || "self",
        personaText: draft.personaText,
        anonymizeCapture: draft.anonymizeCapture,
        watchReplies: draft.watchReplies,
      };
      const next = await bridgeRequest("SET_SETTINGS", patch, ACTION_TIMEOUT_MS);
      setSettings(next);
      setDraft(toDraft(next));
      toast.success("已保存到插件");
    } catch (e) {
      toast.error(isTimeoutError(e) ? "插件没有响应，请确认插件已启用后重试" : humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  const dirty = Boolean(settings && draft && JSON.stringify(draft) !== JSON.stringify(toDraft(settings)));

  const personaIsCustom =
    Boolean(draft) &&
    draft?.activePersona !== "self" &&
    Boolean(draft?.activePersona) &&
    !installedPersonas.some((p) => p._id === draft?.activePersona);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 pb-20">
      {/* ===== 标题 ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
          <Puzzle className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">插件设置</h1>
          <p className="mt-1 text-sm text-gray-400">
            本页直接读写浏览器插件里的设置；改完点「保存到插件」才会生效。
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <Link to="/arena/profile" className="text-cyan-300 hover:underline">
            我的主页
          </Link>
          <Link to="/arena" className="text-cyan-300 hover:underline">
            ← 返回卢本伟广场
          </Link>
        </div>
      </div>

      {/* ===== 桥状态 ===== */}
      {status === "detecting" ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center">
          <p className="text-sm text-gray-400">正在检测插件...</p>
        </div>
      ) : null}

      {status === "missing" ? (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-8 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-900 text-gray-500">
            <Puzzle className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm font-medium text-gray-200">未检测到插件</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gray-500">
            本页没有收到插件的回应。可能是还没安装、插件被停用，或者插件的「siteOrigin」没有指向本站
            （{window.location.origin}）。装好并启用后点下面的按钮重新检测。
          </p>
          <button
            type="button"
            onClick={() => void detect()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
          >
            <RefreshCw className="h-4 w-4" /> 重新检测
          </button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-red-900/70 bg-red-950/20 p-6">
          <p className="text-sm font-medium text-red-200">插件返回了错误</p>
          <p className="mt-1.5 text-xs text-red-200/80">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void detect()}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-red-700 px-4 py-2 text-sm font-semibold text-red-100 hover:bg-red-900/30"
          >
            <RefreshCw className="h-4 w-4" /> 重试
          </button>
        </div>
      ) : null}

      {/* ===== 设置表单 ===== */}
      {status === "ready" && draft && settings ? (
        <>
          {/* --- 登录态（只读） --- */}
          <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gray-800 text-gray-300">
              <KeyRound className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">插件登录态</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                插件用自己保存的 token 调后端。★网页只能看到「有没有」，看不到 token 内容，也无权修改
                —— 登录 / 退出请在插件弹窗里操作。
              </p>
            </div>
            <span
              className={`ml-auto shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${
                settings.hasToken
                  ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-200"
                  : "border-amber-600/50 bg-amber-500/10 text-amber-200"
              }`}
            >
              {settings.hasToken ? "已登录" : "未登录"}
            </span>
          </section>

          {/* --- 开关 --- */}
          <section className="space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <h2 className="text-base font-semibold text-white">开关</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <ToggleRow
                id="ext-enabled"
                label="启用插件"
                desc="关掉后插件不再在任何平台注入发言助手 UI。"
                checked={draft.enabled}
                onChange={(next) => patchDraft({ enabled: next })}
              />
              <ToggleRow
                id="ext-watch-replies"
                label="监听回复 / 私信"
                desc="监听到别人回复你时，交给「立场展开」生成草稿（永远只出草稿，不会自动发送）。"
                checked={draft.watchReplies}
                onChange={(next) => patchDraft({ watchReplies: next })}
              />
              <ToggleRow
                id="ext-anonymize"
                label="抓取时匿名化"
                desc="用插件收集素材 / 样本时，先抹掉昵称、@某人、链接等可识别信息再上传。"
                checked={draft.anonymizeCapture}
                onChange={(next) => patchDraft({ anonymizeCapture: next })}
              />
            </div>
          </section>

          {/* --- 连接 --- */}
          <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div>
              <h2 className="text-base font-semibold text-white">连接</h2>
              <p className="mt-0.5 text-xs text-gray-500">插件访问后端与识别本站所用的地址。</p>
            </div>

            <div>
              <label htmlFor="ext-api-base" className="text-sm text-gray-200">
                apiBase · 后端地址
              </label>
              <input
                id="ext-api-base"
                value={draft.apiBase}
                onChange={(e) => patchDraft({ apiBase: e.target.value })}
                spellCheck={false}
                placeholder="http://localhost:4000"
                className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-gray-500">插件调 /api/arena/suggest 等接口的根地址，不带末尾斜杠。</p>
            </div>

            <div>
              <label htmlFor="ext-site-origin" className="text-sm text-gray-200">
                siteOrigin · 本站地址
              </label>
              <input
                id="ext-site-origin"
                value={draft.siteOrigin}
                onChange={(e) => patchDraft({ siteOrigin: e.target.value })}
                spellCheck={false}
                placeholder={window.location.origin}
                className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <p className="text-xs text-gray-500">
                  插件只信任这个来源发来的桥消息（防投毒）。当前页面是 {window.location.origin}。
                </p>
                {draft.siteOrigin !== window.location.origin ? (
                  <button
                    type="button"
                    onClick={() => patchDraft({ siteOrigin: window.location.origin })}
                    className="rounded-lg border border-gray-800 px-2 py-0.5 text-[11px] text-cyan-300 hover:border-cyan-500/50"
                  >
                    用当前地址
                  </button>
                ) : null}
              </div>
            </div>
          </section>

          {/* --- 发言人格 --- */}
          <section className="space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-300">
                <UserRoundCog className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-white">发言人格</h2>
                <p className="mt-0.5 text-xs text-gray-500">插件生成三条方案时按谁的口吻说话。</p>
              </div>
              <Link to="/arena/persona" className="ml-auto text-xs text-cyan-300 hover:underline">
                人格广场 →
              </Link>
            </div>

            <div>
              <label htmlFor="ext-active-persona" className="text-sm text-gray-200">
                activePersona
              </label>
              <select
                id="ext-active-persona"
                value={draft.activePersona || "self"}
                onChange={(e) => handlePersonaChange(e.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-100 focus:border-cyan-500/60 focus:outline-none"
              >
                <option value="self">按本人风格（self）</option>
                {installedPersonas.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.coverEmoji} {p.name}
                  </option>
                ))}
                {personaIsCustom ? (
                  <option value={draft.activePersona}>自定义（{draft.activePersona}）</option>
                ) : null}
              </select>
              <p className="mt-1.5 text-xs text-gray-500">
                选 self 时插件按你自己的风格走；选其它人格时用下面的 personaText 作为口吻描述。
                下拉里是你已下载的人格。
              </p>
            </div>

            <div>
              <label htmlFor="ext-persona-text" className="text-sm text-gray-200">
                personaText · 口吻描述
              </label>
              <textarea
                id="ext-persona-text"
                value={draft.personaText}
                onChange={(e) => patchDraft({ personaText: e.target.value })}
                rows={5}
                placeholder="选中某个人格后会自动填入它的风格描述，也可以自己改。"
                className="mt-2 w-full resize-y rounded-xl border border-gray-800 bg-gray-950 p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-gray-500">activePersona 为 self 时这段文本不生效。</p>
            </div>
          </section>

          {/* --- 保存条 --- */}
          <div className="sticky bottom-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-950/90 p-4 backdrop-blur">
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "保存中..." : "保存到插件"}
            </button>
            <button
              type="button"
              disabled={!dirty || saving}
              onClick={() => setDraft(toDraft(settings))}
              className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-900 disabled:opacity-60"
            >
              放弃修改
            </button>
            <button
              type="button"
              onClick={() => void detect()}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-400 hover:border-cyan-500/50 hover:text-cyan-300"
            >
              <RefreshCw className="h-3.5 w-3.5" /> 重新读取
            </button>
            <span className="ml-auto text-xs text-gray-500">
              {dirty ? "有未保存的修改" : "已与插件同步"}
            </span>
          </div>
        </>
      ) : null}

      {/* ===== 相关能力（复用既有页面，不重写） ===== */}
      <section className="space-y-3 rounded-2xl border border-gray-800 bg-gray-950/40 p-6">
        <h2 className="text-base font-semibold text-white">相关能力</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            to="/arena/memes"
            className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-cyan-500/50"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
              <Smile className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">素材库 / 创意工坊</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                收藏表情梗图、上传自己的素材；插件在任意评论框旁搜索并插入你收藏的内容。
              </p>
            </div>
          </Link>
          <Link
            to="/arena/standpoint"
            className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-rose-500/50"
          >
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-300">
              <Radar className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white">立场展开</h3>
              <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
                配置监控代理与回复风格。配合上面的「监听回复 / 私信」开关使用；回复永远只出草稿，需你确认。
              </p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}
