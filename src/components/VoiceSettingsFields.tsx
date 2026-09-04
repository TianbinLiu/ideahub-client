/**
 * @file VoiceSettingsFields.tsx - 「音频」表单块：音色 / 语速 / 音调 / 语调指令 / 情感模式 / 试听
 * @category Component
 * @i18n_module voiceFields
 *
 * 人格编辑器（人格自带的嗓子）和模型编辑器（作者推荐的嗓子）共用，value 的形状就是服务端的 VoiceSettings。
 * 受控组件：value=null 表示「不设置（跟随下一层）」，此时只显示一行说明 + 「设置音色」按钮；
 * 有值时才展开全部字段，底部「不设置（跟随）」把整个值置回 null。
 *
 * ★ 每个字段都保留「跟随」态（voiceId "" / rate null / pitch null）：服务端按层合并（用户覆盖 > 人格 > 模型 > 默认），
 *   如果表单一展开就把 rate 填成 0，用户根本没碰的项也会覆盖下一层，人格作者调好的语速就被模型作者「无意」盖掉了。
 * ★ 自定义音色 ID 只在通过 VOICE_ID_PATTERN 时才往上传：非法值留在本地输入框里标红，保存出去的 value 永远合法。
 * ★ 试听直接打 /api/tts（要登录，30 次/分钟）：Blob → object URL → <audio>，播完 / 出错 / 卸载都要 revoke，
 *   否则每试听一次就漏一段内存里的 mp3。
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Play, Square } from "lucide-react";
import { synthesizeSpeech, type VoiceSettings } from "../api";
import { emptyVoiceSettings, formatPitch, formatRate, useTtsVoices, VOICE_ID_PATTERN } from "../companion/ttsVoices";
import { humanizeError } from "../utils/humanizeError";

const CUSTOM_OPTION = "__custom__";
/** 滑杆范围：语速 -30..20（step 5）覆盖 0.7×~1.2×，再快就听不清；音调 ±6 半音，再大就不像同一个人了 */
const RATE_MIN = -30;
const RATE_MAX = 20;
const RATE_STEP = 5;
const PITCH_MIN = -6;
const PITCH_MAX = 6;
const INSTRUCT_MAX = 200;

type Props = {
  value: VoiceSettings | null;
  onChange: (next: VoiceSettings | null) => void;
  /** 试听朗读的句子；缺省用一句通用问候 */
  previewText?: string;
};

export default function VoiceSettingsFields({ value, onChange, previewText }: Props) {
  const { t } = useTranslation();
  const { voices, defaultVoiceId, loading: catalogLoading } = useTtsVoices();

  // 「自定义音色 ID」模式：用户主动选了「自定义…」，或当前 id 不在目录里
  const [useCustom, setUseCustom] = useState(false);
  const [customText, setCustomText] = useState(value?.voiceId || "");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef("");

  const voiceId = value?.voiceId || "";
  const inCatalog = Boolean(voiceId) && voices.some((v) => v.id === voiceId);
  const customMode = useCustom || (Boolean(voiceId) && !catalogLoading && !inCatalog);
  const customInvalid = customMode && customText.trim() !== "" && !VOICE_ID_PATTERN.test(customText.trim());
  const selectedVoice = voices.find((v) => v.id === voiceId);
  const defaultVoice = voices.find((v) => v.id === defaultVoiceId);

  // 外部改了 voiceId（编辑态预填 / 父级重置）时同步本地输入框：渲染期对齐（不用 effect，省一轮级联渲染）。
  // 用户正在敲的非法值不会触发 —— 非法值不上传，voiceId 没变。
  const [syncedVoiceId, setSyncedVoiceId] = useState(voiceId);
  if (syncedVoiceId !== voiceId) {
    setSyncedVoiceId(voiceId);
    setCustomText(voiceId);
  }

  function stopPreview() {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch {
        // ignore
      }
      audio.removeAttribute("src");
      audioRef.current = null;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";
    setPlaying(false);
  }

  useEffect(() => stopPreview, []);

  function patch(next: Partial<VoiceSettings>) {
    onChange({ ...(value || emptyVoiceSettings()), ...next });
  }

  function handleSelectVoice(selected: string) {
    if (selected === CUSTOM_OPTION) {
      setUseCustom(true);
      return;
    }
    setUseCustom(false);
    setCustomText(selected);
    patch({ voiceId: selected });
  }

  function handleCustomText(text: string) {
    setCustomText(text);
    const trimmed = text.trim();
    if (trimmed === "" || VOICE_ID_PATTERN.test(trimmed)) patch({ voiceId: trimmed });
  }

  async function handlePreview() {
    if (!value) return;
    if (playing) {
      stopPreview();
      return;
    }
    const text = (previewText || "").trim() || t("voiceFields.previewDefault");
    try {
      setBusy(true);
      const blob = await synthesizeSpeech({
        text,
        voice: value.voiceId || undefined,
        rate: value.rate ?? undefined,
        pitch: value.pitch ?? undefined,
        instruct: value.instruct.trim() || undefined,
        expressive: value.expressive,
      });
      stopPreview();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      urlRef.current = url;
      audioRef.current = audio;
      audio.addEventListener("ended", stopPreview, { once: true });
      audio.addEventListener("error", stopPreview, { once: true });
      setPlaying(true);
      await audio.play();
    } catch (e) {
      stopPreview();
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  if (!value) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-gray-700 bg-gray-950/40 p-3">
        <div>
          <p className="text-sm text-gray-300">{t("voiceFields.unsetTitle")}</p>
          <p className="mt-0.5 text-xs text-gray-500">{t("voiceFields.unsetHint")}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(emptyVoiceSettings())}
          className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/20"
        >
          {t("voiceFields.enable")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 音色：目录下拉 + 自定义 ID */}
      <div>
        <label className="block text-sm text-gray-300">
          {t("voiceFields.voiceLabel")}
          <select
            value={customMode ? CUSTOM_OPTION : voiceId}
            onChange={(e) => handleSelectVoice(e.target.value)}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
          >
            <option value="">
              {t("voiceFields.voiceDefault")}
              {defaultVoice ? `（${defaultVoice.name}）` : ""}
            </option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.why ? ` — ${v.why}` : ""}
              </option>
            ))}
            <option value={CUSTOM_OPTION}>{t("voiceFields.voiceCustom")}</option>
          </select>
        </label>
        {catalogLoading ? (
          <p className="mt-1 text-xs text-gray-500">{t("voiceFields.catalogLoading")}</p>
        ) : voices.length === 0 ? (
          <p className="mt-1 text-xs text-amber-300/80">{t("voiceFields.catalogEmpty")}</p>
        ) : selectedVoice?.why ? (
          <p className="mt-1 text-xs text-gray-500">{selectedVoice.why}</p>
        ) : null}
        {customMode && (
          <div className="mt-2">
            <input
              value={customText}
              onChange={(e) => handleCustomText(e.target.value)}
              maxLength={64}
              placeholder={t("voiceFields.customIdPlaceholder")}
              aria-invalid={customInvalid}
              className={`w-full rounded-xl border bg-gray-950/50 px-3 py-2 text-sm text-gray-100 ${
                customInvalid ? "border-rose-600" : "border-gray-800"
              }`}
            />
            {customInvalid && <p className="mt-1 text-xs text-rose-300">{t("voiceFields.customIdInvalid")}</p>}
          </div>
        )}
      </div>

      {/* 语速 */}
      <SliderRow
        label={t("voiceFields.rateLabel")}
        valueLabel={value.rate == null ? t("voiceFields.followDefault") : formatRate(value.rate)}
        min={RATE_MIN}
        max={RATE_MAX}
        step={RATE_STEP}
        value={value.rate}
        onChange={(rate) => patch({ rate })}
        resetLabel={t("voiceFields.resetToFollow")}
      />

      {/* 音调 */}
      <SliderRow
        label={t("voiceFields.pitchLabel")}
        valueLabel={value.pitch == null ? t("voiceFields.followDefault") : formatPitch(value.pitch)}
        min={PITCH_MIN}
        max={PITCH_MAX}
        step={1}
        value={value.pitch}
        onChange={(pitch) => patch({ pitch })}
        resetLabel={t("voiceFields.resetToFollow")}
      />

      {/* 语调指令 */}
      <label className="block text-sm text-gray-300">
        {t("voiceFields.instructLabel")}
        <textarea
          value={value.instruct}
          onChange={(e) => patch({ instruct: e.target.value.slice(0, INSTRUCT_MAX) })}
          maxLength={INSTRUCT_MAX}
          rows={2}
          placeholder={t("voiceFields.instructPlaceholder")}
          className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100"
        />
        <span className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
          <span>{t("voiceFields.instructHint")}</span>
          <span>
            {value.instruct.length}/{INSTRUCT_MAX}
          </span>
        </span>
      </label>

      {/* 情感模式 */}
      <label className="flex items-start gap-2 text-sm text-gray-300">
        <input
          type="checkbox"
          checked={value.expressive}
          onChange={(e) => patch({ expressive: e.target.checked })}
          className="mt-1 accent-cyan-400"
        />
        <span>
          {t("voiceFields.expressiveLabel")}
          <span className="block text-xs text-gray-500">{t("voiceFields.expressiveHint")}</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || customInvalid}
          onClick={handlePreview}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
        >
          {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {busy ? t("voiceFields.previewBusy") : playing ? t("voiceFields.previewStop") : t("voiceFields.preview")}
        </button>
        <button
          type="button"
          onClick={() => {
            stopPreview();
            setUseCustom(false);
            onChange(null);
          }}
          className="rounded-xl border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          {t("voiceFields.follow")}
        </button>
      </div>
    </div>
  );
}

function SliderRow({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
  resetLabel,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
  onChange: (next: number | null) => void;
  resetLabel: string;
}) {
  return (
    <div className="text-sm text-gray-300">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className={value == null ? "text-xs text-gray-500" : "text-xs text-cyan-200"}>{valueLabel}</span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          // 跟随态滑块停在 0（= 1.00× / 不变调），拖一下就变成显式值
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`flex-1 accent-cyan-400 ${value == null ? "opacity-50" : ""}`}
          aria-label={label}
        />
        <button
          type="button"
          disabled={value == null}
          onClick={() => onChange(null)}
          className="rounded-lg border border-gray-700 px-2 py-1 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40"
        >
          {resetLabel}
        </button>
      </div>
    </div>
  );
}
