/**
 * @file VoiceTemplateEditorPage.tsx - 声音市场 · 创建 / 编辑混音模板
 * @category Page
 * @route /voices/market/new, /voices/market/:id/edit
 * @i18n_module voiceMarket
 *
 * 职责:
 * - 表单：名称（≤60，必填）/ 简介（≤300）/ 公开分享；配方（VoiceMixer，1～3 味 1.0 音色）；语速 / 音调（null = 跟随）
 * - 试听在混音器里，带上当前的语速 / 音调
 * - 新建 createVoiceTemplate → 跳详情；编辑 updateVoiceTemplate → 跳详情
 * - 服务端 400 的中文人话（「混音只支持豆包 1.0 音色……」）原样展示（voiceErrorMessage）
 *
 * ★ 编辑态只有作者能进：非作者不跳转（会和 ProtectedRoute 的登录跳转叠在一起），直接渲染一句提示 + 返回链接。
 * ★ 提交前 cleanMix：没选音色的空行不发（服务端 400 的是 zod 通用文案，用户看不出是自己没填完），
 *   一味都没有就在前端拦下。
 * ★ 新建时目录一到就把第一味原料放进配方（渲染期 seeded 一次）：空表单要用户先点「添加音色」多一步，且不直观。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import toast from "react-hot-toast";
import { createVoiceTemplate, getVoiceTemplate, updateVoiceTemplate, type VoiceMixEntry } from "../api";
import { useTtsVoices } from "../companion/ttsVoices";
import { cleanMix } from "../companion/voiceMix";
import { voiceErrorMessage } from "../companion/voiceTemplates";
import VoiceMixer from "../components/VoiceMixer";
import { PitchSliderRow, RateSliderRow } from "../components/VoiceSliders";

const NAME_MAX = 60;
const DESCRIPTION_MAX = 300;

export default function VoiceTemplateEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;
  const { mixable, maxMixVoices } = useTtsVoices();

  const [loading, setLoading] = useState(isEdit);
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [recipe, setRecipe] = useState<VoiceMixEntry[]>([]);
  const [rate, setRate] = useState<number | null>(null);
  const [pitch, setPitch] = useState<number | null>(null);
  const [shared, setShared] = useState(true);
  const [seeded, setSeeded] = useState(isEdit);

  // 新建：目录到了就放第一味进去（渲染期一次，React 官方 "adjusting state while rendering" 写法）
  if (!seeded && mixable.length > 0) {
    setSeeded(true);
    setRecipe([{ voiceId: mixable[0].id, weight: 1 }]);
  }

  useEffect(() => {
    if (!isEdit || !id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getVoiceTemplate(id);
        if (!mounted) return;
        const tpl = res.template;
        if (!tpl.isOwner) {
          setDenied(true);
          return;
        }
        setName(tpl.name || "");
        setDescription(tpl.description || "");
        setRecipe(Array.isArray(tpl.recipe) ? tpl.recipe : []);
        setRate(tpl.rate ?? null);
        setPitch(tpl.pitch ?? null);
        setShared(!!tpl.shared);
      } catch (e) {
        if (mounted) toast.error(voiceErrorMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isEdit, id]);

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("voiceMarket.editor.nameRequired"));
      return;
    }
    const cleaned = cleanMix(recipe, maxMixVoices);
    if (cleaned.length === 0) {
      toast.error(t("voiceMarket.editor.recipeRequired"));
      return;
    }
    const body = { name: name.trim(), description: description.trim(), recipe: cleaned, rate, pitch, shared };
    try {
      setSaving(true);
      let templateId: string;
      if (isEdit && id) {
        const res = await updateVoiceTemplate(id, body);
        templateId = res.template._id;
        toast.success(t("voiceMarket.editor.saved"));
      } else {
        const res = await createVoiceTemplate(body);
        templateId = res.template._id;
        toast.success(t("voiceMarket.editor.created"));
      }
      navigate(`/voices/market/${templateId}`);
    } catch (e) {
      toast.error(voiceErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl p-4 pb-20 text-gray-400">{t("voiceMarket.editor.loading")}</div>;
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-3xl p-4 pb-20">
        <p className="text-gray-400">{t("voiceMarket.editor.notOwner")}</p>
        <Link to={`/voices/market/${id}`} className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
          ← {t("voiceMarket.editor.backToDetail")}
        </Link>
      </div>
    );
  }

  const submitLabel = saving
    ? t("voiceMarket.editor.saving")
    : isEdit
      ? t("voiceMarket.editor.submitEdit")
      : t("voiceMarket.editor.submitCreate");

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <Link to={isEdit && id ? `/voices/market/${id}` : "/voices/market"} className="text-sm text-gray-400 hover:text-white">
        ← {isEdit ? t("voiceMarket.editor.backToDetail") : t("voiceMarket.editor.backToMarket")}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? t("voiceMarket.editor.editTitle") : t("voiceMarket.editor.newTitle")}</h1>
          <p className="mt-1 text-sm text-gray-400">{t("voiceMarket.editor.pageDescription")}</p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {saving && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" aria-hidden="true" />}
          {submitLabel}
        </button>
      </div>

      {/* ===== ① 基本信息 ===== */}
      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("voiceMarket.editor.basicSection")}</h2>
        <label className="block text-sm text-gray-300">
          {t("voiceMarket.editor.nameLabel")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, NAME_MAX))}
            maxLength={NAME_MAX}
            placeholder={t("voiceMarket.editor.namePlaceholder")}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>
        <label className="block text-sm text-gray-300">
          {t("voiceMarket.editor.descriptionLabel")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
            rows={3}
            maxLength={DESCRIPTION_MAX}
            placeholder={t("voiceMarket.editor.descriptionPlaceholder")}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
          <span className="mt-0.5 block text-right text-xs text-gray-500">
            {description.length}/{DESCRIPTION_MAX}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="accent-cyan-400" />
          {t("voiceMarket.editor.sharedLabel")}
        </label>
      </section>

      {/* ===== ② 配方 ===== */}
      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("voiceMarket.editor.recipeSection")}</h2>
        <p className="text-xs text-gray-500">{t("voiceMarket.editor.recipeHint")}</p>
        <VoiceMixer value={recipe} onChange={setRecipe} preview={{ rate, pitch }} disabled={saving} />
      </section>

      {/* ===== ③ 语速 / 音调 ===== */}
      <section className="mt-4 space-y-4 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("voiceMarket.editor.paramsSection")}</h2>
        <p className="text-xs text-gray-500">{t("voiceMarket.editor.paramsHint")}</p>
        <RateSliderRow value={rate} onChange={setRate} />
        <PitchSliderRow value={pitch} onChange={setPitch} />
      </section>

      <div className="mt-4 flex justify-end">
        <button type="button" disabled={saving} onClick={handleSave} className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60">
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
