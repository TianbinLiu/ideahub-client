/**
 * @file VoiceTemplateDetailPage.tsx - 声音市场 · 模板详情
 * @category Page
 * @route /voices/market/:id
 * @i18n_module voiceMarket
 *
 * 职责:
 * - 头部：名字 / 使用中·未公开 徽标 / 作者 / 简介 / ⬆ 使用数 ❤ 点赞
 * - 操作：试听 / 设为我的声音（PUT settings { voice: { templateId } } + POST /use）/ 点赞；作者：编辑 / 删除（confirm）
 * - 配方表：每味音色的名字（id）/ 归一后权重 / 百分比；参数：语速 / 音调（+ 语调指令，混音不生效，有值才显示）
 * - 私有且非作者 403、不存在 404 → 「模板不存在或未公开」
 *
 * ★ 删除自己正在用的模板：用户的声音不变（配方是快照），只是各处不再显示「使用中」；服务端不动设置，这里也不用广播事件。
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { AudioLines, Heart, Pencil, Play, Square, Trash2 } from "lucide-react";
import {
  deleteVoiceTemplate,
  getVoiceTemplate,
  recordVoiceTemplateUse,
  synthesizeSpeech,
  toggleVoiceTemplateLike,
  updateCompanionSettings,
  type VoiceTemplate,
} from "../api";
import { useAuth } from "../authContext";
import { formatPitch, formatRate, useTtsVoices, voiceDisplayName } from "../companion/ttsVoices";
import { buildTtsRequest, mixPercentages, normalizeMixWeights } from "../companion/voiceMix";
import { templateAuthorName, templateVoiceSnapshot, usePreviewSentence, voiceErrorMessage } from "../companion/voiceTemplates";
import { useAudioPreview } from "../hooks/useAudioPreview";
import { useCompanionSettings } from "../hooks/useCompanionSettings";

export default function VoiceTemplateDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<VoiceTemplate | null>(null);
  const [applying, setApplying] = useState(false);
  const { settings, setSettings } = useCompanionSettings(Boolean(user));
  const activeTemplateId = settings?.settings.voice?.templateId || "";
  const { voices, mixable } = useTtsVoices();
  const { busy, playing, toggle } = useAudioPreview();
  const previewText = usePreviewSentence();

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getVoiceTemplate(id);
        if (mounted) setTemplate(res.template);
      } catch (e) {
        // 403 / 404 都落到「不存在或未公开」那一屏，不弹 toast 吓人；别的错误照常提示
        const status = (e as { status?: number } | null)?.status;
        if (mounted && status !== 403 && status !== 404) toast.error(voiceErrorMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  function requireLogin() {
    toast.error(t("voiceMarket.loginRequired"));
    navigate(`/login?next=/voices/market/${id}`);
  }

  async function handleUse() {
    if (!template) return;
    if (!user) return requireLogin();
    try {
      setApplying(true);
      const res = await updateCompanionSettings({ voice: { templateId: template._id } });
      setSettings(res);
      toast.success(t("voiceMarket.applied", { name: template.name }));
      recordVoiceTemplateUse(template._id)
        .then((r) => setTemplate((prev) => (prev ? { ...prev, stats: { ...prev.stats, useCount: r.useCount } } : prev)))
        .catch((err) => console.warn("[voice-market] use count failed", err));
    } catch (e) {
      toast.error(voiceErrorMessage(e));
    } finally {
      setApplying(false);
    }
  }

  async function handleLike() {
    if (!template) return;
    if (!user) return requireLogin();
    const prev = template;
    const nextLiked = !template.liked;
    setTemplate({
      ...template,
      liked: nextLiked,
      stats: { ...template.stats, likeCount: Math.max(0, template.stats.likeCount + (nextLiked ? 1 : -1)) },
    });
    try {
      const res = await toggleVoiceTemplateLike(template._id);
      setTemplate((cur) => (cur ? { ...cur, liked: res.liked, stats: { ...cur.stats, likeCount: res.likeCount } } : cur));
    } catch (e) {
      setTemplate(prev);
      toast.error(voiceErrorMessage(e));
    }
  }

  async function handleDelete() {
    if (!template) return;
    if (typeof window !== "undefined" && !window.confirm(t("voiceMarket.detail.deleteConfirm"))) return;
    try {
      await deleteVoiceTemplate(template._id);
      toast.success(t("voiceMarket.detail.deleted"));
      navigate("/voices/market");
    } catch (e) {
      toast.error(voiceErrorMessage(e));
    }
  }

  if (loading) return <div className="mx-auto max-w-4xl p-4 text-gray-300">{t("voiceMarket.detail.loading")}</div>;
  if (!template)
    return (
      <div className="mx-auto max-w-4xl p-4">
        <p className="text-gray-400">{t("voiceMarket.detail.notFound")}</p>
        <Link to="/voices/market" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
          ← {t("voiceMarket.detail.backToMarket")}
        </Link>
      </div>
    );

  const inUse = Boolean(activeTemplateId) && template._id === activeTemplateId;
  const follow = t("voiceSummary.follow");
  const recipe = normalizeMixWeights(template.recipe);
  const percentages = mixPercentages(recipe);

  return (
    <div className="mx-auto max-w-4xl p-4 pb-20">
      <Link to="/voices/market" className="text-sm text-gray-400 hover:text-white">
        ← {t("voiceMarket.detail.backToMarket")}
      </Link>

      <div className="mt-3 space-y-4">
        {/* ===== 头部信息卡 ===== */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <AudioLines className="h-6 w-6 text-cyan-300" />
            <h1 className="text-2xl font-bold text-white">{template.name}</h1>
            {inUse && (
              <span className="rounded-full border border-cyan-500/60 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-200">{t("voiceMarket.inUse")}</span>
            )}
            {!template.shared && (
              <span className="rounded-full border border-gray-600 px-2.5 py-0.5 text-xs text-gray-400">{t("voiceMarket.privateBadge")}</span>
            )}
          </div>
          <p className="mt-1 text-sm text-gray-400">{t("voiceMarket.authorLabel", { name: templateAuthorName(template.author) })}</p>

          {template.description ? (
            <p className="mt-3 whitespace-pre-wrap text-gray-300">{template.description}</p>
          ) : (
            <p className="mt-3 text-gray-500">{t("voiceMarket.detail.noDescription")}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <span>⬆ {template.stats.useCount}</span>
            <span>❤️ {template.stats.likeCount}</span>
          </div>

          {/* ===== 操作按钮 ===== */}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => toggle(() => synthesizeSpeech(buildTtsRequest({ text: previewText, settings: templateVoiceSnapshot(template) })))}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20"
            >
              {playing ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {busy ? t("voiceFields.previewBusy") : playing ? t("voiceFields.previewStop") : t("voiceFields.preview")}
            </button>
            <button
              type="button"
              disabled={inUse || applying}
              onClick={handleUse}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                inUse ? "cursor-default border border-cyan-500/60 text-cyan-200" : "bg-white text-black hover:bg-gray-200 disabled:opacity-60"
              }`}
            >
              {inUse ? t("voiceMarket.inUse") : applying ? t("voiceMarket.applying") : t("voiceMarket.use")}
            </button>
            <button
              type="button"
              onClick={handleLike}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                template.liked ? "border-rose-500 text-rose-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
              }`}
            >
              <Heart className={`h-4 w-4 ${template.liked ? "fill-rose-400" : ""}`} />
              {template.liked ? t("voiceMarket.liked") : t("voiceMarket.like")}
            </button>
            {template.isOwner && (
              <>
                <Link
                  to={`/voices/market/${template._id}/edit`}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-950/30"
                >
                  <Pencil className="h-4 w-4" /> {t("voiceMarket.detail.edit")}
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-800 px-4 py-2 text-sm text-rose-300 hover:bg-rose-950/30"
                >
                  <Trash2 className="h-4 w-4" /> {t("voiceMarket.detail.delete")}
                </button>
              </>
            )}
          </div>

          {!user && <p className="mt-3 text-xs text-gray-500">{t("voiceMarket.detail.loginHint")}</p>}
        </div>

        {/* ===== 配方 ===== */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">{t("voiceMarket.detail.recipeTitle")}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t("voiceMarket.mixRule")}</p>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="py-1 font-normal">{t("voiceMarket.detail.recipeVoice")}</th>
                <th className="py-1 text-right font-normal">{t("voiceMarket.detail.recipeWeight")}</th>
                <th className="py-1 text-right font-normal">{t("voiceMarket.detail.recipeShare")}</th>
              </tr>
            </thead>
            <tbody>
              {recipe.map((entry, index) => {
                const name = voiceDisplayName(entry.voiceId, voices, mixable);
                return (
                  <tr key={entry.voiceId} className="border-t border-gray-800">
                    <td className="py-2 text-gray-200">
                      {name}
                      {name !== entry.voiceId ? <span className="ml-1 text-xs text-gray-500">({entry.voiceId})</span> : null}
                    </td>
                    <td className="py-2 text-right text-gray-300">{entry.weight.toFixed(3)}</td>
                    <td className="py-2 text-right font-semibold text-cyan-200">{percentages[index]}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ===== 参数 ===== */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">{t("voiceMarket.detail.paramsTitle")}</h2>
          <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-gray-500">{t("voiceSummary.rate")}</dt>
            <dd className="text-gray-200">{template.rate == null ? follow : formatRate(template.rate)}</dd>
            <dt className="text-gray-500">{t("voiceSummary.pitch")}</dt>
            <dd className="text-gray-200">{template.pitch == null ? follow : formatPitch(template.pitch)}</dd>
            {template.instruct?.trim() ? (
              <>
                <dt className="text-gray-500">{t("voiceSummary.instruct")}</dt>
                <dd className="whitespace-pre-wrap break-words text-gray-200">
                  {template.instruct.trim()}
                  <span className="ml-1 text-xs text-gray-500">{t("voiceMarket.detail.instructIgnored")}</span>
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      </div>
    </div>
  );
}
