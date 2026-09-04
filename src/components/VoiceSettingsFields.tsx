/**
 * @file VoiceSettingsFields.tsx - 「音频」表单块：单音色 / 混音 / 声音市场模板 三种模式 + 语速 / 音调 / 语调指令 / 情感模式 / 试听
 * @category Component
 * @i18n_module voiceFields
 *
 * 人格编辑器（人格自带的嗓子）、模型编辑器（作者推荐的嗓子）、首页「声音」面板的自定义 tab 共用，
 * value 的形状就是服务端的 VoiceSettings。受控组件：value=null 表示「不设置（跟随下一层）」，
 * 此时只显示一行说明 + 「设置音色」按钮；有值时才展开，底部「不设置（跟随）」把整个值置回 null。
 *
 * 三种模式（docs/COMPANION.md「声音市场」）。模式不是独立 state，而是从 value 推导的：
 *   templateId 有值 → 「声音市场模板」；否则 mix 非空 → 「混音」；否则 → 「单音色」。
 *   唯一的例外：用户点了「混音」但目录还没回来、一味都没加 → wantMix 记住这个意愿（value.mix 仍是 null）。
 *   这样父级异步预填 value（编辑态）时不用同步任何本地 state，模式自然就对。
 * ★ 切模式即改 value：单音色 ← 清掉 mix / templateId；混音 ← 清掉 templateId（配方复制成自己的，「来自模板」chip 消失）、
 *   清空 voiceId（服务端有 mix 时也会清）；「声音市场模板」那个 tab 本身是个按钮 —— 点它开选择器，选中才切过去。
 * ★ 混音时语调指令 / 情感模式对 1.0 音色无效：指令框禁用并写明，情感模式不显示；模板模式只读展示配方，
 *   想微调就切到「混音」（配方复制成自己的）。
 * ★ 每个字段都保留「跟随」态（voiceId "" / rate null / pitch null）：服务端按层合并（用户覆盖 > 人格 > 模型 > 默认），
 *   如果表单一展开就把 rate 填成 0，用户根本没碰的项也会覆盖下一层，人格作者调好的语速就被模型作者「无意」盖掉了。
 * ★ 自定义音色 ID 只在通过 VOICE_ID_PATTERN 时才往上传：非法值留在本地输入框里标红，保存出去的 value 永远合法。
 * ★ 试听统一走 useAudioPreview（object URL 的 revoke 在那里）+ buildTtsRequest（有 mix 传 mix，没有传 voice）。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Play, Square } from "lucide-react";
import { synthesizeSpeech, type VoiceSettings, type VoiceTemplate } from "../api";
import { emptyVoiceSettings, formatPitch, formatRate, useTtsVoices, voiceDisplayName, VOICE_ID_PATTERN } from "../companion/ttsVoices";
import { buildTtsRequest, formatMixRecipe, hasMix } from "../companion/voiceMix";
import { templateVoiceSnapshot, usePreviewSentence, useVoiceTemplateName } from "../companion/voiceTemplates";
import { useAudioPreview } from "../hooks/useAudioPreview";
import VoiceMixer from "./VoiceMixer";
import { PitchSliderRow, RateSliderRow } from "./VoiceSliders";
import VoiceTemplatePickerModal from "./VoiceTemplatePickerModal";

const CUSTOM_OPTION = "__custom__";
const INSTRUCT_MAX = 200;

type Mode = "single" | "mix" | "template";

type Props = {
  value: VoiceSettings | null;
  onChange: (next: VoiceSettings | null) => void;
  /** 试听朗读的句子；缺省「你好，我是小梦，这是我的新声音。」 */
  previewText?: string;
};

export default function VoiceSettingsFields({ value, onChange, previewText }: Props) {
  const { t } = useTranslation();
  const { voices, mixable, defaultVoiceId, loading: catalogLoading } = useTtsVoices();
  const { busy, playing, toggle, stop } = useAudioPreview();
  const defaultSentence = usePreviewSentence();

  // 「自定义音色 ID」模式：用户主动选了「自定义…」，或当前 id 不在目录里
  const [useCustom, setUseCustom] = useState(false);
  const [customText, setCustomText] = useState(value?.voiceId || "");
  // 用户点了「混音」但还一味都没加（目录未到）：先记住意愿
  const [wantMix, setWantMix] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const voiceId = value?.voiceId || "";
  const templateId = value?.templateId || null;
  const mode: Mode = templateId ? "template" : hasMix(value) || (wantMix && value) ? "mix" : "single";
  const { name: templateName, loading: templateLoading } = useVoiceTemplateName(templateId);

  const inCatalog = Boolean(voiceId) && voices.some((v) => v.id === voiceId);
  const customMode = useCustom || (Boolean(voiceId) && !catalogLoading && !inCatalog);
  const customInvalid = customMode && customText.trim() !== "" && !VOICE_ID_PATTERN.test(customText.trim());
  const selectedVoice = voices.find((v) => v.id === voiceId);
  const defaultVoice = voices.find((v) => v.id === defaultVoiceId);
  const nameOf = (id: string) => voiceDisplayName(id, voices, mixable);
  const follow = t("voiceSummary.follow");

  // 外部改了 voiceId（编辑态预填 / 父级重置）时同步本地输入框：渲染期对齐（不用 effect，省一轮级联渲染）。
  // 用户正在敲的非法值不会触发 —— 非法值不上传，voiceId 没变。
  const [syncedVoiceId, setSyncedVoiceId] = useState(voiceId);
  if (syncedVoiceId !== voiceId) {
    setSyncedVoiceId(voiceId);
    setCustomText(voiceId);
  }

  function patch(next: Partial<VoiceSettings>) {
    onChange({ ...(value || emptyVoiceSettings()), ...next });
  }

  function switchToSingle() {
    stop();
    setWantMix(false);
    patch({ mix: null, templateId: null });
  }

  function switchToMix() {
    stop();
    setWantMix(true);
    if (hasMix(value)) {
      patch({ templateId: null });
      return;
    }
    // 目录到了就直接把第一味原料放进去（value 一直是服务端认的形状）；没到就等用户在混音器里点「添加音色」
    const first = mixable[0];
    patch({ voiceId: "", templateId: null, mix: first ? [{ voiceId: first.id, weight: 1 }] : null });
  }

  function handleTemplatePicked(template: VoiceTemplate) {
    stop();
    setWantMix(false);
    setUseCustom(false);
    onChange(templateVoiceSnapshot(template));
    setPickerOpen(false);
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

  function handlePreview() {
    if (!value) return;
    const text = (previewText || "").trim() || defaultSentence;
    toggle(() => synthesizeSpeech(buildTtsRequest({ text, settings: value, instruct: value.instruct })));
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
          onClick={() => {
            setWantMix(false);
            onChange(emptyVoiceSettings());
          }}
          className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/20"
        >
          {t("voiceFields.enable")}
        </button>
      </div>
    );
  }

  const tabs: { key: Mode; label: string; onClick: () => void }[] = [
    { key: "single", label: t("voiceFields.modeSingle"), onClick: switchToSingle },
    { key: "mix", label: t("voiceFields.modeMix"), onClick: switchToMix },
    { key: "template", label: t("voiceFields.modeTemplate"), onClick: () => setPickerOpen(true) },
  ];

  return (
    <div className="space-y-4">
      {/* 模式切换：单音色 / 混音 / 声音市场模板（第三个是按钮：开选择器） */}
      <div className="flex gap-1 rounded-xl border border-gray-800 bg-gray-950/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            aria-pressed={mode === tab.key}
            className={`flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${
              mode === tab.key ? "bg-gray-800 font-semibold text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 单音色：目录下拉 + 自定义 ID */}
      {mode === "single" && (
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
      )}

      {/* 混音：1～3 味 1.0 原料 + 权重；试听在混音器里（带上下面的语速 / 音调） */}
      {mode === "mix" && (
        <VoiceMixer
          value={value.mix ?? []}
          onChange={(mix) => patch({ voiceId: "", templateId: null, mix })}
          preview={{ rate: value.rate, pitch: value.pitch }}
          previewText={previewText}
        />
      )}

      {/* 声音市场模板：只读展示快照 + 来源 chip；换一个 → 选择器 */}
      {mode === "template" && (
        <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-700/60 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-200">
              {t("voiceFields.templateChip", { name: templateLoading ? "…" : (templateName ?? t("voiceFields.templateGone")) })}
            </span>
            {templateName && templateId ? (
              <Link to={`/voices/market/${templateId}`} className="text-xs text-cyan-300 hover:underline">
                {t("voiceFields.templateView")} →
              </Link>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-cyan-100/90">{formatMixRecipe(value.mix ?? [], nameOf) || t("voiceMarket.recipeEmpty")}</p>
          <p className="mt-1 text-xs text-gray-500">
            {t("voiceSummary.rate")} {value.rate == null ? follow : formatRate(value.rate)} · {t("voiceSummary.pitch")}{" "}
            {value.pitch == null ? follow : formatPitch(value.pitch)}
          </p>
          <p className="mt-2 text-xs text-gray-500">{t("voiceFields.templateHint")}</p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="mt-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/20"
          >
            {t("voiceFields.changeTemplate")}
          </button>
        </div>
      )}

      {mode !== "template" && (
        <>
          <RateSliderRow value={value.rate} onChange={(rate) => patch({ rate })} />
          <PitchSliderRow value={value.pitch} onChange={(pitch) => patch({ pitch })} />

          {/* 语调指令：混音时禁用（1.0 音色不认） */}
          <label className="block text-sm text-gray-300">
            {t("voiceFields.instructLabel")}
            <textarea
              value={value.instruct}
              onChange={(e) => patch({ instruct: e.target.value.slice(0, INSTRUCT_MAX) })}
              maxLength={INSTRUCT_MAX}
              rows={2}
              disabled={mode === "mix"}
              placeholder={t("voiceFields.instructPlaceholder")}
              className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="mt-0.5 flex items-center justify-between text-xs text-gray-500">
              <span className={mode === "mix" ? "text-amber-300/80" : ""}>
                {mode === "mix" ? t("voiceFields.instructMixHint") : t("voiceFields.instructHint")}
              </span>
              <span>
                {value.instruct.length}/{INSTRUCT_MAX}
              </span>
            </span>
          </label>
        </>
      )}

      {/* 情感模式：只有 2.0 单音色才有 */}
      {mode === "single" && (
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
      )}

      <div className="flex flex-wrap items-center gap-2">
        {mode !== "mix" && (
          <button
            type="button"
            disabled={customInvalid}
            onClick={handlePreview}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-50"
          >
            {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            {busy ? t("voiceFields.previewBusy") : playing ? t("voiceFields.previewStop") : t("voiceFields.preview")}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            stop();
            setUseCustom(false);
            setWantMix(false);
            onChange(null);
          }}
          className="rounded-xl border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
        >
          {t("voiceFields.follow")}
        </button>
      </div>

      <VoiceTemplatePickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selectedTemplateId={templateId}
        onSelect={handleTemplatePicked}
        previewText={previewText}
      />
    </div>
  );
}
