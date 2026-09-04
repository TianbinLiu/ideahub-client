/**
 * @file Live2dModelDetailPage.tsx - 模型市场 · 模型详情
 * @category Page
 * @route /live2d/market/:id
 * @i18n_module live2dMarket
 *
 * 职责:
 * - 头部：封面 / 名字 / 官方·使用中·已收藏 徽标 / 作者 / 简介 / tags / 👀 ⬇ ❤ 统计
 * - 操作：使用（PUT companion/settings modelId）/ 收藏 / 点赞；作者：编辑 / 删除（confirm）
 * - 三个板块：「Live2D 模型」（包名 / 大小 / 文件数 / model3.json 地址可复制）、「推荐人格」（人格卡 → /arena/persona/:id）、
 *   「推荐音色」（VoiceSummary）—— 和上传表单的三段一一对应
 * - 官方条目走同一页：modelJsonUrl 为空 → 显示本地打包的地址；收藏 / 点赞隐藏（服务端合成条目，install 会 400）
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Copy, Download, Heart, Pencil, Shirt, Trash2 } from "lucide-react";
import {
  COMPANION_UPDATED_EVENT,
  deleteLive2dModel,
  getLive2dModel,
  installLive2dModel,
  OFFICIAL_LIVE2D_MODEL_ID,
  toggleLive2dModelLike,
  uninstallLive2dModel,
  updateCompanionSettings,
  type Live2dModel,
} from "../api";
import { humanizeError } from "../utils/humanizeError";
import { formatBytes } from "../utils/formatBytes";
import { useAuth } from "../authContext";
import { useCompanionSettings } from "../hooks/useCompanionSettings";
import { OFFICIAL_MODEL_URL } from "../companion/modelSource";
import Live2dModelCover from "../components/Live2dModelCover";
import PersonaCover from "../components/PersonaCover";
import VoiceSummary from "../components/VoiceSummary";

function authorName(author: Live2dModel["author"]) {
  if (!author) return "-";
  return typeof author === "string" ? author : author.username || "-";
}

export default function Live2dModelDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [model, setModel] = useState<Live2dModel | null>(null);
  const [switching, setSwitching] = useState(false);
  const { settings, setSettings } = useCompanionSettings(Boolean(user));
  const activeModelId = settings?.settings.modelId || OFFICIAL_LIVE2D_MODEL_ID;

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getLive2dModel(id);
        if (mounted) setModel(res.model);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  function requireLogin() {
    toast.error(t("live2dMarket.loginRequired"));
    navigate(`/login?next=/live2d/market/${id}`);
  }

  async function handleUse() {
    if (!model) return;
    if (!user) return requireLogin();
    try {
      setSwitching(true);
      const res = await updateCompanionSettings({ modelId: model.official ? null : model._id });
      setSettings(res);
      toast.success(model.official ? t("live2dMarket.switchedOfficial") : t("live2dMarket.switched", { name: model.name }));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSwitching(false);
    }
  }

  async function handleInstall() {
    if (!model) return;
    if (!user) return requireLogin();
    const prev = model;
    const nextInstalled = !model.installed;
    setModel({
      ...model,
      installed: nextInstalled,
      stats: { ...model.stats, downloadCount: Math.max(0, model.stats.downloadCount + (nextInstalled ? 1 : -1)) },
    });
    try {
      const res = nextInstalled ? await installLive2dModel(model._id) : await uninstallLive2dModel(model._id);
      setModel((m) => (m ? { ...m, installed: res.installed, stats: { ...m.stats, downloadCount: res.downloadCount } } : m));
    } catch (e) {
      setModel(prev);
      toast.error(humanizeError(e));
    }
  }

  async function handleLike() {
    if (!model) return;
    if (!user) return requireLogin();
    const prev = model;
    const nextLiked = !model.liked;
    setModel({
      ...model,
      liked: nextLiked,
      stats: { ...model.stats, likeCount: Math.max(0, model.stats.likeCount + (nextLiked ? 1 : -1)) },
    });
    try {
      const res = await toggleLive2dModelLike(model._id);
      setModel((m) => (m ? { ...m, liked: res.liked, stats: { ...m.stats, likeCount: res.likeCount } } : m));
    } catch (e) {
      setModel(prev);
      toast.error(humanizeError(e));
    }
  }

  async function handleDelete() {
    if (!model) return;
    if (typeof window !== "undefined" && !window.confirm(t("live2dMarket.detail.deleteConfirm"))) return;
    try {
      const wasInUse = model._id === activeModelId;
      await deleteLive2dModel(model._id);
      // 删的正是自己在用的：首页舞台要知道该回到官方模型（服务端会把 modelId 清掉）
      if (wasInUse) window.dispatchEvent(new CustomEvent(COMPANION_UPDATED_EVENT));
      toast.success(t("live2dMarket.detail.deleted"));
      navigate("/live2d/market");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  }

  async function handleCopy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("live2dMarket.detail.copied"));
    } catch {
      toast.error(t("live2dMarket.detail.copyFailed"));
    }
  }

  if (loading) return <div className="mx-auto max-w-5xl p-4 text-gray-300">{t("live2dMarket.detail.loading")}</div>;
  if (!model)
    return (
      <div className="mx-auto max-w-5xl p-4">
        <p className="text-gray-400">{t("live2dMarket.detail.notFound")}</p>
        <Link to="/live2d/market" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
          ← {t("live2dMarket.detail.backToMarket")}
        </Link>
      </div>
    );

  const inUse = model._id === activeModelId;
  const modelJsonUrl = model.modelJsonUrl || (model.official ? OFFICIAL_MODEL_URL : "");
  const persona = model.persona;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-20">
      <Link to="/live2d/market" className="text-sm text-gray-400 hover:text-white">
        ← {t("live2dMarket.detail.backToMarket")}
      </Link>

      <div className="mt-3 space-y-4">
        {/* ===== 头部信息卡 ===== */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-start gap-4">
            <Live2dModelCover name={model.name} imageUrl={model.coverImageUrl} sizeClass="h-24 w-24" textClass="text-4xl" alt={model.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{model.name}</h1>
                {model.official && (
                  <span className="rounded-full border border-amber-500/60 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-200">
                    {t("live2dMarket.official")}
                  </span>
                )}
                {inUse ? (
                  <span className="rounded-full border border-cyan-500/60 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                    {t("live2dMarket.inUse")}
                  </span>
                ) : model.installed ? (
                  <span className="rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-0.5 text-xs text-gray-300">
                    {t("live2dMarket.savedBadge")}
                  </span>
                ) : null}
                {!model.shared && !model.official && (
                  <span className="rounded-full border border-gray-600 px-2.5 py-0.5 text-xs text-gray-400">
                    {t("live2dMarket.privateBadge")}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-gray-400">
                {t("live2dMarket.authorLabel", { name: model.official ? t("live2dMarket.officialAuthor") : authorName(model.author) })}
              </p>
            </div>
          </div>

          {model.description ? (
            <p className="mt-3 whitespace-pre-wrap text-gray-300">{model.description}</p>
          ) : (
            <p className="mt-3 text-gray-500">{t("live2dMarket.detail.noDescription")}</p>
          )}

          {(model.tags || []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-200">
              {(model.tags || []).map((tag) => (
                <Link key={tag} to={`/live2d/market?tag=${encodeURIComponent(tag)}`} className="rounded-full border border-cyan-700/60 px-2 py-1 hover:bg-cyan-500/10">
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <span>👀 {model.stats.viewCount}</span>
            <span>⬇ {model.stats.downloadCount}</span>
            <span>❤️ {model.stats.likeCount}</span>
          </div>

          {/* ===== 操作按钮 ===== */}
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={inUse || switching}
              onClick={handleUse}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${
                inUse ? "cursor-default border border-cyan-500/60 text-cyan-200" : "bg-white text-black hover:bg-gray-200 disabled:opacity-60"
              }`}
            >
              <Shirt className="h-4 w-4" />
              {inUse ? t("live2dMarket.inUse") : switching ? t("live2dMarket.using") : t("live2dMarket.use")}
            </button>
            {!model.official && (
              <>
                <button
                  type="button"
                  onClick={handleInstall}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                    model.installed ? "border-cyan-500 text-cyan-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
                  }`}
                >
                  <Download className="h-4 w-4" />
                  {model.installed ? t("live2dMarket.unsave") : t("live2dMarket.save")}
                </button>
                <button
                  type="button"
                  onClick={handleLike}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                    model.liked ? "border-rose-500 text-rose-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
                  }`}
                >
                  <Heart className={`h-4 w-4 ${model.liked ? "fill-rose-400" : ""}`} />
                  {model.liked ? t("live2dMarket.liked") : t("live2dMarket.like")}
                </button>
              </>
            )}
            {model.isOwner && (
              <>
                <Link
                  to={`/live2d/market/${model._id}/edit`}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-950/30"
                >
                  <Pencil className="h-4 w-4" /> {t("live2dMarket.detail.edit")}
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-800 px-4 py-2 text-sm text-rose-300 hover:bg-rose-950/30"
                >
                  <Trash2 className="h-4 w-4" /> {t("live2dMarket.detail.delete")}
                </button>
              </>
            )}
          </div>

          {!user && <p className="mt-3 text-xs text-gray-500">{t("live2dMarket.detail.loginHint")}</p>}
        </div>

        {/* ===== ① Live2D 模型 ===== */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">{t("live2dMarket.detail.bundleTitle")}</h2>
          {model.official ? (
            <p className="mt-1 text-xs text-gray-500">{t("live2dMarket.detail.officialBundleHint")}</p>
          ) : (
            <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-gray-500">{t("live2dMarket.detail.bundleName")}</dt>
              <dd className="break-all text-gray-200">{model.bundleName || "-"}</dd>
              <dt className="text-gray-500">{t("live2dMarket.detail.bundleSize")}</dt>
              <dd className="text-gray-200">{formatBytes(model.bundleBytes)}</dd>
              <dt className="text-gray-500">{t("live2dMarket.detail.fileCount")}</dt>
              <dd className="text-gray-200">{model.fileCount}</dd>
            </dl>
          )}
          {modelJsonUrl && (
            <label className="mt-3 block text-sm text-gray-300">
              {t("live2dMarket.detail.modelJsonUrl")}
              <div className="mt-1 flex gap-2">
                <input
                  readOnly
                  value={modelJsonUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-xs text-gray-300"
                />
                <button
                  type="button"
                  onClick={() => void handleCopy(modelJsonUrl)}
                  className="inline-flex items-center gap-1 rounded-xl border border-gray-700 px-3 py-2 text-xs text-gray-200 hover:bg-gray-800"
                >
                  <Copy className="h-3.5 w-3.5" /> {t("live2dMarket.detail.copy")}
                </button>
              </div>
            </label>
          )}
        </section>

        {/* ===== ② 推荐人格 ===== */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">{t("live2dMarket.detail.personaTitle")}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t("live2dMarket.detail.personaHint")}</p>
          {persona ? (
            <div className="mt-3 flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
              <PersonaCover emoji={persona.coverEmoji} imageUrl={persona.coverImageUrl} sizeClass="h-12 w-12" emojiClass="text-4xl" alt={persona.name} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/arena/persona/${persona._id}`} className="truncate text-sm font-semibold text-white hover:text-cyan-200">
                    {persona.name}
                  </Link>
                  {persona.price > 0 && (
                    <span className="rounded-full border border-amber-600/60 bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      💰 {persona.price}
                    </span>
                  )}
                </div>
                {persona.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{persona.description}</p>}
                {persona.styleDescriptor && <p className="mt-1 line-clamp-3 text-xs text-gray-500">{persona.styleDescriptor}</p>}
                <Link to={`/arena/persona/${persona._id}`} className="mt-2 inline-block text-xs text-cyan-300 hover:underline">
                  {t("live2dMarket.detail.personaView")} →
                </Link>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">{t("live2dMarket.detail.personaNone")}</p>
          )}
        </section>

        {/* ===== ③ 推荐音色 ===== */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <h2 className="text-lg font-semibold text-white">{t("live2dMarket.detail.voiceTitle")}</h2>
          <p className="mt-0.5 text-xs text-gray-500">{t("live2dMarket.detail.voiceHint")}</p>
          {model.voice ? (
            <VoiceSummary voice={model.voice} className="mt-3" />
          ) : (
            <p className="mt-3 text-sm text-gray-500">{t("live2dMarket.detail.voiceNone")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
