/**
 * @file VoiceTemplateCard.tsx - 声音市场模板卡片：名字 / 作者 / 配方摘要 / 语速音调 / ⬆ 使用数 ❤ 点赞 / 试听 + 主动作
 * @category Component
 * @i18n_module voiceMarket
 *
 * 三处共用同一张卡：市场列表（主动作「设为我的声音」+ 点赞 + 名字跳详情）、首页「声音」面板的「模板市场」tab、
 * 人格 / 模型编辑器的模板选择器（主动作「选用」；名字不跳页 —— 从弹窗跳走会丢掉正在填的表单）。
 * 主动作的语义由调用方决定，卡片只管展示、试听、把点击交出去。
 * ★ 卡片不能整体做成 <Link>：里面有三个按钮，a 里套 button 是无效 HTML（模型市场那张卡的教训）。
 * ★ 试听直接用模板自带的 voice 快照（mix + rate + pitch）走 buildTtsRequest，和用户设为自己声音后听到的一致。
 */
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Heart, Play, Square } from "lucide-react";
import { synthesizeSpeech, type VoiceTemplate } from "../api";
import { formatPitch, formatRate } from "../companion/ttsVoices";
import { buildTtsRequest, formatMixRecipe } from "../companion/voiceMix";
import { templateAuthorName, templateVoiceSnapshot } from "../companion/voiceTemplates";
import { useAudioPreview } from "../hooks/useAudioPreview";

type Props = {
  template: VoiceTemplate;
  /** 「使用中」/「已选用」徽标 + 主动作禁用 */
  active: boolean;
  activeLabel?: string;
  nameOf: (voiceId: string) => string;
  previewText: string;
  primaryLabel: string;
  onPrimary: (template: VoiceTemplate) => void;
  primaryBusy?: boolean;
  /** 不传 = 不显示点赞按钮（弹窗里不做点赞，去市场页做） */
  onLike?: (template: VoiceTemplate) => void;
  /** 名字是否链接到详情页 */
  linkToDetail?: boolean;
  compact?: boolean;
};

export default function VoiceTemplateCard({
  template: tpl,
  active,
  activeLabel,
  nameOf,
  previewText,
  primaryLabel,
  onPrimary,
  primaryBusy = false,
  onLike,
  linkToDetail = true,
  compact = false,
}: Props) {
  const { t } = useTranslation();
  const { busy, playing, toggle } = useAudioPreview();
  const recipe = formatMixRecipe(tpl.recipe, nameOf);
  const follow = t("voiceSummary.follow");
  const activeText = activeLabel ?? t("voiceMarket.inUse");
  const detailPath = `/voices/market/${tpl._id}`;

  return (
    <div className={`flex flex-col rounded-2xl border bg-gray-900 ${compact ? "p-3" : "p-4"} ${active ? "border-cyan-500/60" : "border-gray-800"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {linkToDetail ? (
            <Link to={detailPath} className="line-clamp-1 font-semibold text-white hover:text-cyan-200">
              {tpl.name}
            </Link>
          ) : (
            <span className="line-clamp-1 font-semibold text-white">{tpl.name}</span>
          )}
          <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{t("voiceMarket.authorLabel", { name: templateAuthorName(tpl.author) })}</p>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {active && (
            <span className="rounded-full border border-cyan-500/60 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">{activeText}</span>
          )}
          {!tpl.shared && (
            <span className="rounded-full border border-gray-600 px-2 py-0.5 text-[11px] text-gray-400">{t("voiceMarket.privateBadge")}</span>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm text-cyan-100/90">{recipe || t("voiceMarket.recipeEmpty")}</p>
      {tpl.description && !compact ? <p className="mt-1 line-clamp-2 text-xs text-gray-400">{tpl.description}</p> : null}
      <p className="mt-1 text-xs text-gray-500">
        {t("voiceSummary.rate")} {tpl.rate == null ? follow : formatRate(tpl.rate)} · {t("voiceSummary.pitch")}{" "}
        {tpl.pitch == null ? follow : formatPitch(tpl.pitch)}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-400">
        <span className="mr-auto">
          ⬆ {tpl.stats?.useCount || 0} · ❤️ {tpl.stats?.likeCount || 0}
        </span>
        <button
          type="button"
          onClick={() => toggle(() => synthesizeSpeech(buildTtsRequest({ text: previewText, settings: templateVoiceSnapshot(tpl) })))}
          className="inline-flex items-center gap-1 rounded-lg border border-cyan-700/60 px-2.5 py-1.5 text-cyan-100 hover:bg-cyan-500/10"
        >
          {playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {busy ? t("voiceFields.previewBusy") : playing ? t("voiceFields.previewStop") : t("voiceFields.preview")}
        </button>
        <button
          type="button"
          disabled={active || primaryBusy}
          onClick={() => onPrimary(tpl)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            active ? "cursor-default border border-cyan-500/60 text-cyan-200" : "bg-white text-black hover:bg-gray-200 disabled:opacity-60"
          }`}
        >
          {active ? activeText : primaryBusy ? t("voiceMarket.applying") : primaryLabel}
        </button>
        {onLike && (
          <button
            type="button"
            onClick={() => onLike(tpl)}
            title={tpl.liked ? t("voiceMarket.liked") : t("voiceMarket.like")}
            aria-pressed={tpl.liked}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 ${
              tpl.liked ? "border-rose-500 text-rose-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
            }`}
          >
            <Heart className={`h-3.5 w-3.5 ${tpl.liked ? "fill-rose-400" : ""}`} />
            {tpl.stats?.likeCount || 0}
          </button>
        )}
      </div>
    </div>
  );
}
