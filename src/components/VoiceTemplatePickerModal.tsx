/**
 * @file VoiceTemplatePickerModal.tsx - 声音市场模板选择器弹窗（音频表单「声音市场模板」模式用）
 * @category Component
 * @i18n_module voiceMarket
 *
 * 人格编辑器 / 模型编辑器 / 首页「声音」面板的自定义 tab 里点「声音市场模板」→ 这个弹窗 → 选一个模板 →
 * 调用方把模板的 voice 快照（mix + templateId + rate/pitch）写进表单。只做「选择」，
 * 设为数字人声音 / 点赞是市场页与首页面板的事。
 * ★ 选中后先把模板名灌进缓存（primeVoiceTemplateName）：表单随即显示「来自模板：xx」的 chip，不用再打一次接口。
 */
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { VoiceTemplate } from "../api";
import { primeVoiceTemplateName } from "../companion/voiceTemplates";
import VoiceTemplateBrowser from "./VoiceTemplateBrowser";

type Props = {
  open: boolean;
  onClose: () => void;
  /** 当前表单里已选用的模板（徽标「已选用」） */
  selectedTemplateId?: string | null;
  onSelect: (template: VoiceTemplate) => void;
  previewText?: string;
};

export default function VoiceTemplatePickerModal({ open, onClose, selectedTemplateId, onSelect, previewText }: Props) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("voiceMarket.pickerTitle")}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-gray-700 bg-gray-900 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">{t("voiceMarket.pickerTitle")}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-white" aria-label={t("companion.close")}>
            <X size={18} />
          </button>
        </div>
        <p className="mb-2 mt-1 text-xs text-gray-500">{t("voiceMarket.pickerIntro")}</p>
        <VoiceTemplateBrowser
          activeTemplateId={selectedTemplateId}
          activeLabel={t("voiceMarket.selected")}
          pickLabel={t("voiceMarket.pick")}
          previewText={previewText}
          onPick={(tpl) => {
            primeVoiceTemplateName(tpl);
            onSelect(tpl);
          }}
        />
      </div>
    </div>
  );
}
