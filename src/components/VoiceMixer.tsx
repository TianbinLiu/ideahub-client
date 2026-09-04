/**
 * @file VoiceMixer.tsx - 混音器：1～3 味豆包 1.0 音色各一根权重滑杆，显示归一后的百分比，带试听
 * @category Component
 * @i18n_module voiceMixer
 *
 * 音频表单（VoiceSettingsFields 的「混音」模式）和声音市场的模板编辑器共用；受控组件，value 就是配方数组。
 * ★ 下拉只列 mixable（1.0 原料）并按 女声 / 男声 分组：2.0 音色混不了，根本不给选，比事后 400 友好。
 * ★ 一行一味：同一音色不能选两次（别的行已选的选项禁用），服务端会把重复的合并掉，前端先拦免得百分比看着不对。
 * ★ 百分比是归一后的（mixPercentages 最大余数法）：滑杆是 0.05～1 的原始权重，用户只关心「占几成」；服务端会再归一。
 * ★ 试听走 buildTtsRequest：有 mix 时只传 mix + rate/pitch —— 语调指令 / 情感模式对 1.0 混音无效，面板上直接写明。
 */
import { useTranslation } from "react-i18next";
import { Play, Plus, Square, Trash2 } from "lucide-react";
import { synthesizeSpeech, type VoiceMixEntry } from "../api";
import { useTtsVoices } from "../companion/ttsVoices";
import { buildTtsRequest, clampMixWeight, cleanMix, MIX_WEIGHT_MAX, MIX_WEIGHT_MIN, MIX_WEIGHT_STEP, mixPercentages } from "../companion/voiceMix";
import { usePreviewSentence } from "../companion/voiceTemplates";
import { useAudioPreview } from "../hooks/useAudioPreview";

type Props = {
  value: VoiceMixEntry[];
  onChange: (next: VoiceMixEntry[]) => void;
  /** 最多几味；缺省用目录给的 maxMixVoices（契约 3） */
  maxVoices?: number;
  /** 试听时带上的语速 / 音高（配方本身不含这两项，由外层表单持有） */
  preview?: { rate: number | null; pitch: number | null };
  /** 试听句子；缺省「你好，我是小梦，这是我的新声音。」 */
  previewText?: string;
  disabled?: boolean;
};

export default function VoiceMixer({ value, onChange, maxVoices, preview, previewText, disabled = false }: Props) {
  const { t } = useTranslation();
  const { mixable, maxMixVoices, loading } = useTtsVoices();
  const { busy, playing, toggle } = useAudioPreview();
  const defaultSentence = usePreviewSentence();

  const max = Math.max(1, maxVoices ?? maxMixVoices);
  const rows = value.slice(0, max);
  const percentages = mixPercentages(rows);
  const female = mixable.filter((v) => v.gender === "female");
  const male = mixable.filter((v) => v.gender !== "female");
  const usedIds = new Set(rows.map((row) => row.voiceId).filter(Boolean));
  const validCount = cleanMix(rows, max).length;

  function update(index: number, patch: Partial<VoiceMixEntry>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function remove(index: number) {
    onChange(rows.filter((_, i) => i !== index));
  }

  /** 新行默认选第一味还没用过的原料；第一味权重 1、之后 0.5（先重后轻，加进来的是「点缀」） */
  function add() {
    if (rows.length >= max) return;
    const next = mixable.find((v) => !usedIds.has(v.id));
    onChange([...rows, { voiceId: next?.id || "", weight: rows.length === 0 ? 1 : 0.5 }]);
  }

  function handlePreview() {
    const text = (previewText || "").trim() || defaultSentence;
    toggle(() =>
      synthesizeSpeech(buildTtsRequest({ text, settings: { mix: rows, rate: preview?.rate ?? null, pitch: preview?.pitch ?? null } }))
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">{t("voiceMixer.hint")}</p>
      {loading ? (
        <p className="text-xs text-gray-500">{t("voiceFields.catalogLoading")}</p>
      ) : mixable.length === 0 ? (
        <p className="text-xs text-amber-300/80">{t("voiceMixer.catalogEmpty")}</p>
      ) : null}

      {rows.map((row, index) => (
        <div key={index} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3">
          <div className="flex items-center gap-2">
            <select
              value={row.voiceId}
              onChange={(e) => update(index, { voiceId: e.target.value })}
              disabled={disabled}
              aria-label={t("voiceMixer.voiceLabel", { n: index + 1 })}
              className="min-w-0 flex-1 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
            >
              {/* 占位项：选过音色后就不许再退回空行（空行提交到服务端只会得到 zod 的通用报错） */}
              <option value="" disabled={Boolean(row.voiceId)}>
                {t("voiceMixer.pickVoice")}
              </option>
              <optgroup label={t("voiceMixer.groupFemale")}>
                {female.map((v) => (
                  <option key={v.id} value={v.id} disabled={usedIds.has(v.id) && v.id !== row.voiceId}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t("voiceMixer.groupMale")}>
                {male.map((v) => (
                  <option key={v.id} value={v.id} disabled={usedIds.has(v.id) && v.id !== row.voiceId}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            </select>
            <span className="w-12 shrink-0 text-right text-sm font-semibold text-cyan-200">{percentages[index]}%</span>
            <button
              type="button"
              onClick={() => remove(index)}
              disabled={disabled || rows.length <= 1}
              title={t("voiceMixer.remove")}
              aria-label={t("voiceMixer.remove")}
              className="rounded-lg border border-gray-700 p-1.5 text-gray-400 hover:bg-gray-800 hover:text-rose-300 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3">
            <input
              type="range"
              min={MIX_WEIGHT_MIN}
              max={MIX_WEIGHT_MAX}
              step={MIX_WEIGHT_STEP}
              value={row.weight}
              onChange={(e) => update(index, { weight: clampMixWeight(Number(e.target.value)) })}
              disabled={disabled}
              aria-label={t("voiceMixer.weightLabel", { n: index + 1 })}
              className="flex-1 accent-cyan-400"
            />
            <span className="w-10 shrink-0 text-right text-xs text-gray-500">{row.weight.toFixed(2)}</span>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={add}
          disabled={disabled || rows.length >= max || mixable.length === 0}
          className="inline-flex items-center gap-1 rounded-xl border border-gray-700 px-3 py-1.5 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-40"
        >
          <Plus className="h-4 w-4" /> {t("voiceMixer.add")}
        </button>
        <span className="text-xs text-gray-500">{t("voiceMixer.count", { count: rows.length, max })}</span>
        <button
          type="button"
          onClick={handlePreview}
          disabled={disabled || validCount === 0}
          className="ml-auto inline-flex items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {busy ? t("voiceFields.previewBusy") : playing ? t("voiceFields.previewStop") : t("voiceFields.preview")}
        </button>
      </div>
    </div>
  );
}
