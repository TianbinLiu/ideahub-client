import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router";
import {
  analyzeScenario,
  apiUploadImage,
  captureScenario,
  createScenario,
  generateScenarioComments,
  generateScene,
  getScenario,
  updateScenario,
  type Persona,
  type ScenarioChatMessage,
  type ScenarioComment,
  type ScenarioParticipant,
} from "../api";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { humanizeError } from "../utils/humanizeError";
import ScenarioSceneView from "../components/ScenarioSceneView";
import PersonaPickerModal from "../components/PersonaPickerModal";

// ⚠️ 必须与 server/src/models/Scenario.js 的 SCENARIO_PLATFORMS 保持一致：
// 这里多出的值会被后端 normalizePlatform【静默降级为 generic】（用户选了却不生效）；
// 这里少的值则是用户根本选不到。每个值也都要在 components/skins/index.ts 里有专属皮肤。
const PLATFORM_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "bilibili", labelKey: "platformBilibili" },
  { value: "weibo", labelKey: "platformWeibo" },
  { value: "tieba", labelKey: "platformTieba" },
  { value: "zhihu", labelKey: "platformZhihu" },
  { value: "douyin", labelKey: "platformDouyin" },
  { value: "xiaohongshu", labelKey: "platformXiaohongshu" },
  { value: "instagram", labelKey: "platformInstagram" },
  { value: "generic", labelKey: "platformGeneric" },
];

// chat 场景（sceneKind==='chat'）的平台选项。同步约束与上面一致，但对应的注册表是
// components/chatSkins/index.ts 的 CHAT_SKIN_COMPONENTS（聊天皮肤，不是评论皮肤）；
// platformFromHost 对聊天平台 N/A —— 聊天场景不走「贴 URL 抓评论」。
const CHAT_PLATFORM_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "wechat", labelKey: "platformWechat" },
  { value: "qq", labelKey: "platformQq" },
  { value: "generic", labelKey: "platformGeneric" },
];

// 分类（话题领域，与 sceneKind 正交）。必须与 server/src/models/Scenario.js 的
// SCENARIO_CATEGORIES 保持一致：这里多出的值会被后端【静默归一为 other】。
const CATEGORY_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "debate", labelKey: "categoryDebate" },
  { value: "workplace", labelKey: "categoryWorkplace" },
  { value: "jobhunt", labelKey: "categoryJobhunt" },
  { value: "social", labelKey: "categorySocial" },
  { value: "service", labelKey: "categoryService" },
  { value: "fun", labelKey: "categoryFun" },
  { value: "other", labelKey: "categoryOther" },
];

/** 场景类型：与 server/src/models/Scenario.js 的 SCENARIO_SCENE_KINDS 一致。 */
type SceneKind = "comment" | "chat";

type Intensity = "mild" | "heated" | "flame";

const INTENSITY_OPTIONS: { value: Intensity; labelKey: string }[] = [
  { value: "mild", labelKey: "intensityMild" },
  { value: "heated", labelKey: "intensityHeated" },
  { value: "flame", labelKey: "intensityFlame" },
];

/**
 * 素材上限。必须与后端三处保持一致：generateBody 的 z.string().max(8000)、
 * 以及 scenarioAi.service.js 里 prompt 对 sourceText 的 slice 上限。
 * 三者一旦不一致，就会出现「前端说都用了、后端其实只用了一部分」的骗人提示。
 */
const MAX_SOURCE_TEXT = 8000;
/** 上传素材文件大小上限 200KB */
const MAX_SOURCE_FILE_BYTES = 200 * 1024;

/** 向导的三个步骤。1=选内容来源，2=编辑评论区，3=完善信息并发布。 */
type Step = 1 | 2 | 3;
/** 第一步的两张来源卡片。 */
type SourceMode = "link" | "generate";

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
function readTextFile(file: File, errorMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(errorMessage));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });
}

export default function ScenarioEditorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = !!id;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [aiMetaBusy, setAiMetaBusy] = useState(false);

  // 编辑已有情景时内容已就绪，直接从第二步（评论编辑）开始；新建则从第一步（选来源）开始。
  const [step, setStep] = useState<Step>(isEdit ? 2 : 1);
  // 第一步：当前选中的来源卡片（点击后展开+高亮并露出对应输入）。null=尚未选择。
  const [sourceMode, setSourceMode] = useState<SourceMode | null>(null);
  // 悬浮的卡片——只在【尚未选择】时驱动放大/挤压；一旦选定就锁定，避免露出的表单被 hover 挤扁。
  const [hoveredCard, setHoveredCard] = useState<SourceMode | null>(null);

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

  // ── 场景类型（决定第二步编辑器与预览用哪个壳）+ chat 场景数据 ──
  const [sceneKind, setSceneKind] = useState<SceneKind>("comment");
  const [category, setCategory] = useState("other");
  const [participants, setParticipants] = useState<ScenarioParticipant[]>([]);
  const [chatMessages, setChatMessages] = useState<ScenarioChatMessage[]>([]);
  // 第一步✨卡片（聊天对话）：场景的一句话描述。只作为 generateScene 的 AI 入参；
  // 生成成功后兼作 topic 的预填（topic 是 play 时 AI 扮演读的「场景背景」）。
  const [sceneDesc, setSceneDesc] = useState("");
  // 人格选择器：正在为哪个角色（participant id）挑人格；null=关闭
  const [personaPickerFor, setPersonaPickerFor] = useState<string | null>(null);

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
      setSceneKind(s.sceneKind === "chat" ? "chat" : "comment");
      setCategory(s.category || "other");
      setParticipants((s.participants || []).map((p) => ({ ...p, id: p.id || newId() })));
      setChatMessages((s.messages || []).map((m) => ({ ...m, id: m.id || newId() })));
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
        toast.error(t("arena.scenarioEditor.aiNoCommentsRetryOrTopic"));
        return;
      }
      setComments(generated);
      setSceneKind("comment"); // 素材生成的是评论区 —— 若此前切过「聊天对话」，跟着回评论场景
      setStep(2); // 生成成功即进入评论编辑步骤
      toast.success(successMessage);
    } catch (e: any) {
      if (e?.status === 501) {
        toast.error(t("arena.scenarioEditor.aiNotConfiguredSource"));
      } else {
        toast.error(t("arena.scenarioEditor.generateSourceFailed", { error: humanizeError(e) }));
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
        // 插件抓取的素材属「生成」这一类来源，展开对应卡片，用户回到第一步时能看到素材说明。
        setSourceMode("generate");
        void generateFromSource(
          text,
          nextPlatform,
          intensityRef.current,
          t("arena.scenarioEditor.generatedFromCaptured", { count: rows.length })
        );
      } catch (e) {
        console.error("读取插件抓取的评论失败", e);
        toast.error(t("arena.scenarioEditor.readCaptureFailed"));
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
      toast.error(t("arena.scenarioEditor.fileTooLarge", { size: Math.ceil(file.size / 1024) }));
      return;
    }
    // 扩展名 + MIME 都要过：MIME 非空且不是 text/* → 拒（挡掉把二进制改名成 .txt 的情况）；
    // .md 在部分系统上没有注册 MIME（file.type 为空），故空 MIME 放行、只认扩展名。
    const hasTextExt = /\.(txt|md|markdown)$/i.test(file.name);
    const isTextMime = !file.type || /^text\//i.test(file.type);
    if (!hasTextExt || !isTextMime) {
      toast.error(t("arena.scenarioEditor.onlyTextFiles"));
      return;
    }
    try {
      const raw = await readTextFile(file, t("arena.scenarioEditor.readFileFailed"));
      const text = raw.trim().slice(0, MAX_SOURCE_TEXT);
      if (!text) {
        toast.error(t("arena.scenarioEditor.fileEmpty"));
        return;
      }
      setUploadSourceText(text);
      setUploadFileName(file.name);
      if (raw.trim().length > MAX_SOURCE_TEXT) {
        toast(t("arena.scenarioEditor.contentTruncated", { max: MAX_SOURCE_TEXT }), { icon: "ℹ️" });
      }
    } catch (e) {
      toast.error(humanizeError(e));
    }
  }

  async function handleGenerateFromUpload() {
    if (!uploadSourceText) {
      toast.error(t("arena.scenarioEditor.selectTextDocFirst"));
      return;
    }
    await generateFromSource(uploadSourceText, platform, intensity, t("arena.scenarioEditor.generatedFromUpload"));
  }

  async function handleCoverUpload(file: File | null) {
    if (!file) return;
    try {
      setUploading(true);
      const res = await apiUploadImage(file, "idea");
      setCoverImageUrl(res.imageUrl);
      toast.success(t("arena.scenarioEditor.coverUploaded"));
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

  // ── chat 场景：角色卡 / 种子对话的增删改 ─────────────────────────

  function updateParticipant(pid: string, patch: Partial<ScenarioParticipant>) {
    setParticipants((prev) => prev.map((p) => (p.id === pid ? { ...p, ...patch } : p)));
  }

  /**
   * 「我」全场至多一个：单选语义，选中谁其余全部取消。
   * 切成「我」时同时清掉该角色的人格绑定：「我」由真实用户发言、不吃人设，
   * 而绑定控件都渲染在 !isSelf 后面 —— 不清的话绑定会【隐身】：看不见、
   * 解不掉，却仍随保存进库、在 play 时进 AI prompt（评审实锤的坑，别回退）。
   */
  function setSelfParticipant(pid: string) {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === pid ? { ...p, isSelf: true, personaId: "", personaName: "" } : { ...p, isSelf: false }
      )
    );
  }

  function removeParticipant(pid: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== pid));
    // 该角色的消息不删（内容还在），发送者置空成「未指定」，由用户改派
    setChatMessages((prev) => prev.map((m) => (m.senderId === pid ? { ...m, senderId: "" } : m)));
  }

  function addParticipant() {
    setParticipants((prev) => [...prev, { id: newId(), name: "", avatar: "", role: "", isSelf: false, goal: "" }]);
  }

  /**
   * 给角色绑定人格广场的人格（引用语义：play 时后端实时取该人格最新风格喂 AI）。
   * 名字/头像只在角色卡还空着时用人格的预填 —— 用户已填的不覆盖（角色名和人格名
   * 本就允许不同：角色叫「王经理」、说话风格是「阴阳怪气大师」完全合理）。
   */
  function bindPersona(pid: string, persona: Persona) {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === pid
          ? {
              ...p,
              personaId: persona._id,
              personaName: persona.name,
              name: p.name.trim() ? p.name : persona.name.slice(0, 80),
              avatar: (p.avatar || "").trim() ? p.avatar : persona.coverEmoji || "🎭",
            }
          : p
      )
    );
    setPersonaPickerFor(null);
    toast.success(t("arena.scenarioEditor.personaBound", { name: persona.name }));
  }

  function unbindPersona(pid: string) {
    updateParticipant(pid, { personaId: "", personaName: "" });
  }

  function updateChatMessage(mid: string, patch: Partial<ScenarioChatMessage>) {
    setChatMessages((prev) => prev.map((m) => (m.id === mid ? { ...m, ...patch } : m)));
  }

  function removeChatMessage(mid: string) {
    setChatMessages((prev) => prev.filter((m) => m.id !== mid));
  }

  function moveChatMessage(mid: string, dir: -1 | 1) {
    setChatMessages((prev) => {
      const i = prev.findIndex((m) => m.id === mid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  function addChatMessage() {
    setChatMessages((prev) => [...prev, { id: newId(), senderId: participants[0]?.id || "", text: "" }]);
  }

  /**
   * 第一步✨卡片的「生成类型」切换：直接切 sceneKind ——
   * 想手建聊天场景的用户切到「聊天对话」后直接点下一步即可（第二步会给空的角色/消息编辑器）。
   * 平台跟着场景类型走：当前平台不在目标列表里就重置为该类型的默认平台。
   */
  function switchGenKind(kind: SceneKind) {
    setSceneKind(kind);
    const options = kind === "chat" ? CHAT_PLATFORM_OPTIONS : PLATFORM_OPTIONS;
    if (!options.some((o) => o.value === platform)) {
      setPlatform(kind === "chat" ? "wechat" : "generic");
    }
  }

  // 第一步✨卡片（聊天对话）：按场景描述让 AI 生成 角色卡+种子对话，成功即切到 chat 场景进第二步
  async function handleGenerateScene() {
    if (!sceneDesc.trim()) {
      toast.error(t("arena.scenarioEditor.fillSceneDescFirst"));
      return;
    }
    try {
      setAiBusy(true);
      const res = await generateScene({ sceneDesc: sceneDesc.trim(), platform, category });
      const ps = (res.participants || []).map((p) => ({ ...p, id: p.id || newId() }));
      const pIds = new Set(ps.map((p) => p.id));
      const ms = (res.messages || []).map((m) => ({
        ...m,
        id: m.id || newId(),
        senderId: m.senderId && pIds.has(m.senderId) ? m.senderId : "",
      }));
      if (ps.length === 0 || ms.length === 0) {
        toast.error(t("arena.scenarioEditor.sceneGenerateEmpty"));
        return;
      }
      setParticipants(ps);
      setChatMessages(ms);
      setSceneKind("chat");
      if (res.title) setTitle((prev) => (prev.trim() ? prev : res.title));
      // 场景描述兼作 topic 预填（play 时 AI 扮演读它当「场景背景」）；用户已填过则不覆盖
      setTopic((prev) => (prev.trim() ? prev : sceneDesc.trim()));
      setStep(2);
      toast.success(t("arena.scenarioEditor.sceneGenerated", { roles: ps.length, count: ms.length }));
    } catch (e: any) {
      if (e?.status === 501) {
        toast.error(t("arena.scenarioEditor.aiNotConfiguredScene"));
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      setAiBusy(false);
    }
  }

  async function handleGenerate() {
    if (!topic.trim()) {
      toast.error(t("arena.scenarioEditor.fillTopicFirst"));
      return;
    }
    try {
      setAiBusy(true);
      const res = await generateScenarioComments({ topic: topic.trim(), platform, intensity });
      const generated = (res.comments || []).map((c) => ({ ...c, id: c.id || newId() }));
      if (generated.length === 0) {
        toast.error(t("arena.scenarioEditor.aiNoCommentsAdjustTopic"));
        return;
      }
      setComments((prev) => [...prev, ...generated]);
      setSceneKind("comment"); // 话题生成的是评论区
      setStep(2); // 生成成功即进入评论编辑步骤
      toast.success(t("arena.scenarioEditor.generatedCount", { count: generated.length }));
    } catch (e: any) {
      if (e?.status === 501) {
        toast.error(t("arena.scenarioEditor.aiNotConfigured"));
      } else {
        toast.error(humanizeError(e));
      }
    } finally {
      setAiBusy(false);
    }
  }

  async function handleCapture() {
    if (!sourceUrl.trim()) {
      toast.error(t("arena.scenarioEditor.fillSourceUrlFirst"));
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
        setSceneKind("comment"); // 链接抓取的是评论区
        setStep(2); // 抓到评论才进入编辑步骤；抓不到则留在第一步让用户改用其它方式
        toast.success(t("arena.scenarioEditor.capturedFromLink", { count: captured.length }));
      } else {
        // captureScenario 目前只回平台/标题/封面、评论恒为空（真正抓评论走浏览器插件）。
        toast(t("arena.scenarioEditor.noCommentsCaptured"), { icon: "ℹ️" });
      }
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setCaptureBusy(false);
    }
  }

  // 第三步：让 AI 读一遍话题 + 当前评论，自动填标题/简介/标签。用户主动点击，覆盖对应字段是预期行为。
  async function handleAnalyze() {
    const hasContent = topic.trim() || comments.some((c) => c.text.trim() || c.authorName.trim());
    if (!hasContent) {
      toast.error(t("arena.scenarioEditor.aiFillNoContent"));
      return;
    }
    try {
      setAiMetaBusy(true);
      const res = await analyzeScenario({ topic: topic.trim(), platform, comments });
      const got = (res.title && res.title.trim()) || (res.summary && res.summary.trim()) || (res.tags && res.tags.length);
      if (!got) {
        toast.error(t("arena.scenarioEditor.aiFillEmpty"));
        return;
      }
      if (res.title && res.title.trim()) setTitle(res.title.trim());
      if (res.summary && res.summary.trim()) setSummary(res.summary.trim());
      if (res.tags && res.tags.length) setTagsText(res.tags.join(", "));
      toast.success(t("arena.scenarioEditor.aiFilledMeta"));
    } catch (e: any) {
      if (e?.status === 501) {
        toast.error(t("arena.scenarioEditor.aiFillNotConfigured"));
      } else {
        toast.error(t("arena.scenarioEditor.aiFillFailed", { error: humanizeError(e) }));
      }
    } finally {
      setAiMetaBusy(false);
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setStep(3); // 标题在第三步，缺了就把用户带过去
      toast.error(t("arena.scenarioEditor.fillTitle"));
      return;
    }
    const cleanComments = comments
      .map((c) => ({ ...c, id: c.id || newId(), authorName: c.authorName.trim(), text: c.text.trim() }))
      .filter((c) => c.authorName || c.text);

    // chat 场景数据：全空的角色卡/空消息不提交；发送者指向已被删的角色时置空（后端也会归一，双保险）
    const cleanParticipants = participants
      .map((p) => ({
        ...p,
        id: p.id || newId(),
        name: (p.name || "").trim(),
        avatar: (p.avatar || "").trim(),
        role: (p.role || "").trim(),
        goal: (p.goal || "").trim(),
      }))
      .filter((p) => p.name || p.role || p.goal);
    const keptIds = new Set(cleanParticipants.map((p) => p.id));
    const cleanMessages = chatMessages
      .map((m) => ({
        ...m,
        id: m.id || newId(),
        text: (m.text || "").trim(),
        senderId: m.senderId && keptIds.has(m.senderId) ? m.senderId : "",
      }))
      .filter((m) => m.text);

    const body = {
      title: title.trim(),
      summary: summary.trim(),
      coverImageUrl,
      platform,
      sceneKind,
      category,
      tags: parsedTags,
      shared,
      sourceUrl: sourceUrl.trim(),
      topic: topic.trim(),
      comments: cleanComments,
      participants: cleanParticipants,
      messages: cleanMessages,
    };

    try {
      setSaving(true);
      const res = isEdit && id ? await updateScenario(id, body) : await createScenario(body);
      toast.success(t("arena.scenarioEditor.saved"));
      navigate(`/arena/simulate/${res.scenario._id}`);
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  // ── 第一步卡片的放大/挤压：选中优先于悬浮；都没有则两张均分。
  const activeCard: SourceMode | null = sourceMode ?? hoveredCard;
  function cardFlexStyle(card: SourceMode): CSSProperties {
    if (!activeCard) return { flexGrow: 1, flexBasis: 0 };
    return { flexGrow: activeCard === card ? 1.8 : 0.6, flexBasis: 0 };
  }

  const platformLabel = (() => {
    const p =
      PLATFORM_OPTIONS.find((p) => p.value === platform) ||
      CHAT_PLATFORM_OPTIONS.find((p) => p.value === platform);
    return p ? t(`arena.scenarioEditor.${p.labelKey}`) : platform;
  })();

  const STEP_META: { n: Step; shortKey: string }[] = [
    { n: 1, shortKey: "step1Short" },
    { n: 2, shortKey: sceneKind === "chat" ? "step2ShortChat" : "step2Short" },
    { n: 3, shortKey: "step3Short" },
  ];

  if (loading) {
    return <div className="max-w-6xl mx-auto p-4 pb-20 text-gray-400">{t("arena.scenarioEditor.loading")}</div>;
  }

  // 右侧实时预览（第二、三步共用）：按 sceneKind 分派到评论壳/聊天壳
  const hasPreviewContent =
    sceneKind === "chat" ? participants.length > 0 || chatMessages.length > 0 : comments.length > 0;
  const previewPanel = (
    <div className="space-y-3 lg:sticky lg:top-4 lg:self-start">
      <section className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">{t("arena.scenarioEditor.livePreview")}</h2>
          <span className="rounded-full border border-gray-700 px-2 py-0.5 text-[11px] text-gray-300">
            {platformLabel}
          </span>
        </div>
        {!hasPreviewContent ? (
          <p className="text-sm text-gray-400">
            {t(sceneKind === "chat" ? "arena.scenarioEditor.chatPreviewHint" : "arena.scenarioEditor.previewHint")}
          </p>
        ) : (
          <ScenarioSceneView
            sceneKind={sceneKind}
            platform={platform}
            comments={comments}
            topic={topic}
            participants={participants}
            messages={chatMessages}
          />
        )}
      </section>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4 pb-20">
      <Link to="/arena/simulate" className="text-sm text-gray-400 hover:text-white">
        ← {t("arena.scenarioEditor.backToSimulate")}
      </Link>

      <div className="mt-2">
        <h1 className="text-2xl font-bold text-white">
          {isEdit ? t("arena.scenarioEditor.editScenario") : t("arena.scenarioEditor.createScenario")}
        </h1>
        <p className="mt-1 text-sm text-gray-400">{t("arena.scenarioEditor.pageIntro")}</p>
      </div>

      {/* 步骤指示器（可点击跳转，方便编辑态直接跳到某步） */}
      <div className="mt-5 flex items-center gap-2">
        {STEP_META.map((s, i) => {
          const isCurrent = step === s.n;
          const isDone = step > s.n;
          return (
            <div key={s.n} className="flex flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => setStep(s.n)}
                className="group flex min-w-0 items-center gap-2"
                aria-current={isCurrent ? "step" : undefined}
              >
                <span
                  className={`flex h-7 w-7 flex-none items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                    isCurrent
                      ? "border-cyan-500 bg-cyan-500 text-black"
                      : isDone
                      ? "border-cyan-700 bg-cyan-950/40 text-cyan-200"
                      : "border-gray-700 bg-gray-900 text-gray-400 group-hover:border-gray-500"
                  }`}
                >
                  {s.n}
                </span>
                <span
                  className={`truncate text-sm ${
                    isCurrent ? "font-semibold text-white" : "text-gray-400 group-hover:text-gray-200"
                  }`}
                >
                  {t(`arena.scenarioEditor.${s.shortKey}`)}
                </span>
              </button>
              {i < STEP_META.length - 1 && (
                <span className={`h-px flex-1 ${step > s.n ? "bg-cyan-700" : "bg-gray-800"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* ══════════ 第一步：选择内容来源 ══════════ */}
      {step === 1 && (
        <div className="mt-6">
          <h2 className="text-lg font-semibold text-white">{t("arena.scenarioEditor.step1Title")}</h2>
          <p className="mt-1 text-sm text-gray-400">{t("arena.scenarioEditor.stepIntro1")}</p>

          {/* 移动端 grid（各占满、忽略 flex 尺寸），md+ 变 flex 行才启用放大/挤压 */}
          <div className="mt-5 grid grid-cols-1 gap-4 md:flex md:flex-row md:items-stretch">
            {/* 卡片 A：从链接抓取。用 div（非 button）—— 展开后卡片里含 input/select/button，
                嵌进 <button> 属非法 HTML 且会破坏内部控件的聚焦/点击。用 role=button + 键盘支持补语义。 */}
            <div
              role="button"
              tabIndex={0}
              style={cardFlexStyle("link")}
              onMouseEnter={() => setHoveredCard("link")}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => setSourceMode("link")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSourceMode("link"); } }}
              className={`group relative flex cursor-pointer flex-col rounded-2xl border p-5 text-left transition-all duration-300 ${
                sourceMode === "link"
                  ? "border-cyan-500 bg-cyan-950/20 ring-1 ring-cyan-500/40"
                  : "border-gray-800 bg-gray-900 hover:border-gray-600"
              } ${activeCard && activeCard !== "link" ? "opacity-70" : "opacity-100"}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gray-800 text-xl">🔗</span>
                <div className="min-w-0">
                  <div className="font-semibold text-white">{t("arena.scenarioEditor.optionLinkTitle")}</div>
                  {sourceMode !== "link" && (
                    <div className="text-xs text-cyan-300/80">{t("arena.scenarioEditor.optionHoverHint")}</div>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-400">{t("arena.scenarioEditor.optionLinkDesc")}</p>

              {sourceMode === "link" && (
                // 外层是 <button>，内部交互元素用 stopPropagation 防止点击冒泡重复触发 setSourceMode。
                <div className="mt-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder={t("arena.scenarioEditor.pasteLinkPlaceholder")}
                      className="min-w-[200px] flex-1 rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={captureBusy}
                      onClick={handleCapture}
                      className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                    >
                      {captureBusy ? t("arena.scenarioEditor.capturing") : t("arena.scenarioEditor.captureFromLinkButton")}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">{t("arena.scenarioEditor.captureHint")}</p>
                </div>
              )}
            </div>

            {/* 卡片 B：用话题生成 / 上传文本（同 A，用 div + role=button） */}
            <div
              role="button"
              tabIndex={0}
              style={cardFlexStyle("generate")}
              onMouseEnter={() => setHoveredCard("generate")}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => setSourceMode("generate")}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSourceMode("generate"); } }}
              className={`group relative flex cursor-pointer flex-col rounded-2xl border p-5 text-left transition-all duration-300 ${
                sourceMode === "generate"
                  ? "border-cyan-500 bg-cyan-950/20 ring-1 ring-cyan-500/40"
                  : "border-gray-800 bg-gray-900 hover:border-gray-600"
              } ${activeCard && activeCard !== "generate" ? "opacity-70" : "opacity-100"}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-gray-800 text-xl">✨</span>
                <div className="min-w-0">
                  <div className="font-semibold text-white">{t("arena.scenarioEditor.optionGenerateTitle")}</div>
                  {sourceMode !== "generate" && (
                    <div className="text-xs text-cyan-300/80">{t("arena.scenarioEditor.optionHoverHint")}</div>
                  )}
                </div>
              </div>
              <p className="mt-3 text-sm text-gray-400">{t("arena.scenarioEditor.optionGenerateDesc")}</p>

              {sourceMode === "generate" && (
                <div className="mt-4 space-y-4" onClick={(e) => e.stopPropagation()}>
                  {/* 生成类型切换：评论区（历史行为）｜聊天对话（sceneKind='chat'，走 generateScene） */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-300">{t("arena.scenarioEditor.genKindLabel")}</span>
                    <div className="flex overflow-hidden rounded-xl border border-gray-800">
                      {(["comment", "chat"] as const).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => switchGenKind(k)}
                          className={`px-3 py-1.5 text-sm transition-colors ${
                            sceneKind === k
                              ? "bg-cyan-500/20 font-semibold text-cyan-100"
                              : "bg-gray-950/50 text-gray-400 hover:text-gray-200"
                          }`}
                        >
                          {t(`arena.scenarioEditor.${k === "comment" ? "genKindComment" : "genKindChat"}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {sceneKind === "chat" ? (
                    /* 聊天对话：描述场景 → AI 生成 角色卡 + 种子对话 */
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm text-gray-300">{t("arena.scenarioEditor.chatPlatformLabel")}</span>
                        <select
                          value={platform}
                          onChange={(e) => setPlatform(e.target.value)}
                          className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                        >
                          {CHAT_PLATFORM_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {t(`arena.scenarioEditor.${o.labelKey}`)}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="block text-sm font-medium text-gray-200">
                        {t("arena.scenarioEditor.sceneDescLabel")}
                      </label>
                      <textarea
                        value={sceneDesc}
                        onChange={(e) => setSceneDesc(e.target.value)}
                        placeholder={t("arena.scenarioEditor.sceneDescPlaceholder")}
                        rows={3}
                        className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        disabled={aiBusy}
                        onClick={handleGenerateScene}
                        className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                      >
                        {aiBusy ? t("arena.scenarioEditor.generating") : t("arena.scenarioEditor.generateSceneButton")}
                      </button>
                      <p className="text-xs text-gray-500">{t("arena.scenarioEditor.optionGenerateChatDesc")}</p>
                    </div>
                  ) : (
                  <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-gray-300">{t("arena.scenarioEditor.intensityLabel")}</span>
                    <select
                      value={intensity}
                      onChange={(e) => setIntensity(e.target.value as Intensity)}
                      className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                    >
                      {INTENSITY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {t(`arena.scenarioEditor.${o.labelKey}`)}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* B-1：用话题生成 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-200">
                      {t("arena.scenarioEditor.topicInputLabel")}
                    </label>
                    <textarea
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      placeholder={t("arena.scenarioEditor.topicPlaceholder")}
                      rows={3}
                      className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={aiBusy}
                      onClick={handleGenerate}
                      className="rounded-xl border border-cyan-600 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
                    >
                      {aiBusy ? t("arena.scenarioEditor.generating") : t("arena.scenarioEditor.generateFromTopic")}
                    </button>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="h-px flex-1 bg-gray-800" />
                    {t("arena.scenarioEditor.orDivider")}
                    <span className="h-px flex-1 bg-gray-800" />
                  </div>

                  {/* B-2：上传文本文档生成 */}
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-200">
                      {t("arena.scenarioEditor.generateFromUpload")}
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="cursor-pointer rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                        {t("arena.scenarioEditor.selectTextFile")}
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
                        {aiBusy ? t("arena.scenarioEditor.generating") : t("arena.scenarioEditor.generateTemplate")}
                      </button>
                      {uploadFileName && (
                        <span className="text-xs text-gray-400">
                          {t("arena.scenarioEditor.fileWithChars", { name: uploadFileName, count: uploadSourceText.length })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{t("arena.scenarioEditor.uploadHint")}</p>
                  </div>

                  {captureSourceText && (
                    <div className="rounded-xl border border-cyan-900/60 bg-cyan-950/20 p-3 space-y-1">
                      <div className="text-sm font-medium text-cyan-100">
                        {t("arena.scenarioEditor.captureMaterial", { count: captureSourceText.length })}
                      </div>
                      <p className="text-xs text-cyan-200/70">{t("arena.scenarioEditor.captureMaterialHint")}</p>
                    </div>
                  )}
                  </>
                  )}
                </div>
              )}
            </div>
          </div>

          <p className="mt-4 text-xs text-gray-500">{t("arena.scenarioEditor.manualCreateHint")}</p>
          {comments.length > 0 && (
            <p className="mt-2 text-xs text-cyan-300/80">
              {t("arena.scenarioEditor.step1DoneHint", { count: comments.length })}
            </p>
          )}

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-xl bg-white px-5 py-2 font-semibold text-black hover:bg-gray-200"
            >
              {t(sceneKind === "chat" ? "arena.scenarioEditor.nextStepToChat" : "arena.scenarioEditor.nextStepToComments")} →
            </button>
          </div>
        </div>
      )}

      {/* ══════════ 第二步：编辑评论区 ══════════ */}
      {step === 2 && (
        <div className="mt-6">
          <div className="grid gap-4 lg:grid-cols-[1.3fr,0.9fr]">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  {t(sceneKind === "chat" ? "arena.scenarioEditor.step2TitleChat" : "arena.scenarioEditor.step2Title")}
                </h2>
                <p className="mt-1 text-sm text-gray-400">
                  {t(sceneKind === "chat" ? "arena.scenarioEditor.stepIntro2Chat" : "arena.scenarioEditor.stepIntro2")}
                </p>
              </div>

              {sceneKind === "chat" ? (
                <>
                  {/* ── 角色卡编辑（chat）── */}
                  <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-white">
                        {t("arena.scenarioEditor.rolesEditor")}
                        <span className="ml-2 rounded-full border border-gray-700 px-2 py-0.5 text-[11px] font-normal text-gray-400">
                          {t("arena.scenarioEditor.participantCountBadge", { count: participants.length })}
                        </span>
                      </h3>
                      <button
                        type="button"
                        onClick={addParticipant}
                        className="rounded-lg border border-cyan-700 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-950/30"
                      >
                        + {t("arena.scenarioEditor.addParticipant")}
                      </button>
                    </div>

                    {participants.length === 0 ? (
                      <p className="text-sm text-gray-400">{t("arena.scenarioEditor.noParticipantsYet")}</p>
                    ) : (
                      <>
                        {!participants.some((p) => p.isSelf) && (
                          <p className="text-xs text-amber-300/80">{t("arena.scenarioEditor.noSelfHint")}</p>
                        )}
                        <div className="space-y-3">
                          {participants.map((p, index) => (
                            <div key={p.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-gray-500">#{index + 1}</span>
                                <button
                                  type="button"
                                  onClick={() => removeParticipant(p.id)}
                                  className="text-xs text-rose-300 hover:text-rose-200"
                                >
                                  {t("arena.scenarioEditor.delete")}
                                </button>
                              </div>

                              <div className="grid gap-2 sm:grid-cols-3">
                                <input
                                  value={p.avatar || ""}
                                  onChange={(e) => updateParticipant(p.id, { avatar: e.target.value })}
                                  placeholder={t("arena.scenarioEditor.participantAvatarPlaceholder")}
                                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                                />
                                <input
                                  value={p.name}
                                  onChange={(e) => updateParticipant(p.id, { name: e.target.value })}
                                  placeholder={t("arena.scenarioEditor.participantNamePlaceholder")}
                                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                                />
                                <input
                                  value={p.role || ""}
                                  onChange={(e) => updateParticipant(p.id, { role: e.target.value })}
                                  placeholder={t("arena.scenarioEditor.participantRolePlaceholder")}
                                  className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                                />
                              </div>

                              <textarea
                                value={p.goal || ""}
                                onChange={(e) => updateParticipant(p.id, { goal: e.target.value })}
                                placeholder={t("arena.scenarioEditor.participantGoalPlaceholder")}
                                rows={2}
                                className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                              />

                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <label className="flex items-center gap-2 text-xs text-gray-300">
                                  <input
                                    type="radio"
                                    name="scenario-self"
                                    checked={!!p.isSelf}
                                    onChange={() => setSelfParticipant(p.id)}
                                  />
                                  {t("arena.scenarioEditor.setAsSelf")}
                                </label>

                                {/* 人格绑定：只对 AI 扮演的角色（非「我」）有意义 */}
                                {!p.isSelf &&
                                  (p.personaId ? (
                                    <span className="flex min-w-0 items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-xs text-purple-200">
                                      <span className="truncate">🎭 {p.personaName || t("arena.scenarioEditor.unnamed")}</span>
                                      <button
                                        type="button"
                                        onClick={() => unbindPersona(p.id)}
                                        title={t("arena.scenarioEditor.unbindPersona")}
                                        className="shrink-0 text-purple-300/70 hover:text-purple-100"
                                      >
                                        ✕
                                      </button>
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setPersonaPickerFor(p.id)}
                                      className="rounded-lg border border-purple-700/60 px-2.5 py-1 text-xs text-purple-200 hover:bg-purple-950/30"
                                    >
                                      🎭 {t("arena.scenarioEditor.bindPersona")}
                                    </button>
                                  ))}
                              </div>
                              {!p.isSelf && p.personaId && (
                                <p className="text-[11px] text-purple-200/50">
                                  {t("arena.scenarioEditor.personaBoundHint")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </section>

                  {/* ── 种子对话编辑（chat）── */}
                  <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-white">
                        {t("arena.scenarioEditor.messagesEditor")}
                        <span className="ml-2 rounded-full border border-gray-700 px-2 py-0.5 text-[11px] font-normal text-gray-400">
                          {t("arena.scenarioEditor.messageCountBadge", { count: chatMessages.length })}
                        </span>
                      </h3>
                      <button
                        type="button"
                        onClick={addChatMessage}
                        className="rounded-lg border border-cyan-700 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-950/30"
                      >
                        + {t("arena.scenarioEditor.addMessage")}
                      </button>
                    </div>

                    {chatMessages.length === 0 ? (
                      <p className="text-sm text-gray-400">{t("arena.scenarioEditor.noMessagesYet")}</p>
                    ) : (
                      <div className="space-y-3">
                        {chatMessages.map((m, index) => (
                          <div key={m.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-3 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="text-xs text-gray-500">#{index + 1}</span>
                                <select
                                  value={m.senderId || ""}
                                  onChange={(e) => updateChatMessage(m.id, { senderId: e.target.value })}
                                  aria-label={t("arena.scenarioEditor.senderLabel")}
                                  className="rounded-lg bg-gray-950/50 border border-gray-800 px-2 py-1.5 text-xs"
                                >
                                  <option value="">{t("arena.scenarioEditor.unknownSenderOption")}</option>
                                  {participants.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {(p.name || t("arena.scenarioEditor.unnamed")) +
                                        (p.isSelf ? ` · ${t("arena.scenarioPlay.me")}` : "")}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => moveChatMessage(m.id, -1)}
                                  disabled={index === 0}
                                  className="text-xs text-gray-300 hover:text-white disabled:opacity-40"
                                >
                                  ↑ {t("arena.scenarioEditor.moveUp")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveChatMessage(m.id, 1)}
                                  disabled={index === chatMessages.length - 1}
                                  className="text-xs text-gray-300 hover:text-white disabled:opacity-40"
                                >
                                  ↓ {t("arena.scenarioEditor.moveDown")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => removeChatMessage(m.id)}
                                  className="text-xs text-rose-300 hover:text-rose-200"
                                >
                                  {t("arena.scenarioEditor.delete")}
                                </button>
                              </div>
                            </div>

                            <textarea
                              value={m.text}
                              onChange={(e) => updateChatMessage(m.id, { text: e.target.value })}
                              placeholder={t("arena.scenarioEditor.messageTextPlaceholder")}
                              rows={2}
                              className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </>
              ) : (
              <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-white">
                    {t("arena.scenarioEditor.commentEditor")}
                    <span className="ml-2 rounded-full border border-gray-700 px-2 py-0.5 text-[11px] font-normal text-gray-400">
                      {t("arena.scenarioEditor.commentCountBadge", { count: comments.length })}
                    </span>
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={clearOP}
                      className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                    >
                      {t("arena.scenarioEditor.clearOP")}
                    </button>
                    <button
                      type="button"
                      onClick={addComment}
                      className="rounded-lg border border-cyan-700 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-950/30"
                    >
                      + {t("arena.scenarioEditor.addComment")}
                    </button>
                  </div>
                </div>

                <p className="text-xs text-amber-300/80">{t("arena.scenarioEditor.privacyNotice")}</p>

                {comments.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("arena.scenarioEditor.noCommentsYet")}</p>
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
                            {t("arena.scenarioEditor.delete")}
                          </button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <input
                            value={c.authorName}
                            onChange={(e) => updateComment(c.id, { authorName: e.target.value })}
                            placeholder={t("arena.scenarioEditor.accountNamePlaceholder")}
                            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                          />
                          <select
                            value={c.parentId || ""}
                            onChange={(e) => updateComment(c.id, { parentId: e.target.value || null })}
                            className="rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                          >
                            <option value="">{t("arena.scenarioEditor.topLevelOption")}</option>
                            {comments
                              .filter((other) => other.id !== c.id)
                              .map((other) => (
                                <option key={other.id} value={other.id}>
                                  {t("arena.scenarioEditor.replyToOption", { name: other.authorName || t("arena.scenarioEditor.unnamed"), text: snippet(other.text) })}
                                </option>
                              ))}
                          </select>
                        </div>

                        <textarea
                          value={c.text}
                          onChange={(e) => updateComment(c.id, { text: e.target.value })}
                          placeholder={t("arena.scenarioEditor.commentContentPlaceholder")}
                          rows={2}
                          className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                        />

                        <input
                          value={c.stance || ""}
                          onChange={(e) => updateComment(c.id, { stance: e.target.value })}
                          placeholder={t("arena.scenarioEditor.stancePlaceholder")}
                          className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2 text-sm"
                        />

                        <label className="flex items-center gap-2 text-xs text-gray-300">
                          <input
                            type="radio"
                            name="scenario-op"
                            checked={!!c.isOP}
                            onChange={() => setOP(c.id)}
                          />
                          {t("arena.scenarioEditor.setAsOP")}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              )}

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
                >
                  ← {t("arena.scenarioEditor.prevStep")}
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-xl bg-white px-5 py-2 font-semibold text-black hover:bg-gray-200"
                >
                  {t("arena.scenarioEditor.nextStepToInfo")} →
                </button>
              </div>
            </div>

            {previewPanel}
          </div>
        </div>
      )}

      {/* ══════════ 第三步：完善信息并发布 ══════════ */}
      {step === 3 && (
        <div className="mt-6">
          <div className="grid gap-4 lg:grid-cols-[1.3fr,0.9fr]">
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{t("arena.scenarioEditor.step3Title")}</h2>
                <p className="mt-1 text-sm text-gray-400">{t("arena.scenarioEditor.stepIntro3")}</p>
              </div>

              {/* AI 分析并自动填写 */}
              <section className="rounded-2xl border border-cyan-900/60 bg-cyan-950/10 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-cyan-100">{t("arena.scenarioEditor.aiAutoFillTitle")}</h3>
                    <p className="mt-1 text-sm text-cyan-200/70">{t("arena.scenarioEditor.aiAutoFillDesc")}</p>
                  </div>
                  <button
                    type="button"
                    disabled={aiMetaBusy}
                    onClick={handleAnalyze}
                    className="flex-none rounded-xl border border-cyan-500 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-50 hover:bg-cyan-500/25 disabled:opacity-60"
                  >
                    {aiMetaBusy ? t("arena.scenarioEditor.aiAutoFilling") : "✨ " + t("arena.scenarioEditor.aiAutoFillButton")}
                  </button>
                </div>
                <p className="mt-2 text-xs text-cyan-200/50">{t("arena.scenarioEditor.orFillManually")}</p>
              </section>

              {/* 基本信息（手动） */}
              <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-3">
                <h3 className="text-base font-semibold text-white">{t("arena.scenarioEditor.basicInfo")}</h3>

                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t("arena.scenarioEditor.titlePlaceholder")}
                  className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                />
                <textarea
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder={t("arena.scenarioEditor.summaryPlaceholder")}
                  rows={2}
                  className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                />
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder={t("arena.scenarioEditor.topicPlaceholder")}
                  rows={3}
                  className="w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                />

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm text-gray-300">
                    {t("arena.scenarioEditor.platformSkin")}
                    {/* 平台选项按 sceneKind 分列表：chat 对应聊天皮肤注册表、comment 对应评论皮肤注册表 */}
                    <select
                      value={platform}
                      onChange={(e) => setPlatform(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                    >
                      {(sceneKind === "chat" ? CHAT_PLATFORM_OPTIONS : PLATFORM_OPTIONS).map((p) => (
                        <option key={p.value} value={p.value}>
                          {t(`arena.scenarioEditor.${p.labelKey}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-300">
                    {t("arena.scenarioEditor.categoryLabel")}
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="mt-1 w-full rounded-xl bg-gray-950/50 border border-gray-800 px-3 py-2"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.value} value={c.value}>
                          {t(`arena.scenarioEditor.${c.labelKey}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-sm text-gray-300 sm:col-span-2">
                    {t("arena.scenarioEditor.tagsLabel")}
                    <input
                      value={tagsText}
                      onChange={(e) => setTagsText(e.target.value)}
                      placeholder={t("arena.scenarioEditor.tagsPlaceholder")}
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
                    {t("arena.scenarioEditor.publishToSquare")}
                  </label>
                  <label className="cursor-pointer rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                    {uploading ? t("arena.scenarioEditor.uploading") : t("arena.scenarioEditor.uploadCover")}
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
                  <img src={coverImageUrl} alt={t("arena.scenarioEditor.coverAlt")} className="h-44 w-full rounded-xl border border-gray-800 object-cover" />
                )}
              </section>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="rounded-xl border border-gray-700 px-4 py-2 text-sm text-gray-200 hover:bg-gray-800"
                >
                  ← {t("arena.scenarioEditor.prevStep")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="rounded-xl bg-white px-5 py-2 font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
                >
                  {saving ? t("arena.scenarioEditor.saving") : isEdit ? t("arena.scenarioEditor.saveChanges") : t("arena.scenarioEditor.publishScenario")}
                </button>
              </div>
            </div>

            {previewPanel}
          </div>
        </div>
      )}

      {/* 人格选择器（chat 角色卡「绑定人格」打开；引用语义见 bindPersona 注释） */}
      <PersonaPickerModal
        open={!!personaPickerFor}
        onClose={() => setPersonaPickerFor(null)}
        onSelect={(persona) => {
          if (personaPickerFor) bindPersona(personaPickerFor, persona);
        }}
      />
    </div>
  );
}
