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
 * ★ 人格 / 音频 / 换装（docs/COMPANION.md「人格 / 音频 / 模型市场」）：config 里带着当前人格与合并后的音色，
 *   TTS 请求按 voiceSettings 发；「人格」按钮开 PersonaPickerModal → PUT /api/companion/settings，「换装」跳模型市场。
 *   谁改了设置都会广播 ideahub:companion-updated，这里监听它重拉 config（人格名 chip、音色都跟着变）。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import toast from "react-hot-toast";
import { Drama, ImageIcon, Send, Shirt, Square, Volume2, VolumeX, X } from "lucide-react";
import {
  COMPANION_UPDATED_EVENT,
  companionForbiddenReason,
  getCompanionConfig,
  streamCompanionChat,
  synthesizeSpeech,
  updateCompanionSettings,
  type CompanionConfig,
  type Persona,
} from "../api";
import { useAuth } from "../authContext";
import AuthDialog from "./AuthDialog";
import PersonaPickerModal from "./PersonaPickerModal";
import { companionBus } from "../companion/bus";
import { SpeechPlayer } from "../companion/speech";
import { estimateSpeechMs, normalizeAction, normalizeFace, type CompanionSentence } from "../companion/protocol";
import { humanizeError } from "../utils/humanizeError";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Phase = "idle" | "thinking" | "speaking";

const VOICE_STORAGE_KEY = "ideahub-companion-voice";
/** 发给服务端的历史条数上限（服务端 zod 上限 20，这里留余量） */
const MAX_HISTORY = 12;
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
      getCompanionConfig()
        .then((next) => {
          if (mounted) setConfig(next);
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
  }, [userId]);

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

  async function send() {
    const text = input.trim().slice(0, MAX_INPUT_CHARS);
    if (!text) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (!enabled) {
      toast.error(t("companion.unavailable", { name }));
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
    let reply = "";
    try {
      await streamCompanionChat(
        { messages: history, lang: i18n.language.startsWith("zh") ? "zh" : "en" },
        {
          onSentence: (sentence) => {
            // 音色三层（用户覆盖 > 人格自带 > 模型推荐 > 默认）服务端已合并进 voiceSettings，这里原样展开；
            // 情绪与语调指令按句来（sentence.tts.instruct 已是「人设语调；情绪语调」合并后的串）。
            // 老服务端没有 voiceSettings 时回落到老字段 voice + expressive=true，行为与改造前一致。
            const vs = config?.voiceSettings;
            const audio: Promise<Blob | null> = wantVoice
              ? synthesizeSpeech(
                  {
                    text: sentence.text,
                    voice: vs?.voiceId || config?.voice || undefined,
                    rate: vs?.rate ?? undefined,
                    pitch: vs?.pitch ?? undefined,
                    expressive: vs ? vs.expressive : true,
                    emotion: sentence.tts?.emotion,
                    instruct: sentence.tts?.instruct,
                  },
                  controller.signal,
                ).catch(() => null)
              : Promise.resolve(null);
            void enqueue(run, () => perform(run, sentence, audio, controller.signal));
          },
          onDone: (fullText) => {
            reply = fullText;
          },
        },
        controller.signal,
      );
      // 等演出队列排空，再把整段回复写进历史、回到待命
      await enqueue(run, async () => undefined);
      if (runRef.current !== run) return;
      if (reply) setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
      setPhase("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      toast.error(humanizeError(error));
      setSubtitle(t("companion.failed", { name }));
      setPhase("idle");
    }
  }

  return (
    <div className="relative" data-tour="home-companion">
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
        <Link
          to="/live2d/market"
          className="rounded-full p-2 text-gray-300 transition hover:bg-gray-800 hover:text-white"
          title={t("companion.changeModel")}
          aria-label={t("companion.changeModel")}
        >
          <Shirt className="h-4 w-4" />
        </Link>
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
      {phase === "thinking" ? <p className="mt-1 px-2 text-xs text-gray-400">{t("companion.thinking", { name })}</p> : null}

      {authOpen ? <AuthDialog initialMode="login" next="/" onClose={() => setAuthOpen(false)} /> : null}
      <PersonaPickerModal open={personaOpen} onClose={() => setPersonaOpen(false)} onSelect={(persona) => void handlePickPersona(persona)} />
    </div>
  );
}
