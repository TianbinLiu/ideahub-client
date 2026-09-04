/**
 * @file VoiceSummary.tsx - 一组 VoiceSettings 的只读摘要（音色 / 语速 / 音调 / 语调指令 / 情感模式）
 * @category Component
 * @i18n_module voiceSummary
 *
 * 人格详情页的「音频」和模型详情页的「推荐音色」都要展示同一种东西；音色 id → 名字要查目录
 * （companion/ttsVoices.ts 的缓存），目录外的自定义 id 原样显示。null 的情况由调用方决定怎么说（「无」/「跟随」），
 * 这里只负责非空的展示。
 */
import { useTranslation } from "react-i18next";
import type { VoiceSettings } from "../api";
import { formatPitch, formatRate, useTtsVoices, voiceDisplayName } from "../companion/ttsVoices";

export default function VoiceSummary({ voice, className = "" }: { voice: VoiceSettings; className?: string }) {
  const { t } = useTranslation();
  const { voices } = useTtsVoices();
  const follow = t("voiceSummary.follow");
  const voiceName = voiceDisplayName(voice.voiceId, voices);

  return (
    <dl className={`grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm ${className}`}>
      <dt className="text-gray-500">{t("voiceSummary.voice")}</dt>
      <dd className="text-gray-200">
        {voiceName || follow}
        {voiceName && voiceName !== voice.voiceId ? <span className="ml-1 text-xs text-gray-500">({voice.voiceId})</span> : null}
      </dd>
      <dt className="text-gray-500">{t("voiceSummary.rate")}</dt>
      <dd className="text-gray-200">{voice.rate == null ? follow : formatRate(voice.rate)}</dd>
      <dt className="text-gray-500">{t("voiceSummary.pitch")}</dt>
      <dd className="text-gray-200">{voice.pitch == null ? follow : formatPitch(voice.pitch)}</dd>
      {voice.instruct?.trim() ? (
        <>
          <dt className="text-gray-500">{t("voiceSummary.instruct")}</dt>
          <dd className="whitespace-pre-wrap break-words text-gray-200">{voice.instruct.trim()}</dd>
        </>
      ) : null}
      <dt className="text-gray-500">{t("voiceSummary.expressive")}</dt>
      <dd className="text-gray-200">{voice.expressive ? t("voiceSummary.on") : t("voiceSummary.off")}</dd>
    </dl>
  );
}
