/**
 * @file Live2dModelEditorPage.tsx - 模型市场 · 上传 / 编辑 Live2D 模型
 * @category Page
 * @route /live2d/market/new, /live2d/market/:id/edit
 * @i18n_module live2dMarket
 *
 * 职责（三段固定顺序，和详情页的三个板块一一对应）:
 * - ① Live2D 模型：zip（≤25MB，新建必填；编辑不能换包）、名称（必填）、简介、封面图（复用人格封面的图片上传）、标签、公开分享
 * - ② 人格：PersonaPickerModal 选一个推荐人格 / 不绑定
 * - ③ 音频：VoiceSettingsFields 推荐一把嗓子 / 不设置
 * - 新建 createLive2dModel（multipart）→ 跳详情；编辑 updateLive2dModel（JSON）→ 跳详情
 * - 服务端解包失败的英文 message 用 companion/live2dUploadError.ts 翻成中文提示；不认识的原样显示
 *
 * ★ 25MB 在前端先拦：超限的包传到服务端也是 413，白等一次上传。
 * ★ 编辑态只有作者能进：非作者不跳转（跳转会和 ProtectedRoute 的登录跳转叠在一起），直接渲染一句提示 + 返回链接。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router";
import toast from "react-hot-toast";
import { Upload } from "lucide-react";
import {
  apiUploadImage,
  createLive2dModel,
  getLive2dModel,
  updateLive2dModel,
  type PersonaSummary,
  type VoiceSettings,
} from "../api";
import PersonaPickerModal from "../components/PersonaPickerModal";
import PersonaCover from "../components/PersonaCover";
import VoiceSettingsFields from "../components/VoiceSettingsFields";
import { live2dUploadErrorKey } from "../companion/live2dUploadError";
import { formatBytes } from "../utils/formatBytes";
import { humanizeError } from "../utils/humanizeError";

/** 与服务端上传上限一致（multer limits.fileSize） */
const MAX_BUNDLE_BYTES = 25 * 1024 * 1024;
const MAX_TAGS = 12;

/** 表单里只需要展示用的几个字段（来自 PersonaPickerModal 的 Persona 或编辑态的 PersonaSummary） */
type PickedPersona = Pick<PersonaSummary, "_id" | "name" | "coverEmoji" | "coverImageUrl" | "styleDescriptor" | "description">;

/** 与人格编辑器同款归一（小写、去 #）：服务端 toTags 也会再做一遍，这里只是让 chips 立即去重不闪 */
function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/^#+/, "");
}

export default function Live2dModelEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(isEdit);
  const [denied, setDenied] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bundle, setBundle] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [coverUploading, setCoverUploading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [shared, setShared] = useState(true);
  const [persona, setPersona] = useState<PickedPersona | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [voice, setVoice] = useState<VoiceSettings | null>(null);

  useEffect(() => {
    if (!isEdit || !id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getLive2dModel(id);
        if (!mounted) return;
        const m = res.model;
        if (!m.isOwner) {
          setDenied(true);
          return;
        }
        setName(m.name || "");
        setDescription(m.description || "");
        setCoverImageUrl(m.coverImageUrl || "");
        setTags((m.tags || []).slice(0, MAX_TAGS));
        setShared(!!m.shared);
        setPersona(m.persona);
        setVoice(m.voice ?? null);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isEdit, id]);

  function handleBundleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_BUNDLE_BYTES) {
      toast.error(t("live2dMarket.editor.bundleTooLarge"));
      return;
    }
    setBundle(file);
  }

  /** 封面图：与人格封面同一条上传链路（Cloudinary 拿 URL，入库的是 URL 字符串） */
  async function handleCoverImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setCoverUploading(true);
      const res = await apiUploadImage(file, "idea");
      setCoverImageUrl(res.imageUrl);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setCoverUploading(false);
    }
  }

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setTags((prev) => {
      if (prev.includes(tag)) return prev;
      if (prev.length >= MAX_TAGS) {
        toast.error(t("live2dMarket.editor.tagsLimit"));
        return prev;
      }
      return [...prev, tag];
    });
  }

  function commitTagInput() {
    tagInput
      .split(/[#,，,\s]+/)
      .map(normalizeTag)
      .filter(Boolean)
      .forEach(addTag);
    setTagInput("");
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("live2dMarket.editor.nameRequired"));
      return;
    }
    const common = {
      name: name.trim(),
      description: description.trim(),
      coverImageUrl,
      tags,
      shared,
      voice,
    };
    try {
      setSaving(true);
      let modelId: string;
      if (isEdit && id) {
        const res = await updateLive2dModel(id, { ...common, personaId: persona?._id ?? null });
        modelId = res.model._id;
        toast.success(t("live2dMarket.editor.saved"));
      } else {
        if (!bundle) {
          toast.error(t("live2dMarket.editor.bundleRequired"));
          return;
        }
        const res = await createLive2dModel({ ...common, bundle, personaId: persona?._id || "" });
        modelId = res.model._id;
        toast.success(t("live2dMarket.editor.created"));
      }
      navigate(`/live2d/market/${modelId}`);
    } catch (e) {
      const key = live2dUploadErrorKey((e as { message?: unknown } | null)?.message);
      toast.error(key ? t(key) : humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="mx-auto max-w-3xl p-4 pb-20 text-gray-400">{t("live2dMarket.editor.loading")}</div>;
  }

  if (denied) {
    return (
      <div className="mx-auto max-w-3xl p-4 pb-20">
        <p className="text-gray-400">{t("live2dMarket.editor.notOwner")}</p>
        <Link to={`/live2d/market/${id}`} className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
          ← {t("live2dMarket.editor.backToDetail")}
        </Link>
      </div>
    );
  }

  const submitLabel = saving
    ? isEdit
      ? t("live2dMarket.editor.saving")
      : t("live2dMarket.editor.uploading")
    : isEdit
      ? t("live2dMarket.editor.submitEdit")
      : t("live2dMarket.editor.submitCreate");

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <Link to={isEdit && id ? `/live2d/market/${id}` : "/live2d/market"} className="text-sm text-gray-400 hover:text-white">
        ← {isEdit ? t("live2dMarket.editor.backToDetail") : t("live2dMarket.editor.backToMarket")}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? t("live2dMarket.editor.editTitle") : t("live2dMarket.editor.newTitle")}</h1>
          <p className="mt-1 text-sm text-gray-400">{t("live2dMarket.editor.pageDescription")}</p>
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

      {/* ===== ① Live2D 模型 ===== */}
      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("live2dMarket.editor.bundleSection")}</h2>

        {isEdit ? (
          <p className="text-xs text-gray-500">{t("live2dMarket.editor.bundleKeep")}</p>
        ) : (
          <div>
            <label className="block text-sm text-gray-300">{t("live2dMarket.editor.bundleLabel")}</label>
            <p className="mt-0.5 text-xs text-gray-500">{t("live2dMarket.editor.bundleHint")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20">
                <Upload className="h-4 w-4" /> {t("live2dMarket.editor.bundleChoose")}
                <input type="file" accept=".zip,application/zip" className="hidden" onChange={handleBundleChange} disabled={saving} />
              </label>
              {bundle && (
                <span className="text-xs text-gray-300">
                  {t("live2dMarket.editor.bundleChosen", { name: bundle.name, size: formatBytes(bundle.size) })}
                </span>
              )}
            </div>
          </div>
        )}

        <label className="block text-sm text-gray-300">
          {t("live2dMarket.editor.nameLabel")}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={t("live2dMarket.editor.namePlaceholder")}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <label className="block text-sm text-gray-300">
          {t("live2dMarket.editor.descriptionLabel")}
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder={t("live2dMarket.editor.descriptionPlaceholder")}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <div>
          <label className="block text-sm text-gray-300">{t("live2dMarket.editor.coverLabel")}</label>
          <div className="mt-1 flex items-center gap-3">
            {coverImageUrl ? (
              <div className="relative">
                <img src={coverImageUrl} alt="" className="h-16 w-16 rounded-xl border border-gray-800 object-cover" />
                <button
                  type="button"
                  onClick={() => setCoverImageUrl("")}
                  title={t("live2dMarket.editor.coverRemove")}
                  className="absolute -right-2 -top-2 rounded-full border border-gray-700 bg-gray-900 px-1.5 text-xs text-gray-300 hover:text-white"
                >
                  ✕
                </button>
              </div>
            ) : (
              <label className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-xl border border-dashed border-gray-700 text-lg text-gray-500 hover:border-gray-500 hover:text-gray-300">
                {coverUploading ? "…" : "🖼"}
                <input type="file" accept="image/*" className="hidden" onChange={handleCoverImageChange} disabled={coverUploading} />
              </label>
            )}
            <span className="text-xs text-gray-500">{t("live2dMarket.editor.coverHint")}</span>
          </div>
        </div>

        <div className="block text-sm text-gray-300">
          {t("live2dMarket.editor.tagsLabel")}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span key={tag} className="flex items-center gap-1 rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2 py-0.5 text-xs text-cyan-200">
                  #{tag}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== tag))}
                    title={t("live2dMarket.editor.removeTag")}
                    className="text-cyan-300/60 hover:text-cyan-100"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) {
                e.preventDefault();
                commitTagInput();
              }
            }}
            onBlur={commitTagInput}
            placeholder={t("live2dMarket.editor.tagsPlaceholder")}
            className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="accent-cyan-400" />
          {t("live2dMarket.editor.sharedLabel")}
        </label>
      </section>

      {/* ===== ② 人格 ===== */}
      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("live2dMarket.editor.personaSection")}</h2>
        <p className="text-xs text-gray-500">{t("live2dMarket.editor.personaHint")}</p>

        {persona ? (
          <div className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
            <PersonaCover emoji={persona.coverEmoji} imageUrl={persona.coverImageUrl} sizeClass="h-10 w-10" emojiClass="text-3xl" alt={persona.name} />
            <div className="min-w-0 flex-1">
              <Link to={`/arena/persona/${persona._id}`} className="truncate text-sm font-semibold text-white hover:text-cyan-200">
                {persona.name}
              </Link>
              {persona.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{persona.description}</p>}
              {persona.styleDescriptor && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{persona.styleDescriptor}</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500">{t("live2dMarket.editor.personaNone")}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-3 py-1.5 text-sm text-cyan-100 hover:bg-cyan-500/20"
          >
            {persona ? t("live2dMarket.editor.changePersona") : t("live2dMarket.editor.pickPersona")}
          </button>
          {persona && (
            <button
              type="button"
              onClick={() => setPersona(null)}
              className="rounded-xl border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800"
            >
              {t("live2dMarket.editor.unbindPersona")}
            </button>
          )}
        </div>
      </section>

      {/* ===== ③ 音频 ===== */}
      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("live2dMarket.editor.voiceSection")}</h2>
        <p className="text-xs text-gray-500">{t("live2dMarket.editor.voiceHint")}</p>
        <VoiceSettingsFields value={voice} onChange={setVoice} />
      </section>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {submitLabel}
        </button>
      </div>

      <PersonaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(p) => {
          setPersona({
            _id: p._id,
            name: p.name,
            coverEmoji: p.coverEmoji,
            coverImageUrl: p.coverImageUrl || "",
            styleDescriptor: p.styleDescriptor,
            description: p.description,
          });
          setPickerOpen(false);
        }}
      />
    </div>
  );
}
