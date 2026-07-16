/**
 * @file MemeLibraryPage.tsx - 表情 / 梗图库 · 素材广场
 * @category Page
 * @route /arena/memes
 * @i18n none（页面内容以中文为主，与 PersonaGalleryPage / ScenarioGalleryPage 一致）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 公开素材广场：tab 公开素材库(library) / 我的收藏(mine，登录才显示)
 * - 搜索(q) + 标签精确过滤 + 分页
 * - 网格展示 meme（image 缩略图含 onError 占位 / text 大字梗卡片）+ title + tags + 🔖collectCount
 * - 每个 meme：收藏/取消收藏（乐观更新）、作者可删除
 * - 顶部「+ 上传梗图/表情」打开创意工坊内联表单（image 上传/贴 URL、text 梗文本、title、tags、是否公开）
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { ImageOff, Plus, Trash2, X } from "lucide-react";
import {
  apiUploadImage,
  collectMeme,
  createMeme,
  deleteMeme,
  listMemes,
  uncollectMeme,
  type Meme,
} from "../api";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";

type Scope = "library" | "mine";
type MemeType = "image" | "text";

const SCOPE_TABS: { key: Scope; label: string; auth?: boolean }[] = [
  { key: "library", label: "公开素材库" },
  { key: "mine", label: "我的收藏", auth: true },
];

function authorName(author: Meme["author"]) {
  if (!author) return "-";
  return typeof author === "string" ? author : author.username || "-";
}

function MemeCard({
  meme,
  onCollect,
  onDelete,
  onTagClick,
}: {
  meme: Meme;
  onCollect: (meme: Meme) => void;
  onDelete: (meme: Meme) => void;
  onTagClick: (tag: string) => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-3">
      <div className="relative flex h-40 items-center justify-center overflow-hidden rounded-xl border border-gray-800 bg-gray-950/50">
        {meme.type === "image" ? (
          imgError || !meme.imageUrl ? (
            <div className="flex flex-col items-center gap-1 text-gray-600">
              <ImageOff className="h-6 w-6" />
              <span className="text-[11px]">图片无法加载</span>
            </div>
          ) : (
            <img
              src={meme.imageUrl}
              alt={meme.title}
              loading="lazy"
              className="h-full w-full object-contain"
              onError={() => setImgError(true)}
            />
          )
        ) : (
          <p className="line-clamp-3 px-3 text-center text-lg font-bold leading-snug text-white">
            {meme.text || meme.title}
          </p>
        )}
      </div>

      <div className="mt-2 flex items-start justify-between gap-2">
        <h3 className="line-clamp-1 text-sm font-semibold text-white">{meme.title}</h3>
        <span className="shrink-0 text-xs text-gray-400">🔖 {meme.stats?.collectCount || 0}</span>
      </div>

      <p className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">作者：{authorName(meme.author)}</p>

      {(meme.tags || []).length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-cyan-200">
          {(meme.tags || []).slice(0, 4).map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagClick(tag)}
              className="rounded-full border border-cyan-700/60 px-2 py-0.5 hover:bg-cyan-950/40"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onCollect(meme)}
          className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-medium ${
            meme.collected
              ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20"
              : "border-gray-700 text-gray-200 hover:bg-gray-800"
          }`}
        >
          {meme.collected ? "已收藏" : "收藏"}
        </button>
        {meme.isOwner && (
          <button
            type="button"
            onClick={() => onDelete(meme)}
            className="rounded-lg border border-gray-700 p-1.5 text-gray-400 hover:bg-gray-800 hover:text-rose-300"
            title="删除"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MemeLibraryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  const rawScope = (params.get("scope") || "library") as Scope;
  // mine 需登录，未登录一律当 library 处理
  const scope: Scope = !user && rawScope === "mine" ? "library" : rawScope;
  const q = params.get("q") || "";
  const tag = params.get("tag") || "";
  const page = Math.max(parseInt(params.get("page") || "1", 10) || 1, 1);

  const [searchInput, setSearchInput] = useState(q);
  const [loading, setLoading] = useState(true);
  const [memes, setMemes] = useState<Meme[]>([]);
  const [totalPages, setTotalPages] = useState(1);

  // 创意工坊上传表单
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formType, setFormType] = useState<MemeType>("image");
  const [imageUrl, setImageUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [shared, setShared] = useState(true);

  useEffect(() => {
    setSearchInput(q);
  }, [q]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await listMemes({ scope, q, tag, page, limit: 24 });
        if (!mounted) return;
        setMemes(res.memes || []);
        setTotalPages(res.totalPages || 1);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [scope, q, tag, page]);

  function setScope(nextScope: Scope) {
    const next = new URLSearchParams(params);
    next.set("scope", nextScope);
    next.set("page", "1");
    setParams(next);
  }

  function submitSearch() {
    const next = new URLSearchParams(params);
    next.set("page", "1");
    if (searchInput.trim()) next.set("q", searchInput.trim());
    else next.delete("q");
    setParams(next);
  }

  function pickTag(nextTag: string) {
    const next = new URLSearchParams(params);
    next.set("tag", nextTag);
    next.set("page", "1");
    setParams(next);
  }

  function clearTag() {
    const next = new URLSearchParams(params);
    next.delete("tag");
    next.set("page", "1");
    setParams(next);
  }

  function goPage(nextPage: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(nextPage));
    setParams(next);
  }

  async function handleToggleCollect(meme: Meme) {
    if (!user) {
      toast.error("请先登录再收藏");
      navigate("/login?next=/arena/memes");
      return;
    }
    const wasCollected = !!meme.collected;
    // 乐观更新
    setMemes((prev) =>
      prev.map((m) =>
        m._id === meme._id
          ? {
              ...m,
              collected: !wasCollected,
              stats: {
                ...m.stats,
                collectCount: Math.max(0, (m.stats?.collectCount || 0) + (wasCollected ? -1 : 1)),
              },
            }
          : m
      )
    );
    try {
      const res = wasCollected ? await uncollectMeme(meme._id) : await collectMeme(meme._id);
      setMemes((prev) =>
        prev.map((m) =>
          m._id === meme._id
            ? { ...m, collected: res.collected, stats: { ...m.stats, collectCount: res.collectCount } }
            : m
        )
      );
    } catch (e) {
      // 回滚
      setMemes((prev) =>
        prev.map((m) =>
          m._id === meme._id
            ? {
                ...m,
                collected: wasCollected,
                stats: {
                  ...m.stats,
                  collectCount: Math.max(0, (m.stats?.collectCount || 0) + (wasCollected ? 1 : -1)),
                },
              }
            : m
        )
      );
      toast.error(humanizeError(e));
    }
  }

  async function handleDelete(meme: Meme) {
    if (!window.confirm(`确定删除「${meme.title}」？此操作不可撤销。`)) return;
    try {
      await deleteMeme(meme._id);
      setMemes((prev) => prev.filter((m) => m._id !== meme._id));
      toast.success("已删除");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    try {
      setUploading(true);
      const res = await apiUploadImage(file, "comment");
      setImageUrl(res.imageUrl);
      toast.success("图片已上传");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setUploading(false);
    }
  }

  function resetForm() {
    setFormType("image");
    setImageUrl("");
    setText("");
    setTitle("");
    setTagsInput("");
    setShared(true);
  }

  async function handleSubmit() {
    if (!user) {
      toast.error("请先登录再上传");
      navigate("/login?next=/arena/memes");
      return;
    }
    if (!title.trim()) {
      toast.error("请填写标题");
      return;
    }
    if (formType === "image" && !imageUrl.trim()) {
      toast.error("请上传图片或填写图片链接");
      return;
    }
    if (formType === "text" && !text.trim()) {
      toast.error("请输入梗文本");
      return;
    }
    const tags = tagsInput
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean);
    try {
      setSaving(true);
      const res = await createMeme({
        type: formType,
        imageUrl: formType === "image" ? imageUrl.trim() : undefined,
        text: formType === "text" ? text.trim() : undefined,
        title: title.trim(),
        tags,
        shared,
      });
      // 创建即自动收藏给作者，并入列表顶部
      setMemes((prev) => [res.meme, ...prev]);
      toast.success("已上传到素材库");
      resetForm();
      setShowForm(false);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSaving(false);
    }
  }

  const visibleTabs = SCOPE_TABS.filter((t) => !t.auth || user);

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/arena" className="text-sm text-gray-400 hover:text-white">
            ← 返回卢本伟广场
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">表情 / 梗图库</h1>
          <p className="mt-1 text-sm text-gray-400">
            浏览公开素材库、收藏你喜欢的表情梗图，或在创意工坊上传贡献。装了浏览器插件后即可在任意评论框旁一键搜索插入。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!user) {
              toast.error("请先登录再上传");
              navigate("/login?next=/arena/memes");
              return;
            }
            setShowForm((v) => !v);
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 font-semibold text-black hover:bg-gray-200"
        >
          <Plus className="h-4 w-4" /> 上传梗图/表情
        </button>
      </div>

      {showForm && (
        <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-white">创意工坊 · 上传素材</h2>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            {(["image", "text"] as MemeType[]).map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setFormType(tp)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  formType === tp ? "border-white text-white" : "border-gray-700 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {tp === "image" ? "图片表情" : "文字梗"}
              </button>
            ))}
          </div>

          {formType === "image" ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800">
                  {uploading ? "上传中…" : "上传图片"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => handleUpload(e.target.files?.[0] || null)}
                  />
                </label>
                <span className="text-xs text-gray-500">或直接粘贴图片链接</span>
              </div>
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
                placeholder="图片 URL，如 https://…"
              />
              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="预览"
                  className="max-h-40 rounded-xl border border-gray-800 object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
          ) : (
            <div className="mt-4">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
                placeholder="输入梗 / 短语，如：这就是你不对了啊朋友"
              />
            </div>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
              placeholder="标题（必填）"
            />
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
              placeholder="标签，用逗号分隔，如：搞笑,狗头"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
              发布到公开素材库（其他人可搜索/收藏）
            </label>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || uploading}
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-50"
            >
              {saving ? "上传中…" : "上传到素材库"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {visibleTabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setScope(t.key)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  scope === t.key ? "border-white text-white" : "border-gray-700 text-gray-300 hover:bg-gray-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitSearch();
              }}
              className="rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm"
              placeholder="搜索标题 / 梗文本 / 标签"
            />
            <button
              type="button"
              onClick={submitSearch}
              className="rounded-xl border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-800"
            >
              搜索
            </button>
          </div>
        </div>

        {tag && (
          <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
            <span>标签筛选：</span>
            <button
              type="button"
              onClick={clearTag}
              className="rounded-full border border-cyan-700/60 bg-cyan-950/30 px-2 py-0.5 text-cyan-200 hover:bg-cyan-950/50"
            >
              #{tag} ✕
            </button>
          </div>
        )}

        {loading && <p className="mt-4 text-sm text-gray-400">加载中…</p>}
        {!loading && memes.length === 0 && (
          <div className="mt-6 rounded-xl border border-dashed border-gray-800 bg-gray-950/40 p-8 text-center">
            <p className="text-sm text-gray-400">
              {scope === "mine"
                ? "你还没有收藏任何素材，去公开素材库逛逛并收藏喜欢的表情梗图。"
                : "这里还没有素材，点击右上角「上传梗图/表情」来贡献第一个吧。"}
            </p>
          </div>
        )}

        {!loading && memes.length > 0 && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {memes.map((m) => (
              <MemeCard
                key={m._id}
                meme={m}
                onCollect={handleToggleCollect}
                onDelete={handleDelete}
                onTagClick={pickTag}
              />
            ))}
          </div>
        )}

        {!loading && memes.length > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => goPage(page - 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              上一页
            </button>
            <span className="text-sm text-gray-400">
              第 {page} / {totalPages} 页
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => goPage(page + 1)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm disabled:opacity-40"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
