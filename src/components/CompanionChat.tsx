/**
 * @file CompanionChat.tsx - 首页看板娘对话框（流式对话 → 逐句 TTS → 表情/动作/口型）
 * @category Component
 * @requires_auth partial（看得到；发消息要登录，服务端也要求登录）
 * @i18n_module companion
 *
 * 一句话的旅程：
 *   /api/companion/chat（SSE）每来一条 sentence → 立刻发起该句的 /api/tts 请求（不等前一句播完）
 *   → 按顺序排进"演出队列"：切表情 + 触发动作 + 显示字幕 + 等音频到 → 播放（口型跟包络）
 *   → 没音频（语音关 / TTS 失败 / 未配置）就按字数合成口型撑时长。
 * ★ 队列是串行 Promise 链而不是 state：句子到达是乱序异步的，用 state 排队会丢句/乱序。
 * ★ runId 递增 = "停止"：所有还在队列里的旧任务看到 run 变了就直接放弃，不用逐个取消。
 * ★ 未登录只拦"发送"（打开登录框），对话框本身照常显示，让游客知道这里能聊。
 * ★ 人格 / 音频 / 换装（docs/COMPANION.md「人格 / 音频 / 模型市场」「声音市场」）：config 里带着当前人格与合并后的音色，
 *   TTS 请求按 voiceSettings 发（buildTtsRequest：有混音配方传 mix，否则传 voice —— 分叉只在那一处）；
 *   「人格」按钮开 PersonaPickerModal → PUT /api/companion/settings，「声音」按钮开 CompanionVoiceModal（模板市场 / 自定义），
 *   「换装」跳模型市场。谁改了设置都会广播 ideahub:companion-updated，这里监听它重拉 config（人格名 chip、音色都跟着变）。
 * ★ 对话记忆（2026-09-18，docs/COMPANION.md「对话记忆」）：历史在服务端，这里只发新的一句 + threadId。
 *   登录后接着上一次的会话聊（listChatThreads 取最近一个）；输入框左边的用量环 = 上下文用量，点开是
 *   CompanionMemoryPanel（整理记忆 / 新对话 / 删对话 / 「记得的事」）。用量 ≥75% 时服务端在回复后自动整理，
 *   这里过几秒回头刷一次用量。老服务端不认新写法（isLegacyChatRejection）→ 退回旧写法：本地带最近 12 条。
 * ★ 安全协议（2026-09-24，加州 SB 243 / 纽约 GBL，详见官网 /safety/ai-chat）：
 *   · `safety` 事件 → 求助卡（CompanionSafetyCard）。**先 stopAll、不合成语音、不进字幕**——
 *     把热线念成台词既轻佻又会盖住用户要看的号码；
 *   · `notice` 事件 → 居中一行「你在和 AI 聊天」（新会话 / 空闲 30 分钟 / 每 3 小时）；
 *   · 输入框下常驻一行「{name} 是 AI，不是真人」，游客也看得到（§22602(a)）；
 *   · 第一次发言前弹 CompanionConsentDialog，同意记在服务端。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import toast from "react-hot-toast";
import { AudioLines, Brain, Drama, ImageIcon, Send, Shirt, Square, Volume2, VolumeX, X } from "lucide-react";
import CompanionSafetyCard from "./CompanionSafetyCard";
import CompanionConsentDialog from "./CompanionConsentDialog";
import {
  COMPANION_UPDATED_EVENT,
  companionForbiddenReason,
  getChatMessages,
  getCompanionConfig,
  listChatThreads,
  streamCompanionChat,
  synthesizeSpeech,
  updateCompanionSettings,
  COMPANION_CAPS,
  type ChatContext,
  type CompanionNotice,
  type CompanionSafetyCard as SafetyCard,
  type CompanionChatHandlers,
  type CompanionConfig,
  type Persona,
} from "../api";
import { useAuth } from "../authContext";
import AuthDialog from "./AuthDialog";
import CompanionVoiceModal from "./CompanionVoiceModal";
import PersonaPickerModal from "./PersonaPickerModal";
import CompanionMemoryPanel from "./CompanionMemoryPanel";
import { contextPercent, contextTone, isLegacyChatRejection } from "../companion/chatContext";
import { companionBus } from "../companion/bus";
import { buildTtsRequest } from "../companion/voiceMix";
import { SpeechPlayer } from "../companion/speech";
import { estimateSpeechMs, normalizeAction, normalizeFace, pickTouchReaction, type CompanionSentence } from "../companion/protocol";
import { humanizeError } from "../utils/humanizeError";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Phase = "idle" | "thinking" | "speaking";

const VOICE_STORAGE_KEY = "ideahub-companion-voice";
/** 旧写法（老服务端）发给服务端的历史条数上限（服务端 zod 上限 20，这里留余量）；按会话聊天时历史在服务端 */
const MAX_HISTORY = 12;
/** 用量到了「自动整理」档：回复后隔这么久回头刷一次用量，最多刷这么多次 */
const COMPACT_POLL_MS = 5000;
const COMPACT_POLL_TIMES = 3;
const MAX_INPUT_CHARS = 1000;

function readVoicePreference() {
  try {
    return localStorage.getItem(VOICE_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = window.setTimeout(done, ms);
    function done() {
      signal?.removeEventListener("abort", done);
      window.clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

type Props = {
  onOpenScene: () => void;
};

export default function CompanionChat({ onOpenScene }: Props) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [config, setConfig] = useState<CompanionConfig | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [subtitle, setSubtitle] = useState("");
  const [voiceOn, setVoiceOn] = useState(readVoicePreference);
  const [authOpen, setAuthOpen] = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);
  const [personaBusy, setPersonaBusy] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [safetyCard, setSafetyCard] = useState<SafetyCard | null>(null);
  const [notice, setNotice] = useState<CompanionNotice | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  /** 弹同意框时暂存这句话，同意之后接着发出去 */
  const pendingTextRef = useRef("");
  /** 「还需要先同意吗」——与 config 同步，但 send 读它而不是读 config（见 send 里的 ★★） */
  const consentNeededRef = useRef(false);
  const [threadId, setThreadIdState] = useState<string | null>(null);
  const [context, setContext] = useState<ChatContext | null>(null);

  // threadId 在 send() 的异步回调里要读最新值 → 同时放一份在 ref 里
  const threadIdRef = useRef<string | null>(null);
  /** 服务端还不认按会话的写法（老服务端）→ 一直用旧写法 */
  const legacyRef = useRef(false);
  const pollRef = useRef(0);
  function setThreadId(id: string | null) {
    threadIdRef.current = id;
    setThreadIdState(id);
  }
  function resetThread() {
    setThreadId(null);
    setContext(null);
    setMessages([]);
    pollRef.current += 1;
  }

  const playerRef = useRef<SpeechPlayer | null>(null);
  const runRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const abortRef = useRef<AbortController | null>(null);

  const name = config?.name || t("companion.name");
  const enabled = config ? config.enabled : true;
  const userId = user?._id || "";

  // config 里的人格 / 音色只对登录用户有：登录态变了、别处改了设置（事件）都要重拉
  useEffect(() => {
    let mounted = true;
    const load = () => {
      getCompanionConfig(i18n.language?.startsWith("zh") ? "zh" : "en")
        .then((next) => {
          if (mounted) {
            setConfig(next);
            // 判据同步进 ref —— send 读的是它（见 send 里的 ★★）
            consentNeededRef.current = Boolean(next?.safety?.consentRequired && !next.safety.consented);
          }
        })
        .catch(() => {
          if (mounted) setConfig({ ok: true, name: "", enabled: false, tts: false, voice: "", loginRequired: true });
        });
    };
    load();
    window.addEventListener(COMPANION_UPDATED_EVENT, load);
    return () => {
      mounted = false;
      window.removeEventListener(COMPANION_UPDATED_EVENT, load);
    };
    // ★ 语言进依赖是**语义需要**不是为了消警告：config.safety.resources 的文案由服务端按 lang 给，
    //   切了语言不重拉，页面上就会留着上一门语言的热线标签。
  }, [userId, i18n.language]);

  // 登录后接着最近一次会话聊（她记得上次聊到哪）；退出登录 / 换账号先清掉。老服务端没有 /api/chat → 静默不接
  useEffect(() => {
    let mounted = true;
    setThreadId(null);
    setContext(null);
    if (!userId) return;
    listChatThreads("companion", 1)
      .then((r) => {
        const latest = r.threads[0];
        if (!mounted || !latest || threadIdRef.current) return;
        setThreadId(latest.id);
        setContext(latest.context);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [userId]);

  // 卸载时停掉回头刷用量的轮询
  useEffect(
    () => () => {
      pollRef.current += 1;
    },
    [],
  );

  /** 用量到了自动整理档：服务端在回复后整理，隔几秒回头刷一次，降下来或刷够次数为止 */
  function pollContextAfterCompact(id: string) {
    const token = ++pollRef.current;
    let left = COMPACT_POLL_TIMES;
    const tick = () => {
      window.setTimeout(() => {
        if (pollRef.current !== token || threadIdRef.current !== id) return;
        getChatMessages(id, { limit: 1 })
          .then((r) => {
            if (pollRef.current !== token || threadIdRef.current !== id) return;
            setContext(r.thread.context);
            left -= 1;
            if (left > 0 && (r.thread.compacting || r.thread.context.level === "compact")) tick();
          })
          .catch(() => undefined);
      }, COMPACT_POLL_MS);
    };
    tick();
  }

  // 卸载（离开首页）时把还在播的声音、排队的演出全部掐掉
  useEffect(
    () => () => {
      runRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
      playerRef.current?.stop();
      companionBus.stopSpeaking();
    },
    [],
  );

  function getPlayer() {
    if (!playerRef.current) playerRef.current = new SpeechPlayer();
    return playerRef.current;
  }

  // 触摸反应：舞台（CompanionStage）报上来的命中区 → 演一句预置台词（不进 LLM、不进历史）；说话/思考中不打断，1.8s 内只理一次
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const lastTouchRef = useRef(0);
  useEffect(
    () =>
      companionBus.onHit((areas) => {
        const nowMs = Date.now();
        if (phaseRef.current !== "idle" || nowMs - lastTouchRef.current < 1800) return;
        const pick = pickTouchReaction(areas, i18n.language.startsWith("zh") ? "zh" : "en");
        if (!pick) return;
        lastTouchRef.current = nowMs;
        stopAll();
        const run = runRef.current;
        const controller = new AbortController();
        const sentence: CompanionSentence = { index: 0, text: pick.text, emotion: pick.emotion, face: pick.face, action: pick.action, tts: { emotion: pick.emotion, instruct: "" } };
        const audio: Promise<Blob | null> =
          voiceOn && Boolean(config?.tts)
            ? synthesizeSpeech(
                buildTtsRequest({ text: sentence.text, settings: config?.voiceSettings, fallbackVoiceId: config?.voice, emotion: sentence.tts.emotion }),
                controller.signal,
              ).catch(() => null)
            : Promise.resolve(null);
        setPhase("speaking");
        void enqueue(run, () => perform(run, sentence, audio, controller.signal)).then(() => {
          if (runRef.current === run) setPhase("idle");
        });
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stopAll/enqueue/perform 是组件内的函数声明，随渲染同步
    [config, voiceOn, i18n.language],
  );

  function stopAll() {
    runRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    playerRef.current?.stop();
    companionBus.stopSpeaking();
    setPhase("idle");
  }

  function enqueue(run: number, job: () => Promise<void>) {
    queueRef.current = queueRef.current
      .then(async () => {
        if (runRef.current !== run) return;
        await job();
      })
      .catch(() => undefined);
    return queueRef.current;
  }

  async function perform(run: number, sentence: CompanionSentence, audio: Promise<Blob | null>, signal: AbortSignal) {
    if (runRef.current !== run) return;
    setSubtitle(sentence.text);
    setPhase("speaking");
    companionBus.face(normalizeFace(sentence.face));
    companionBus.action(normalizeAction(sentence.action));

    const blob = await audio;
    if (runRef.current !== run || signal.aborted) return;
    if (blob) {
      try {
        await getPlayer().play(blob, (level) => companionBus.mouth(level), { signal });
        return;
      } catch {
        if (signal.aborted) return;
        // 播放失败（自动播放被拦 / 解码失败）→ 合成口型兜底
      }
    }
    const ms = estimateSpeechMs(sentence.text);
    companionBus.speakSynthetic(ms);
    await sleep(ms, signal);
  }

  function toggleVoice() {
    const next = !voiceOn;
    setVoiceOn(next);
    try {
      localStorage.setItem(VOICE_STORAGE_KEY, next ? "on" : "off");
    } catch {
      // ignore
    }
  }

  /** 选人格 → 存到服务端设置；成功后 updateCompanionSettings 会广播事件，上面的 effect 重拉 config */
  async function handlePickPersona(persona: Persona) {
    try {
      setPersonaBusy(true);
      await updateCompanionSettings({ personaId: persona._id });
      toast.success(t("companion.personaSet", { name: persona.name }));
      setPersonaOpen(false);
    } catch (error) {
      // 付费未购 / 未公开：PersonaPickerModal 已经拦了一道，这里是服务端最终裁决（比如作者刚改成收费）
      const reason = companionForbiddenReason(error);
      if (reason === "unpaid") toast.error(t("companion.personaUnpaid"));
      else if (reason === "private") toast.error(t("companion.personaPrivate"));
      else toast.error(humanizeError(error));
    } finally {
      setPersonaBusy(false);
    }
  }

  async function handleClearPersona() {
    try {
      setPersonaBusy(true);
      await updateCompanionSettings({ personaId: null });
      toast.success(t("companion.personaCleared"));
    } catch (error) {
      toast.error(humanizeError(error));
    } finally {
      setPersonaBusy(false);
    }
  }

  /** @param override 同意框确认后把暂存的那句直接传进来 —— 这时 input 状态还没刷新，读它会读到空串 */
  async function send(override?: string) {
    const text = (override ?? input).trim().slice(0, MAX_INPUT_CHARS);
    if (!text) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!enabled) {
      toast.error(t("companion.unavailable", { name }));
      return;
    }

    // 第一次聊天前要先看过告知（加州 SB 243）。服务端没要求时不打扰用户。
    // ★★ 判据读 **ref** 而不是 config（2026-09-25 评审）：`sendPending` 在 .finally 里调的
    //   `send` 是**本次渲染的闭包**，`setConfig` 还没生效 —— 于是点一次「我已了解」之后
    //   这一发又撞回这道闸，弹窗原地弹回、`acceptCompanionConsent` 被 PUT 第二遍，
    //   要点第二次才发得出去。这不是时序竞态，是词法闭包，**必现**。
    //   开关默认关着所以线上看不见；而 SB 243 要求打开它，届时每个新用户第一句都撞。
    if (consentNeededRef.current) {
      pendingTextRef.current = text;
      setInput("");
      setConsentOpen(true);
      return;
    }

    stopAll();
    const run = runRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    const history: ChatMessage[] = [...messages.slice(-(MAX_HISTORY - 1)), { role: "user", content: text }];
    setMessages(history);
    setInput("");
    setPhase("thinking");
    setSubtitle("");

    const wantVoice = voiceOn && Boolean(config?.tts);
    const lang: "zh" | "en" = i18n.language.startsWith("zh") ? "zh" : "en";
    let reply = "";
    let doneContext: ChatContext | undefined;
    try {
      const handlers: CompanionChatHandlers = {
        onThread: ({ threadId: id }) => {
          if (id && runRef.current === run) setThreadId(id);
        },
        // 求助卡：先把正在演的停掉（表情回到 normal、不再念），再把卡片显示出来。卡片不念、不进字幕。
        onSafety: (card) => {
          if (runRef.current !== run) return;
          stopAll();
          setSubtitle("");
          setSafetyCard(card);
        },
        onNotice: (n) => {
          if (runRef.current === run) setNotice(n);
        },
        onSentence: (sentence) => {
          // 音色三层（用户覆盖 > 人格自带 > 模型推荐 > 默认）服务端已合并进 voiceSettings，buildTtsRequest 负责展开：
          // 有混音配方就传 mix（不传 voice / instruct），否则传 voice；情绪与语调指令按句来
          // （sentence.tts.instruct 已是「人设语调；情绪语调」合并后的串）。
          // 老服务端没有 voiceSettings 时回落到老字段 voice + expressive=true，行为与改造前一致。
          const audio: Promise<Blob | null> = wantVoice
            ? synthesizeSpeech(
                buildTtsRequest({
                  text: sentence.text,
                  settings: config?.voiceSettings,
                  fallbackVoiceId: config?.voice,
                  emotion: sentence.tts?.emotion,
                  instruct: sentence.tts?.instruct,
                }),
                controller.signal,
              ).catch(() => null)
            : Promise.resolve(null);
          void enqueue(run, () => perform(run, sentence, audio, controller.signal));
        },
        onDone: (fullText, meta) => {
          reply = fullText;
          doneContext = meta.context;
          if (meta.context && runRef.current === run) setContext(meta.context);
        },
      };
      const legacyBody = { messages: history, lang, caps: COMPANION_CAPS };
      if (legacyRef.current) {
        await streamCompanionChat(legacyBody, handlers, controller.signal);
      } else {
        try {
          const current = threadIdRef.current;
          await streamCompanionChat({ message: text, ...(current ? { threadId: current } : {}), lang, caps: COMPANION_CAPS }, handlers, controller.signal);
        } catch (error) {
          const e = error as { status?: number; code?: string };
          if (isLegacyChatRejection(error)) {
            legacyRef.current = true;
            await streamCompanionChat(legacyBody, handlers, controller.signal);
          } else if (e?.status === 404 && e?.code === "CHAT_THREAD_NOT_FOUND") {
            // 这段对话在别处被删了（另一个标签页 / 过期清扫）→ 开个新会话把这句话发出去
            setThreadId(null);
            setContext(null);
            await streamCompanionChat({ message: text, lang, caps: COMPANION_CAPS }, handlers, controller.signal);
          } else {
            throw error;
          }
        }
      }
      if (doneContext?.level === "compact" && threadIdRef.current) pollContextAfterCompact(threadIdRef.current);
      // 等演出队列排空，再把整段回复写进历史、回到待命
      await enqueue(run, async () => undefined);
      if (runRef.current !== run) return;
      if (reply) setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setPhase("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      // 服务端要求先同意（428）：弹同意框，把这句话留着，同意后接着发
      if ((error as { status?: number })?.status === 428) {
        consentNeededRef.current = true;
        pendingTextRef.current = text;
        setConsentOpen(true);
        setPhase("idle");
        return;
      }
      toast.error(humanizeError(error));
      setSubtitle(t("companion.failed", { name }));
      setPhase("idle");
    }
  }

  function sendPending() {
    const text = pendingTextRef.current;
    pendingTextRef.current = "";
    setConsentOpen(false);
    // 已经同意过了：先把 ref 放下（send 读的是它），再拉一次 config 把镜像对齐
    consentNeededRef.current = false;
    getCompanionConfig()
      .then((next) => {
        setConfig(next);
        consentNeededRef.current = Boolean(next?.safety?.consentRequired && !next.safety.consented);
      })
      .catch(() => undefined)
      .finally(() => {
        if (text) void send(text);
      });
  }

  return (
    <div className="relative" data-tour="home-companion">
      {safetyCard ? <CompanionSafetyCard card={safetyCard} onClose={() => setSafetyCard(null)} /> : null}
      {notice ? (
        <p className="mb-1 w-fit max-w-xl rounded-full border border-gray-700 bg-gray-950/70 px-3 py-1 text-[11px] text-gray-400 backdrop-blur">
          {notice.text}
        </p>
      ) : null}
      {subtitle ? (
        <div className="mb-2 w-fit max-w-xl rounded-2xl rounded-bl-sm border border-cyan-900/60 bg-gray-950/85 px-4 py-2.5 text-sm leading-6 text-gray-100 shadow-lg backdrop-blur">
          <span className="mr-2 text-xs font-semibold text-cyan-300">{name}</span>
          {subtitle}
        </div>
      ) : null}

      {/* 当前人格 chip：用户自己选的可以一键取消；模型作者推荐的只标注来源（取消要去换模型或自己另选） */}
      {config?.persona ? (
        <div className="mb-1 flex w-fit items-center gap-1 rounded-full border border-cyan-900/60 bg-gray-950/70 px-2.5 py-0.5 text-[11px] text-cyan-200 backdrop-blur">
          <Drama className="h-3 w-3" />
          <span>{t("companion.personaChip", { name: config.persona.name })}</span>
          {config.personaSource === "model" ? <span className="text-gray-500">· {t("companion.personaFromModel")}</span> : null}
          {config.personaSource === "user" ? (
            <button
              type="button"
              onClick={() => void handleClearPersona()}
              disabled={personaBusy}
              className="ml-0.5 rounded-full text-gray-500 hover:text-white disabled:opacity-50"
              title={t("companion.personaClear")}
              aria-label={t("companion.personaClear")}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
        className="flex items-center gap-1.5 rounded-2xl border border-gray-800 bg-gray-900/85 p-2 shadow-xl backdrop-blur"
      >
        <button
          type="button"
          onClick={onOpenScene}
          className="rounded-full p-2 text-gray-300 transition hover:bg-gray-800 hover:text-white"
          title={t("companion.scene")}
          aria-label={t("companion.scene")}
        >
          <ImageIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={toggleVoice}
          className={`rounded-full p-2 transition hover:bg-gray-800 ${voiceOn ? "text-cyan-300" : "text-gray-500"}`}
          title={voiceOn ? t("companion.voiceOn") : t("companion.voiceOff")}
          aria-label={voiceOn ? t("companion.voiceOn") : t("companion.voiceOff")}
          aria-pressed={voiceOn}
        >
          {voiceOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>
        {/* 人格：开选择器（游客先登录）；换装：去模型市场 */}
        <button
          type="button"
          onClick={() => (user ? setPersonaOpen(true) : setAuthOpen(true))}
          disabled={personaBusy}
          className={`rounded-full p-2 transition hover:bg-gray-800 hover:text-white disabled:opacity-50 ${
            config?.persona ? "text-cyan-300" : "text-gray-300"
          }`}
          title={t("companion.persona")}
          aria-label={t("companion.persona")}
        >
          <Drama className="h-4 w-4" />
        </button>
        {/* 声音：开声音面板（模板市场 / 自定义；游客先登录） */}
        <button
          type="button"
          onClick={() => (user ? setVoiceModalOpen(true) : setAuthOpen(true))}
          className={`rounded-full p-2 transition hover:bg-gray-800 hover:text-white ${
            config?.voiceSettings?.templateId ? "text-cyan-300" : "text-gray-300"
          }`}
          title={t("companion.voiceButton")}
          aria-label={t("companion.voiceButton")}
        >
          <AudioLines className="h-4 w-4" />
        </button>
        <Link
          to="/live2d/market"
          className="rounded-full p-2 text-gray-300 transition hover:bg-gray-800 hover:text-white"
          title={t("companion.changeModel")}
          aria-label={t("companion.changeModel")}
        >
          <Shirt className="h-4 w-4" />
        </Link>
        {/* 记忆：外圈是上下文用量环，点开记忆面板（只给登录用户） */}
        {user ? (
          <button
            type="button"
            onClick={() => setMemoryOpen(true)}
            className="relative rounded-full p-1.5 text-gray-300 transition hover:bg-gray-800 hover:text-white"
            title={t("companion.memory.ringTitle", { percent: contextPercent(context) })}
            aria-label={t("companion.memory.title")}
          >
            <ContextRing context={context} />
          </button>
        ) : null}
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onFocus={() => {
            if (!user) setAuthOpen(true);
          }}
          maxLength={MAX_INPUT_CHARS}
          placeholder={
            !enabled
              ? t("companion.unavailable", { name })
              : user
                ? t("companion.placeholder", { name })
                : t("companion.loginToChat", { name })
          }
          disabled={!enabled}
          className="min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-gray-100 outline-none placeholder:text-gray-500 disabled:cursor-not-allowed"
        />
        {phase !== "idle" ? (
          <button
            type="button"
            onClick={stopAll}
            className="rounded-full bg-rose-500/20 p-2 text-rose-200 transition hover:bg-rose-500/30"
            title={t("companion.stop")}
            aria-label={t("companion.stop")}
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || !enabled}
            className="rounded-full bg-cyan-500/20 p-2 text-cyan-200 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            title={t("companion.send")}
            aria-label={t("companion.send")}
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>
      {/* 常驻告知（加州 SB 243 §22602(a)）：游客也要看得到，所以放在表单下面而不是聊天记录里 */}
      <p className="mt-1 px-2 text-[11px] leading-5 text-gray-500">
        {t("companion.aiNotice", { name })}
        {" · "}
        <Link to={config?.safety?.policyUrl || "/safety/ai-chat"} className="underline hover:text-gray-300">
          {t("companion.safety.policyLink")}
        </Link>
      </p>
      {phase === "thinking" ? <p className="mt-1 px-2 text-xs text-gray-400">{t("companion.thinking", { name })}</p> : null}
      {phase === "idle" && user && (context?.level === "compact" || context?.level === "full") ? (
        <button
          type="button"
          onClick={() => setMemoryOpen(true)}
          className={`mt-1 px-2 text-left text-xs ${contextTone(context.level).text} hover:underline`}
        >
          {t(context.level === "full" ? "companion.memory.fullHint" : "companion.memory.compactingHint", { name })}
        </button>
      ) : null}

      {authOpen ? <AuthDialog initialMode="login" next="/" onClose={() => setAuthOpen(false)} /> : null}
      <PersonaPickerModal open={personaOpen} onClose={() => setPersonaOpen(false)} onSelect={(persona) => void handlePickPersona(persona)} />
      <CompanionVoiceModal open={voiceModalOpen} onClose={() => setVoiceModalOpen(false)} config={config} />
      <CompanionConsentDialog
        open={consentOpen}
        name={name}
        safety={config?.safety}
        onAccepted={sendPending}
        onCancel={() => {
          pendingTextRef.current = "";
          setConsentOpen(false);
        }}
      />
      <CompanionMemoryPanel
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        name={name}
        threadId={threadId}
        context={context}
        onContextChange={setContext}
        onResetThread={resetThread}
      />
    </div>
  );
}

/** 上下文用量环：外圈按用量描边（颜色随档位），中间是记忆图标 */
function ContextRing({ context }: { context: ChatContext | null }) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const percent = contextPercent(context);
  const tone = contextTone(context?.level);
  return (
    <span className="relative flex h-6 w-6 items-center justify-center">
      <svg viewBox="0 0 24 24" className="absolute inset-0 h-6 w-6 -rotate-90" aria-hidden="true">
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="2" className="stroke-gray-700" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          className={`${tone.stroke} transition-all`}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <Brain className="h-3 w-3" />
    </span>
  );
}
