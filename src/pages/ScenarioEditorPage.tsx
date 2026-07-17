import { useEffect, useMemo, useRef, useState } from "react";
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

// ⚠️ 必须与 server/src/models/Scenario.js 的 SCENARIO_PLATFORMS 保持一致：
// 这里多出的值会被后端 normalizePlatform【静默降级为 generic】（用户选了却不生效）；
// 这里少的值则是用户根本选不到。每个值也都要在 components/skins/index.ts 里有专属皮肤。
const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "bilibili", label: "哔哩哔哩" },
  { value: "weibo", label: "微博" },
  { value: "tieba", label: "贴吧" },
  { value: "zhihu", label: "知乎" },
  { value: "douyin", label: "抖音" },
  { value: "xiaohongshu", label: "小红书" },
  { value: "instagram", label: "Instagram" },
  { value: "generic", label: "通用" },
];

type Intensity = "mild" | "heated" | "flame";

const INTENSITY_OPTIONS: { value: Intensity; label: string }[] = [
  { value: "mild", label: "温和" },
  { value: "heated", label: "激烈" },
  { value: "flame", label: "火药味" },
];

/**
 * 素材上限。必须与后端三处保持一致：generateBody 的 z.string().max(8000)、
 * 以及 scenarioAi.service.js 里 prompt 对 sourceText 的 slice 上限。
 * 三者一旦不一致，就会出现「前端说都用了、后端其实只用了一部分」的骗人提示。
 */
const MAX_SOURCE_TEXT = 8000;
/** 上传素材文件大小上限 200KB */
const MAX_SOURCE_FILE_BYTES = 200 * 1024;

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

/** 用 FileReader 把纯文本文件读成字符串（失败则 reject，由调用方 toast） */
function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取文件失败"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
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
  const [intensity, setIntensity] = useState<Intensity>("heated");
  const [comments, setComments] = useState<ScenarioComment[]>([]);

  // ★★ 真实评论素材（插件抓取 / 上传的文本）只活在这两个 state 里，【只用于喂 AI 生成】。
  // 它们绝不进 comments / topic，也绝不进 handleSave 的 body —— 提交出去的永远只有
  // AI 重新生成的评论。理由：PIPL 第25条对「已合法公开的个人信息」没有豁免口；
  // 只换用户名、正文照抄属【去标识化】而非【匿名化】，仍是个人信息。
  const [captureSourceText, setCaptureSourceText] = useState("");
  const [uploadSourceText, setUploadSourceText] = useState("");
  const [uploadFileName, setUploadFileName] = useState("");

  // 插件交接的 effect 只在挂载时绑定一次，闭包里的 platform/intensity 会是初始值 —— 用 ref 读最新值。
  const platformRef = useRef(platform);
  const intensityRef = useRef(intensity);
  useEffect(() => {
    platformRef.current = platform;
    intensityRef.current = intensity;
  }, [platform, intensity]);

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

  /**
   * 按真实素材生成模拟评论区。
   *
   * ★ 素材（真实评论原文）只作为【入参】送给后端喂 AI，回来的 AI 评论才进 comments。
   * 真实评论不进 state.comments、不进 topic、不进任何提交字段。
   * 只读参数与 setter，不读组件 state —— 供挂载时的 effect 直接调用而不怕闭包过期。
   */
  async function generateFromSource(
    text: string,
    nextPlatform: string,
    nextIntensity: Intensity,
    successMessage: string
  ) {
    try {
      setAiBusy(true);
      const res = await generateScenarioComments({
        sourceText: text,
        platform: nextPlatform,
        intensity: nextIntensity,
      });
      const generated = (res.comments || []).map((c) => ({ ...c, id: c.id || newId() }));
      if (generated.length === 0) {
        toast.error("AI 未生成任何评论，请重试，或改用「用话题生成」");
        return;
      }
      setComments(generated);
      toast.success(successMessage);
    } catch (e: any) {
      if (e?.status === 501) {
        toast.error("服务器未配置 AI，无法按素材生成；请改用「用话题生成」");
      } else {
        toast.error(`${humanizeError(e)}（也可改用「用话题生成」）`);
      }
    } finally {
      setAiBusy(false);
    }
  }

  // A：消费插件抓取的评论（localStorage 'lbw_pending_capture'）。
  // 同时监听 'lbw:capture-ready'：插件写入 localStorage 是异步的，可能早于或晚于本页挂载，
  // 两条路径都消费一次即可覆盖两种时序（消费后立即删除，保证只导入一次）。
  //
  // ★★ 抓到的真实评论【不再】直接 setComments 预填 —— 那等于把他人评论原样入库/发布。
  // 现在只把它们拼成 sourceText 当作 AI 的输入素材，用【AI 重新生成的评论】填充编辑器。
  useEffect(() => {
    function consumeCapture() {
      try {
        const raw = localStorage.getItem("lbw_pending_capture");
        if (!raw) return;
        localStorage.removeItem("lbw_pending_capture");
        const capture = JSON.parse(raw) as {
          platform?: string;
          comments?: { authorName?: string; text?: string }[];
        };
        // setPlatform 是异步的，本轮拿不到新值 —— 生成用的平台直接取 capture 里的
        const nextPlatform = capture?.platform || platformRef.current;
        if (capture?.platform) setPlatform(capture.platform);

        const rows = (capture?.comments || [])
          .map((c) => ({ authorName: (c.authorName || "").trim(), text: (c.text || "").trim() }))
          .filter((c) => c.authorName || c.text);
        if (rows.length === 0) return;

        // 「作者：正文」逐行拼成素材；只存进 captureSourceText，绝不进 comments
        const text = rows
          .map((c) => `${c.authorName || "匿名"}：${c.text}`)
          .join("\n")
          .slice(0, MAX_SOURCE_TEXT);
        setCaptureSourceText(text);
        void generateFromSource(
          text,
          nextPlatform,
          intensityRef.current,
          `已按抓取到的 ${rows.length} 条真实评论生成模拟评论区`
        );
      } catch (e) {
        console.error("读取插件抓取的评论失败", e);
        toast.error("读取插件抓取的评论失败");
      }
    }
    consumeCapture();
    window.addEventListener("lbw:capture-ready", consumeCapture);
    return () => window.removeEventListener("lbw:capture-ready", consumeCapture);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // B：上传文本文档 → 读成 sourceText（不依赖插件的独立路径）
  async function handleSourceFile(file: File | null) {
    if (!file) return;
    setUploadSourceText("");
    setUploadFileName("");
    if (file.size > MAX_SOURCE_FILE_BYTES) {
      toast.error(`文件过大（${Math.ceil(file.size / 1024)}KB），上限 200KB`);
      return;
    }
    // 扩展名 + MIME 都要过：MIME 非空且不是 text/* → 拒（挡掉把二进制改名成 .txt 的情况）；
    // .md 在部分系统上没有注册 MIME（file.type 为空），故空 MIME 放行、只认扩展名。
    const hasTextExt = /\.(txt|md|markdown)$/i.test(file.name);
    const isTextMime = !file.type || /^text\//i.test(file.type);
    if (!hasTextExt || !isTextMime) {
      toast.error("只支持 .txt / .md 纯文本文件");
      return;
    }
    try {
      const raw = await readTextFile(file);
      const text = raw.trim().slice(0, MAX_SOURCE_TEXT);
      if (!text) {
        toast.error("文件内容为空");
        return;
      }
      setUploadSourceText(text);
      setUploadFileName(file.name);
      if (raw.trim().length > MAX_SOURCE_TEXT) {
        toast(`内容超过 ${MAX_SOURCE_TEXT} 字，已截取前 ${MAX_SOURCE_TEXT} 字作为素材`, { icon: "ℹ️" });
      }
    } catch (e) {
      toast.error(humanizeError(e));
    }
  }

  async function handleGenerateFromUpload() {
    if (!uploadSourceText) {
      toast.error("请先选择一份文本文档");
      return;
    }
    await generateFromSource(uploadSourceText, platform, intensity, "已按上传的素材生成模拟评论区");
  }

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

            {captureSourceText && (
              <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3 space-y-1">
                <div className="text-sm font-medium text-cyan-100">
                  插件抓取的素材（{captureSourceText.length} 字）
                </div>
                <p className="text-xs text-cyan-200/70">
                  抓到的真实评论只作为 AI 的生成素材，不会入库、不会被发布；下方评论区是 AI 重新写的版本，可自行编辑。
                </p>
              </div>
            )}

            <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-3">
              <div className="text-sm font-medium text-gray-200">上传文本文档生成</div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="cursor-pointer rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                  选择文本文件
                  <input
                    type="file"
                    accept=".txt,.md,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      void handleSourceFile(e.target.files?.[0] || null);
                      e.target.value = ""; // 允许重复选择同一文件
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={aiBusy || !uploadSourceText}
                  onClick={handleGenerateFromUpload}
                  className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                >
                  {aiBusy ? "生成中..." : "生成模板"}
                </button>
                {uploadFileName && (
                  <span className="text-xs text-gray-400">
                    {uploadFileName}（{uploadSourceText.length} 字）
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">
                上传一份包含评论内容的文本，AI 会据此重建一个该平台风格的争论评论区。原文只用于生成，不会被发布。
                使用上方所选的「平台皮肤」与「争论强度」；支持 .txt / .md，最大 200KB。
              </p>
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

            <p className="text-xs text-amber-300/80">
              隐私提示：这里的评论应当是 AI 生成或你自己撰写的。抓取/上传的真实评论只用于喂 AI 生成，不会入库、不会被发布；请勿把他人评论原文粘贴到这里。
            </p>

            {comments.length === 0 ? (
              <p className="text-sm text-gray-400">还没有评论。手动添加、用话题生成、上传文本生成，或从链接抓取。</p>
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
