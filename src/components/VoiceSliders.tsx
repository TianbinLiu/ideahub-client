/**
 * @file VoiceSliders.tsx - 语速 / 音调滑杆（带「跟随」态）：音频表单、声音市场的模板编辑器共用
 * @category Component
 * @i18n_module voiceFields
 *
 * 从 VoiceSettingsFields 里拆出来：模板编辑器也要同一对滑杆（同样的范围、同样的倍速文案、同样的「跟随」语义），
 * 抄一份就会出现两处范围不一致。
 * ★ 滑杆范围：语速 -30..20（step 5）覆盖 0.7×~1.2×，再快就听不清；音调 ±6 半音，再大就不像同一个人了。
 * ★ null = 跟随（不覆盖下一层 / 模板不定语速）：滑块停在 0 并半透明，拖一下就变成显式值；「跟随」按钮置回 null。
 */
import { useTranslation } from "react-i18next";
import { formatPitch, formatRate } from "../companion/ttsVoices";

export const RATE_MIN = -30;
export const RATE_MAX = 20;
export const RATE_STEP = 5;
export const PITCH_MIN = -6;
export const PITCH_MAX = 6;

type ValueProps = {
  value: number | null;
  onChange: (next: number | null) => void;
  /** 「跟随」按钮的文案；缺省 voiceFields.resetToFollow */
  resetLabel?: string;
};

export function SliderRow({
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

export function RateSliderRow({ value, onChange, resetLabel }: ValueProps) {
  const { t } = useTranslation();
  return (
    <SliderRow
      label={t("voiceFields.rateLabel")}
      valueLabel={value == null ? t("voiceFields.followDefault") : formatRate(value)}
      min={RATE_MIN}
      max={RATE_MAX}
      step={RATE_STEP}
      value={value}
      onChange={onChange}
      resetLabel={resetLabel ?? t("voiceFields.resetToFollow")}
    />
  );
}

export function PitchSliderRow({ value, onChange, resetLabel }: ValueProps) {
  const { t } = useTranslation();
  return (
    <SliderRow
      label={t("voiceFields.pitchLabel")}
      valueLabel={value == null ? t("voiceFields.followDefault") : formatPitch(value)}
      min={PITCH_MIN}
      max={PITCH_MAX}
      step={1}
      value={value}
      onChange={onChange}
      resetLabel={resetLabel ?? t("voiceFields.resetToFollow")}
    />
  );
}
