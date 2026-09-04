/**
 * @file CompanionVoiceModal.tsx - 首页对话框「声音」面板：看当前生效的声音、从模板市场一键设为自己的声音、或自定义
 * @category Component
 * @i18n_module companion
 *
 * 音频三层（用户覆盖 > 人格自带 > 模型推荐 > 默认）里「用户覆盖」这一层的入口（docs/COMPANION.md「声音市场」）。
 * - 顶部：当前生效的声音摘要（config.voiceSettings：混音就列配方，单音色就列名字；来自模板还带模板名）+ 来源
 * - tab「模板市场」：VoiceTemplateBrowser，主动作「设为我的声音」= PUT settings { voice: { templateId } } + POST /use 计数
 * - tab「自定义」：VoiceSettingsFields 绑定 settings.settings.voice —— 是用户覆盖那一层，不是合并结果
 *   （绑合并结果的话，人格自带的音色会被当成用户改过的存回去，人格一换就跟不动了）。
 *   「保存」= PUT settings { voice }；「恢复跟随人格 / 模型」= PUT settings { voice: null }
 * ★ 只在登录后打开（CompanionChat 游客点按钮先弹登录框），所以 useCompanionSettings(open) 不会 401。
 * ★ 保存 / 设为成功后 updateCompanionSettings 会广播 ideahub:companion-updated，CompanionChat 重拉 config，顶部摘要跟着变。
 * ★ 草稿从 settings 灌入用「渲染期对齐」（seededFrom）：settings 每次重拉都是新对象，用 effect 同步会多一轮级联渲染。
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AudioLines, X } from "lucide-react";
import toast from "react-hot-toast";
import {
  recordVoiceTemplateUse,
  updateCompanionSettings,
  type CompanionConfig,
  type CompanionSettings,
  type VoiceSettings,
  type VoiceTemplate,
} from "../api";
import { useTtsVoices, voiceDisplayName } from "../companion/ttsVoices";
import { formatMixRecipe, hasMix } from "../companion/voiceMix";
import { usePreviewSentence, useVoiceTemplateName, voiceErrorMessage } from "../companion/voiceTemplates";
import { useCompanionSettings } from "../hooks/useCompanionSettings";
import VoiceSettingsFields from "./VoiceSettingsFields";
import VoiceTemplateBrowser from "./VoiceTemplateBrowser";

type Tab = "market" | "custom";

type Props = {
  open: boolean;
  onClose: () => void;
  config: CompanionConfig | null;
};

export default function CompanionVoiceModal({ open, onClose, config }: Props) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("market");
  const [draft, setDraft] = useState<VoiceSettings | null>(null);
  const [seededFrom, setSeededFrom] = useState<CompanionSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState("");

  const { settings, setSettings } = useCompanionSettings(open);
  const { voices, mixable } = useTtsVoices();
  const previewText = usePreviewSentence(config?.name);
  const effective = config?.voiceSettings;
  const { name: templateName } = useVoiceTemplateName(effective?.templateId);

  if (settings && settings !== seededFrom) {
    setSeededFrom(settings);
    setDraft(settings.settings.voice);
  }

  if (!open) return null;

  const nameOf = (id: string) => voiceDisplayName(id, voices, mixable);
  const currentText = hasMix(effective)
    ? formatMixRecipe(effective.mix, nameOf)
    : voiceDisplayName(effective?.voiceId || config?.voice || "", voices) || t("companion.voiceDefaultName");
  const source = settings?.settings.voice ? "user" : config?.persona?.voice ? "persona" : config?.model?.voice ? "model" : "default";
  const activeTemplateId = settings?.settings.voice?.templateId || "";

  async function handleApply(tpl: VoiceTemplate) {
    try {
      setApplyingId(tpl._id);
      const res = await updateCompanionSettings({ voice: { templateId: tpl._id } });
      setSettings(res);
      toast.success(t("companion.voiceApplied", { name: tpl.name }));
      recordVoiceTemplateUse(tpl._id).catch((err) => console.warn("[companion] voice template use count failed", err));
    } catch (e) {
      toast.error(voiceErrorMessage(e));
    } finally {
      setApplyingId("");
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      const res = await updateCompanionSettings({ voice: draft });
      setSettings(res);
      toast.success(draft ? t("companion.voiceSaved") : t("companion.voiceFollowed"));
    } catch (e) {
      toast.error(voiceErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleFollow() {
    try {
      setSaving(true);
      const res = await updateCompanionSettings({ voice: null });
      setSettings(res);
      setDraft(null);
      toast.success(t("companion.voiceFollowed"));
    } catch (e) {
      toast.error(voiceErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("companion.voiceTitle")}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-gray-700 bg-gray-900 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-white">
            <AudioLines className="h-4 w-4 text-cyan-300" /> {t("companion.voiceTitle")}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-white" aria-label={t("companion.close")}>
            <X size={18} />
          </button>
        </div>

        {/* 当前生效的声音（合并结果）+ 来源 */}
        <div className="mt-2 rounded-xl border border-cyan-900/60 bg-cyan-950/20 px-3 py-2 text-xs">
          <span className="text-gray-400">{t("companion.voiceCurrent")}</span>
          <span className="ml-1 text-cyan-100">{currentText}</span>
          {effective?.templateId ? (
            <span className="ml-1 text-gray-500">· {t("companion.voiceFromTemplate", { name: templateName ?? t("voiceFields.templateGone") })}</span>
          ) : null}
          <span className="ml-1 text-gray-500">· {t(`companion.voiceSource.${source}`)}</span>
        </div>

        <div className="mt-2 flex gap-1 rounded-xl border border-gray-800 bg-gray-950/50 p-1">
          {(["market", "custom"] as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                tab === key ? "bg-gray-800 font-semibold text-white" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {t(key === "market" ? "companion.voiceTabMarket" : "companion.voiceTabCustom")}
            </button>
          ))}
        </div>

        {tab === "market" ? (
          <div className="mt-3 flex min-h-0 flex-1 flex-col">
            <VoiceTemplateBrowser
              activeTemplateId={activeTemplateId}
              pickLabel={t("companion.voiceApply")}
              pickingId={applyingId}
              previewText={previewText}
              onPick={(tpl) => void handleApply(tpl)}
            />
          </div>
        ) : (
          <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            <p className="text-xs text-gray-500">{t("companion.voiceCustomHint")}</p>
            <VoiceSettingsFields value={draft} onChange={setDraft} previewText={previewText} />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || !settings}
                onClick={() => void handleSave()}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
              >
                {saving ? t("companion.voiceSaving") : t("companion.voiceSave")}
              </button>
              <button
                type="button"
                disabled={saving || !settings?.settings.voice}
                onClick={() => void handleFollow()}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 disabled:opacity-50"
              >
                {t("companion.voiceFollow")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
