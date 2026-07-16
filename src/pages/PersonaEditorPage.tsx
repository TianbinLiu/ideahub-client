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

export default function PersonaEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [coverEmoji, setCoverEmoji] = useState("🎭");
  const [tagsText, setTagsText] = useState("");
  const [shared, setShared] = useState(true);
  const [summary, setSummary] = useState("");
  const [catchphrasesText, setCatchphrasesText] = useState("");
  const [stanceHint, setStanceHint] = useState("");
  const [stats, setStats] = useState<StyleStat[]>([]);

  const parsedTags = useMemo(
    () => tagsText.split(/[#,，,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12),
    [tagsText]
  );

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
        setTagsText((p.tags || []).join(", "));
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
        toast.error("你还没有发言风格面板，请先到「我的发言风格面板」生成");
        return;
      }
      setSummary(p.summary || "");
      setCatchphrasesText((p.catchphrases || []).join("，"));
      setStats(p.stats || []);
      toast.success("已从发言风格面板导入");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("请填写人格名称");
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
      tags: parsedTags,
      style,
      shared,
    };

    try {
      setSaving(true);
      const res = isEdit && id ? await updatePersona(id, body) : await createPersona(body);
      toast.success("已保存");
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
    return <div className="mx-auto max-w-3xl p-4 pb-20 text-gray-400">加载中…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <Link
        to={isEdit && id ? `/arena/persona/${id}` : "/arena/persona"}
        className="text-sm text-gray-400 hover:text-white"
      >
        ← 返回{isEdit ? "人格详情" : "人格广场"}
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? "编辑人格" : "发布人格"}</h1>
          <p className="mt-1 text-sm text-gray-400">
            把你的发言风格封装成可分享的人格；其他用户可下载收藏并装备，在其它平台生成三条方案。
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {saving ? "保存中…" : isEdit ? "保存修改" : "发布人格"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={importing}
          onClick={handleImport}
          className="inline-flex items-center gap-2 rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
        >
          <Download className="h-4 w-4" /> {importing ? "导入中…" : "从我的发言风格面板导入"}
        </button>
        <span className="text-xs text-gray-500">一键带入你的点评 / 口头禅 / 能力数值。</span>
      </div>

      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">基本信息</h2>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="人格名称"
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="人格简介：适合什么场合、什么风格"
          rows={3}
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
        />

        <div>
          <label className="block text-sm text-gray-300">封面 Emoji</label>
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

        <label className="block text-sm text-gray-300">
          标签（逗号分隔）
          <input
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="如：理性, 对线, 嘴替"
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        {parsedTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {parsedTags.map((tag) => (
              <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-0.5 text-xs text-cyan-200">
                #{tag}
              </span>
            ))}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
          发布到人格广场（公开，其他用户可下载装备）
        </label>
      </section>

      <section className="mt-4 space-y-3 rounded-2xl border border-gray-800 bg-gray-900 p-5">
        <h2 className="text-lg font-semibold text-white">风格设定</h2>

        <label className="block text-sm text-gray-300">
          风格点评（summary）
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="一段话描述这个人格的说话风格与气质"
            rows={3}
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <label className="block text-sm text-gray-300">
          口头禅 / 风格短语（逗号分隔）
          <input
            value={catchphrasesText}
            onChange={(e) => setCatchphrasesText(e.target.value)}
            placeholder="如：就这？，逻辑呢，典中典"
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <label className="block text-sm text-gray-300">
          立场 / 倾向提示（stanceHint，可空）
          <input
            value={stanceHint}
            onChange={(e) => setStanceHint(e.target.value)}
            placeholder="如：偏理性中立，遇到人身攻击会反击"
            className="mt-1 w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2"
          />
        </label>

        <p className="text-xs text-gray-500">
          能力数值（雷达图）来自「从我的发言风格面板导入」；当前已带入 {stats.length} 项能力。
        </p>
      </section>

      <div className="mt-4">
        <div className="mb-2 text-sm font-medium text-gray-300">面板预览</div>
        <StyleStandCard profile={previewProfile} />
      </div>
    </div>
  );
}
