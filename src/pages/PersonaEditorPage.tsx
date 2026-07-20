/**
 * @file PersonaEditorPage.tsx - 人格下载 · 发布 / 编辑人格
 * @category Page
 * @route /arena/persona/new, /arena/persona/:id/edit
 * @i18n none（页面内容以中文为主）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 表单：name / description / coverEmoji(输入或预设按钮) / tags(逗号) / shared
 *   / style(summary、catchphrases 逗号分隔、stanceHint)
 * - “从我的发言风格面板导入”：getMyStyleProfile 预填 summary/catchphrases/stats（stats 直接带上）
 * - 编辑态 getPersona 预填 + updatePersona；否则 createPersona；成功跳详情
 * - 底部用 <StyleStandCard> 预览由当前表单组装的风格面板
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Download } from "lucide-react";
import {
  createPersona,
  getMyStyleProfile,
  getPersona,
  updatePersona,
  type PersonaStyle,
  type SpeakingProfile,
  type StyleStat,
} from "../api";
import StyleStandCard from "../components/StyleStandCard";
import { humanizeError } from "../utils/humanizeError";

const EMOJI_PRESETS = ["🎭", "🔥", "🧠", "😈", "🛡️", "💧", "🎯", "⚔️", "🌟", "🤡", "👑", "🐍"];

// 预设 tag：点选即加入。覆盖两类检索意图 —— 「这个人格演什么身份」（情景编辑器给
// 上司/HR 等角色挑人格时按身份搜）+「说话什么风格」。自定义 tag 走下方输入框，
// 上限 12 个与后端 toTags 的截断一致（后端还会统一小写去重）。
const PRESET_PERSONA_TAGS = [
  "职场", "上司", "hr", "同事", "面试官", "客服", "甲方", "长辈", "朋友",
  "杠精", "毒舌", "阴阳怪气", "暖心", "高冷", "幽默", "戏精",
];

/** 与后端 toTags 同款归一（小写去重），本地先做一遍让 chips 立即去重不闪 */
function normalizeTag(raw: string) {
  return raw.trim().toLowerCase().replace(/^#+/, "");
}

export default function PersonaEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("🎭");
  // tags 是 chips 数组（预设点选 + 自定义输入），不再是逗号分隔文本
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [shared, setShared] = useState(true);
  const [summary, setSummary] = useState("");
  const [catchphrasesText, setCatchphrasesText] = useState("");
  const [stanceHint, setStanceHint] = useState("");
  const [stats, setStats] = useState<StyleStat[]>([]);

  const parsedCatchphrases = useMemo(
    () => catchphrasesText.split(/[,，、\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12),
    [catchphrasesText]
  );

  useEffect(() => {
    if (!isEdit || !id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getPersona(id);
        if (!mounted) return;
        const p = res.persona;
        setName(p.name || "");
        setDescription(p.description || "");
        setCoverEmoji(p.coverEmoji || "🎭");
        setTags((p.tags || []).slice(0, 12));
        setShared(!!p.shared);
        setSummary(p.style?.summary || "");
        setCatchphrasesText((p.style?.catchphrases || []).join("，"));
        setStanceHint(p.style?.stanceHint || "");
        setStats(p.style?.stats || []);
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

  async function handleImport() {
    try {
      setImporting(true);
      const res = await getMyStyleProfile();
      const p = res.profile;
      if (!p) {
        toast.error(t("arena.personaEditor.noStyleProfile"));
        return;
      }
      setSummary(p.summary || "");
      setCatchphrasesText((p.catchphrases || []).join("，"));
      setStats(p.stats || []);
      toast.success(t("arena.personaEditor.importedFromStyleProfile"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setImporting(false);
    }
  }

  // ── tag chips：预设点选 / 自定义输入（回车、逗号、失焦提交），上限 12 ──

  function addTag(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setTags((prev) => {
      if (prev.includes(tag)) return prev;
      if (prev.length >= 12) {
        toast.error(t("arena.personaEditor.tagsLimit"));
        return prev;
      }
      return [...prev, tag];
    });
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((x) => x !== tag));
  }

  function togglePresetTag(raw: string) {
    const tag = normalizeTag(raw);
    if (tags.includes(tag)) removeTag(tag);
    else addTag(tag);
  }

  /** 自定义输入提交：支持一次粘贴多个（#、逗号、空格分隔） */
  function commitTagInput() {
    const parts = tagInput.split(/[#,，,\s]+/).map(normalizeTag).filter(Boolean);
    parts.forEach(addTag);
    setTagInput("");
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("arena.personaEditor.nameRequired"));
      return;
    }

    const style: PersonaStyle = {
      summary: summary.trim(),
      catchphrases: parsedCatchphrases,
      stats,
      stanceHint: stanceHint.trim() || undefined,
    };

    const body = {
      name: name.trim(),
      description: description.trim(),
      coverEmoji: coverEmoji.trim() || "🎭",
      tags,
      style,
      shared,
    };

    try {
      setSaving(true);
      const res = isEdit && id ? await updatePersona(id, body) : await createPersona(body);
      toast.success(t("arena.personaEditor.saved"));
      navigate(`/arena/persona/${res.persona._id}`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  const previewProfile: SpeakingProfile = {
    summary: summary.trim(),
    catchphrases: parsedCatchphrases,
    stats,
    sampleCount: 0,
    generatedAt: new Date().toISOString(),
  };

  if (loading) {
    return <div className="mx-auto max-w-3xl p-4 pb-20 text-gray-400">{t("arena.personaEditor.loading")}</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <Link
        to={isEdit && id ? `/arena/persona/${id}` : "/arena/persona"}
        className="text-sm text-gray-400 hover:text-white"
      >
        ← {isEdit ? t("arena.personaEditor.backToPersonaDetail") : t("arena.personaEditor.backToPersonaList")}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? t("arena.personaEditor.editPersona") : t("arena.personaEditor.publishPersona")}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.personaEditor.pageDescription")}
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {saving ? t("arena.personaEditor.saving") : isEdit ? t("arena.personaEditor.saveChanges") : t("arena.personaEditor.publishPersona")}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={importing}
          onClick={handleImport}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
        >
          <Download className="h-4 w-4" /> {importing ? t("arena.personaEditor.importing") : t("arena.personaEditor.importFromStyleProfile")}
        </button>
        <span className="text-xs text-gray-500">{t("arena.personaEditor.importHint")}</span>
      </div>

      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("arena.personaEditor.basicInfo")}</h2>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("arena.personaEditor.namePlaceholder")}
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("arena.personaEditor.descriptionPlaceholder")}
          rows={3}
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />

        <div>
          <label className="block text-sm text-gray-300">{t("arena.personaEditor.coverEmoji")}</label>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <input
              value={coverEmoji}
              onChange={(e) => setCoverEmoji(e.target.value)}
              maxLength={4}
              placeholder="🎭"
              className="w-16 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-center text-xl"
            />
            <div className="flex flex-wrap gap-1">
              {EMOJI_PRESETS.map((emo) => (
                <button
                  key={emo}
                  type="button"
                  onClick={() => setCoverEmoji(emo)}
                  className={`h-9 w-9 rounded-lg border text-lg ${
                    coverEmoji === emo ? "border-cyan-400 bg-cyan-500/10" : "border-gray-800 hover:bg-gray-800"
                  }`}
                >
                  {emo}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="block text-sm text-gray-300">
          {t("arena.personaEditor.tagsLabel")}
          <p className="mt-0.5 text-xs text-gray-500">{t("arena.personaEditor.tagsHint")}</p>

          {/* 预设 tag：点选切换（已选高亮） */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESET_PERSONA_TAGS.map((preset) => {
              const active = tags.includes(normalizeTag(preset));
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => togglePresetTag(preset)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-cyan-400 bg-cyan-500/15 font-medium text-cyan-100"
                      : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
                  }`}
                >
                  #{preset}
                </button>
              );
            })}
          </div>

          {/* 已选 tags（含自定义），可删 */}
          {tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2 py-0.5 text-xs text-cyan-200"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    title={t("arena.personaEditor.removeTag")}
                    className="text-cyan-300/60 hover:text-cyan-100"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* 自定义 tag 输入：回车/逗号/失焦添加 */}
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
            placeholder={t("arena.personaEditor.customTagPlaceholder")}
            className="mt-2 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          {t("arena.personaEditor.sharedLabel")}
        </label>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">{t("arena.personaEditor.styleSettings")}</h2>

        <label className="block text-sm text-gray-300">
          {t("arena.personaEditor.summaryLabel")}
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={t("arena.personaEditor.summaryPlaceholder")}
            rows={3}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <label className="block text-sm text-gray-300">
          {t("arena.personaEditor.catchphrasesLabel")}
          <input
            value={catchphrasesText}
            onChange={(e) => setCatchphrasesText(e.target.value)}
            placeholder={t("arena.personaEditor.catchphrasesPlaceholder")}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <label className="block text-sm text-gray-300">
          {t("arena.personaEditor.stanceHintLabel")}
          <input
            value={stanceHint}
            onChange={(e) => setStanceHint(e.target.value)}
            placeholder={t("arena.personaEditor.stanceHintPlaceholder")}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <p className="text-xs text-gray-500">
          {t("arena.personaEditor.statsHint", { count: stats.length })}
        </p>
      </section>

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-gray-300">{t("arena.personaEditor.panelPreview")}</div>
        <StyleStandCard profile={previewProfile} />
      </div>
    </div>
  );
}
