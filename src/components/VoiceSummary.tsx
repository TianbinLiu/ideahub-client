/**
 * @file VoiceSummary.tsx - 一组 VoiceSettings 的只读摘要（音色或混音配方 / 来源模板 / 语速 / 音调 / 语调指令 / 情感模式）
 * @category Component
 * @i18n_module voiceSummary
 *
 * 人格详情页的「音频」和模型详情页的「推荐音色」都要展示同一种东西；音色 id → 名字要查目录
 * （companion/ttsVoices.ts 的缓存），目录外的自定义 id 原样显示。null 的情况由调用方决定怎么说（「无」/「跟随」），
 * 这里只负责非空的展示。
 * ★ 混音（mix 非空）：音色那一行换成「混音」徽标 + 配方「高冷御姐 50% · 知性女声 30%」；语调指令 / 情感模式对 1.0 混音无效，不显示。
 * ★ 来自声音市场模板（templateId）：多一行「来源模板」链到详情；模板被删 / 转私有 → 「模板已不存在」（声音本身是快照，不受影响）。
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import type { VoiceSettings } from "../api";
import { formatPitch, formatRate, useTtsVoices, voiceDisplayName } from "../companion/ttsVoices";
import { formatMixRecipe, hasMix } from "../companion/voiceMix";
import { useVoiceTemplateName } from "../companion/voiceTemplates";

export default function VoiceSummary({ voice, className = "" }: { voice: VoiceSettings; className?: string }) {
  const { t } = useTranslation();
  const { voices, mixable } = useTtsVoices();
  const follow = t("voiceSummary.follow");
  const mixed = hasMix(voice);
  const voiceName = mixed ? "" : voiceDisplayName(voice.voiceId, voices);
  const { name: templateName, loading: templateLoading } = useVoiceTemplateName(voice.templateId);
  const nameOf = (id: string) => voiceDisplayName(id, voices, mixable);

  return (
    <dl className={`grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm ${className}`}>
      <dt className="text-gray-500">{t("voiceSummary.voice")}</dt>
      <dd className="text-gray-200">
        {mixed ? (
          <>
            <span className="mr-1.5 rounded-full border border-cyan-700/60 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-200">
              {t("voiceSummary.mix")}
            </span>
            {formatMixRecipe(voice.mix, nameOf)}
          </>
        ) : (
          <>
            {voiceName || follow}
            {voiceName && voiceName !== voice.voiceId ? <span className="ml-1 text-xs text-gray-500">({voice.voiceId})</span> : null}
          </>
        )}
      </dd>
      {voice.templateId ? (
        <>
          <dt className="text-gray-500">{t("voiceSummary.template")}</dt>
          <dd className="text-gray-200">
            {templateLoading ? (
              "…"
            ) : templateName ? (
              <Link to={`/voices/market/${voice.templateId}`} className="text-cyan-300 hover:underline">
                {templateName}
              </Link>
            ) : (
              <span className="text-gray-500">{t("voiceSummary.templateGone")}</span>
            )}
          </dd>
        </>
      ) : null}
      <dt className="text-gray-500">{t("voiceSummary.rate")}</dt>
      <dd className="text-gray-200">{voice.rate == null ? follow : formatRate(voice.rate)}</dd>
      <dt className="text-gray-500">{t("voiceSummary.pitch")}</dt>
      <dd className="text-gray-200">{voice.pitch == null ? follow : formatPitch(voice.pitch)}</dd>
      {!mixed && voice.instruct?.trim() ? (
        <>
          <dt className="text-gray-500">{t("voiceSummary.instruct")}</dt>
          <dd className="whitespace-pre-wrap break-words text-gray-200">{voice.instruct.trim()}</dd>
        </>
      ) : null}
      {!mixed && (
        <>
          <dt className="text-gray-500">{t("voiceSummary.expressive")}</dt>
          <dd className="text-gray-200">{voice.expressive ? t("voiceSummary.on") : t("voiceSummary.off")}</dd>
        </>
      )}
    </dl>
  );
}
