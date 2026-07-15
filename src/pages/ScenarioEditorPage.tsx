import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  apiUploadImage,
  captureScenario,
  createScenario,
  generateScenarioComments,
  getScenario,
  updateScenario,
  type ScenarioComment,
} from "../api";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import PlatformCommentView from "../components/PlatformCommentView";

const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "bilibili", label: "哔哩哔哩" },
  { value: "weibo", label: "微博" },
  { value: "tieba", label: "贴吧" },
  { value: "zhihu", label: "知乎" },
  { value: "instagram", label: "Instagram" },
  { value: "generic", label: "通用" },
];

const INTENSITY_OPTIONS: { value: "mild" | "heated" | "flame"; label: string }[] = [
  { value: "mild", label: "温和" },
  { value: "heated", label: "激烈" },
  { value: "flame", label: "火药味" },
];

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function snippet(text: string, max = 18) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

export default function ScenarioEditorPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [platform, setPlatform] = useState("generic");
  const [tagsText, setTagsText] = useState("");
  const [shared, setShared] = useState(false);
  const [topic, setTopic] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [intensity, setIntensity] = useState<"mild" | "heated" | "flame">("heated");
  const [comments, setComments] = useState<ScenarioComment[]>([]);

  const parsedTags = useMemo(
    () => tagsText.split(/[#,，,\s]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12),
    [tagsText]
  );

  async function loadDetail() {
    if (!id) return;
    try {
      setLoading(true);
      const res = await getScenario(id);
      const s = res.scenario;
      setTitle(s.title || "");
      setSummary(s.summary || "");
      setCoverImageUrl(s.coverImageUrl || "");
      setPlatform(s.platform || "generic");
      setTagsText((s.tags || []).join(", "));
      setShared(!!s.shared);
      setTopic(s.topic || "");
      setSourceUrl(s.sourceUrl || "");
      setComments((s.comments || []).map((c) => ({ ...c, id: c.id || newId() })));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isEdit) loadDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, id]);

  async function handleCoverUpload(file: File | null) {
    if (!file) return;
    try {
      setUploading(true);
      const res = await apiUploadImage(file, "idea");
      setCoverImageUrl(res.imageUrl);
      toast.success("封面已上传");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUploading(false);
    }
  }

  function updateComment(commentId: string, patch: Partial<ScenarioComment>) {
    setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, ...patch } : c)));
  }

  function setOP(commentId: string) {
    setComments((prev) => prev.map((c) => ({ ...c, isOP: c.id === commentId })));
  }

  function clearOP() {
    setComments((prev) => prev.map((c) => ({ ...c, isOP: false })));
  }

  function removeComment(commentId: string) {
    setComments((prev) =>
      prev
        .filter((c) => c.id !== commentId)
        .map((c) => (c.parentId === commentId ? { ...c, parentId: null } : c))
    );
  }

  function addComment() {
    setComments((prev) => [
      ...prev,
      { id: newId(), authorName: "", text: "", parentId: null, likeCount: 0 },
    ]);
  }

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error("请先填写争论主题/背景");
      return;
    }
    try {
      setAiBusy(true);
      const res = await generateScenarioComments({ topic: topic.trim(), platform, intensity });
      const generated = (res.comments || []).map((c) => ({ ...c, id: c.id || newId() }));
      if (generated.length === 0) {
        toast.error("AI 未生成任何评论，请调整话题后重试");
        return;
      }
      setComments((prev) => [...prev, ...generated]);
      toast.success(`已生成 ${generated.length} 条评论`);
    } catch (e: any) {
      if (e?.status === 501) {
        toast.error("服务器未配置 AI，无法生成评论");
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      setAiBusy(false);
    }
  }

  async function handleCapture() {
    if (!sourceUrl.trim()) {
      toast.error("请先填写来源链接");
      return;
    }
    try {
      setCaptureBusy(true);
      const res = await captureScenario(sourceUrl.trim());
      const draft = res.draft;
      if (draft.platform) setPlatform(draft.platform);
      if (draft.title) setTitle((prev) => (prev.trim() ? prev : draft.title));
      if (draft.coverImageUrl) setCoverImageUrl((prev) => prev || draft.coverImageUrl);
      const captured = (draft.comments || []).map((c) => ({ ...c, id: c.id || newId() }));
      if (captured.length > 0) {
        setComments((prev) => [...prev, ...captured]);
        toast.success(`已从链接补充 ${captured.length} 条评论`);
      } else {
        toast("未抓到评论，已预填平台/标题/封面，请手动补充评论", { icon: "ℹ️" });
      }
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setCaptureBusy(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast.error("请填写标题");
      return;
    }
    const cleanComments = comments
      .map((c) => ({ ...c, id: c.id || newId(), authorName: c.authorName.trim(), text: c.text.trim() }))
      .filter((c) => c.authorName || c.text);

    const body = {
      title: title.trim(),
      summary: summary.trim(),
      coverImageUrl,
      platform,
      tags: parsedTags,
      shared,
      sourceUrl: sourceUrl.trim(),
      topic: topic.trim(),
      comments: cleanComments,
    };

    try {
      setSaving(true);
      const res = isEdit && id ? await updateScenario(id, body) : await createScenario(body);
      toast.success("已保存");
      navigate(`/arena/simulate/${res.scenario._id}`);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="max-w-6xl mx-auto p-4 pb-20 text-gray-400">加载中...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-4 pb-20">
      <Link to="/arena/simulate" className="text-sm text-gray-400 hover:text-white">
        ← 返回情景模拟
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{isEdit ? "编辑情景" : "创建情景"}</h1>
          <p className="mt-1 text-sm text-gray-400">
            录入或用 AI 生成一段评论区，发布后其他用户可进入模拟与 AI 对线。
          </p>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {saving ? "保存中..." : isEdit ? "保存修改" : "发布情景"}
        </button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.3fr,0.9fr]">
        {/* 左侧：表单 + 评论编辑器 */}
        <div className="space-y-4">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <h2 className="text-lg font-semibold text-white">基本信息</h2>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="标题"
              className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            />
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="简介 / 一句话介绍"
              rows={2}
              className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            />
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="争论主题 / 背景（供 AI 扮演与生成评论使用）"
              rows={3}
              className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm text-gray-300">
                平台皮肤
                <select
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                >
                  {PLATFORM_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-gray-300">
                标签（逗号分隔）
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="如：数码, 争议, 对线"
                  className="mt-1 w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                />
              </label>
            </div>

            {parsedTags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {parsedTags.map((tag) => (
                  <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-0.5 text-xs text-cyan-200">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                发布到情景广场（公开）
              </label>
              <label className="cursor-pointer rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                {uploading ? "上传中..." : "上传封面"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => handleCoverUpload(e.target.files?.[0] || null)}
                />
              </label>
            </div>

            {coverImageUrl && (
              <img src={coverImageUrl} alt="封面" className="h-44 w-full rounded-xl border border-gray-800 object-cover" />
            )}
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <h2 className="text-lg font-semibold text-white">AI 辅助</h2>
            <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-3">
              <div className="text-sm font-medium text-gray-200">用话题生成评论</div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={intensity}
                  onChange={(e) => setIntensity(e.target.value as "mild" | "heated" | "flame")}
                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                >
                  {INTENSITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      争论强度：{o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={aiBusy}
                  onClick={handleGenerate}
                  className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                >
                  {aiBusy ? "生成中..." : "用话题生成评论"}
                </button>
              </div>
              <p className="text-xs text-gray-500">依据上方“争论主题/背景”与所选平台生成一段带对立立场的评论区，追加到下方列表。</p>
            </div>

            <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-3">
              <div className="text-sm font-medium text-gray-200">从链接抓取（兜底）</div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="粘贴评论区链接"
                  className="min-w-[220px] flex-1 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={captureBusy}
                  onClick={handleCapture}
                  className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-60"
                >
                  {captureBusy ? "抓取中..." : "从链接抓取"}
                </button>
              </div>
              <p className="text-xs text-gray-500">尽力抓取平台/标题/封面；抓不到评论时请手动补充。</p>
            </div>
          </section>

          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold text-white">评论编辑器</h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clearOP}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                >
                  清除楼主
                </button>
                <button
                  type="button"
                  onClick={addComment}
                  className="rounded-lg border border-cyan-700 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-950/30"
                >
                  + 添加评论
                </button>
              </div>
            </div>

            {comments.length === 0 ? (
              <p className="text-sm text-gray-400">还没有评论。手动添加、用话题生成，或从链接抓取。</p>
            ) : (
              <div className="space-y-3">
                {comments.map((c, index) => (
                  <div key={c.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">#{index + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeComment(c.id)}
                        className="text-xs text-rose-300 hover:text-rose-200"
                      >
                        删除
                      </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <input
                        value={c.authorName}
                        onChange={(e) => updateComment(c.id, { authorName: e.target.value })}
                        placeholder="账号名"
                        className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                      />
                      <select
                        value={c.parentId || ""}
                        onChange={(e) => updateComment(c.id, { parentId: e.target.value || null })}
                        className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                      >
                        <option value="">顶楼（无回复对象）</option>
                        {comments
                          .filter((other) => other.id !== c.id)
                          .map((other) => (
                            <option key={other.id} value={other.id}>
                              回复 @{other.authorName || "(未命名)"}：{snippet(other.text)}
                            </option>
                          ))}
                      </select>
                    </div>

                    <textarea
                      value={c.text}
                      onChange={(e) => updateComment(c.id, { text: e.target.value })}
                      placeholder="评论内容"
                      rows={2}
                      className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                    />

                    <input
                      value={c.stance || ""}
                      onChange={(e) => updateComment(c.id, { stance: e.target.value })}
                      placeholder="立场/观点提示（供 AI 扮演，可空）"
                      className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                    />

                    <label className="flex items-center gap-2 text-xs text-gray-300">
                      <input
                        type="radio"
                        name="scenario-op"
                        checked={!!c.isOP}
                        onChange={() => setOP(c.id)}
                      />
                      设为楼主
                    </label>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* 右侧：实时预览 */}
        <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
          <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">实时预览</h2>
              <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
                {PLATFORM_OPTIONS.find((p) => p.value === platform)?.label || platform}
              </span>
            </div>
            {comments.length === 0 ? (
              <p className="text-sm text-gray-400">添加评论后在这里预览平台皮肤效果。</p>
            ) : (
              <PlatformCommentView platform={platform} comments={comments} topic={topic} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
