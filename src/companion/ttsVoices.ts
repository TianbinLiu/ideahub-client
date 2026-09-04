/**
 * @file ttsVoices.ts - 豆包音色目录（GET /api/tts/voices）的进程内缓存 + hook
 * @category Utility
 *
 * 目录是公开且几乎不变的，但用到它的地方不少（人格编辑器的音频板块、人格详情 / 模型详情的音色摘要、
 * 模型编辑器）—— 每个组件各自 fetch 会在同一页面里打三四次同一个接口。这里用模块级 Promise 缓存：
 * 第一次谁先要谁去取，之后所有人共享同一份结果；失败不缓存（下次再试），否则一次网络抖动就让目录永远为空。
 */

import { useEffect, useState } from "react";
import { getTtsVoices, type TtsVoice, type VoiceSettings } from "../api";

export type VoiceCatalog = { voices: TtsVoice[]; defaultVoiceId: string };

const EMPTY_CATALOG: VoiceCatalog = { voices: [], defaultVoiceId: "" };

let cached: VoiceCatalog | null = null;
let pending: Promise<VoiceCatalog> | null = null;

export function loadVoiceCatalog(): Promise<VoiceCatalog> {
  if (cached) return Promise.resolve(cached);
  if (pending) return pending;
  pending = getTtsVoices()
    .then((res) => {
      cached = { voices: Array.isArray(res.voices) ? res.voices : [], defaultVoiceId: String(res.defaultVoiceId || "") };
      return cached;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** 目录 + 加载态；取不到时给空目录（表单退化成只能填自定义 ID，而不是整块炸掉） */
export function useTtsVoices() {
  const [catalog, setCatalog] = useState<VoiceCatalog>(() => cached || EMPTY_CATALOG);
  const [loading, setLoading] = useState(() => !cached);

  useEffect(() => {
    let mounted = true;
    loadVoiceCatalog()
      .then((next) => {
        if (mounted) setCatalog(next);
      })
      .catch(() => {
        if (mounted) setCatalog(EMPTY_CATALOG);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return { ...catalog, loading };
}

/** 音色 id → 目录里的名字；目录外的自定义 id 原样显示 */
export function voiceDisplayName(voiceId: string, voices: TtsVoice[]): string {
  const id = String(voiceId || "").trim();
  if (!id) return "";
  const hit = voices.find((v) => v.id === id);
  return hit ? hit.name : id;
}

/** 与服务端一致的音色 id 白名单：目录之外也允许，但字符集要对得上，否则 400 */
export const VOICE_ID_PATTERN = /^[a-zA-Z0-9_.-]{1,64}$/;

/** 「刚点了设置音色」的起点：每一项都是跟随，用户只改自己关心的那一项 */
export function emptyVoiceSettings(): VoiceSettings {
  return { voiceId: "", rate: null, pitch: null, instruct: "", expressive: true };
}

/** speech_rate → 倍速文案（表单滑杆与只读摘要共用，保证两边显示一致） */
export function formatRate(rate: number) {
  return `${(1 + rate / 100).toFixed(2)}×`;
}

export function formatPitch(pitch: number) {
  return pitch > 0 ? `+${pitch}` : String(pitch);
}
