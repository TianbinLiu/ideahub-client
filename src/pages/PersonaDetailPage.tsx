/**
 * @file PersonaDetailPage.tsx - 人格下载 · 人格详情/介绍页
 * @category Page
 * @route /arena/persona/:id
 * @i18n none（页面内容以中文为主）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 公开介绍页：coverEmoji/name/description/作者/tags/stats
 * - 用 <StyleStandCard> 展示由 persona.style 组装成的 SpeakingProfile 风格雷达
 * - 操作（需登录）：下载收藏/取消收藏（乐观更新 downloadCount）、点赞（toggle）、装备（equip）
 * - 装备成功后写 localStorage 'lbw_active_persona' = {name, descriptor} 供插件读取
 * - 作者可编辑/删除；未登录操作引导登录
 * - 页面下方 <CommentThread targetType="persona">：给大家讨论这个人格用的评论区
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import { Download, Heart, Pencil, Sparkles, Trash2 } from "lucide-react";
import {
  deletePersona,
  equipPersona,
  getPersona,
  installPersona,
  purchasePersona,
  togglePersonaLike,
  uninstallPersona,
  type Persona,
  type SpeakingProfile,
} from "../api";
import StyleStandCard from "../components/StyleStandCard";
import CommentThread from "../components/CommentThread";
import PersonaCover from "../components/PersonaCover";
import { humanizeError } from "../utils/humanizeError";
import { useAuth } from "../authContext";

const ACTIVE_PERSONA_KEY = "lbw_active_persona";

function authorName(author: Persona["author"]) {
  if (!author) return "-";
  return typeof author === "string" ? author : author.username || "-";
}

function authorId(author: Persona["author"]) {
  if (!author) return "";
  return typeof author === "string" ? author : author._id;
}

/** 由 persona.style 组装成 StyleStandCard 需要的 SpeakingProfile 形状 */
function toProfile(persona: Persona): SpeakingProfile {
  return {
    summary: persona.style?.summary || "",
    catchphrases: persona.style?.catchphrases || [],
    stats: persona.style?.stats || [],
    sampleCount: 0,
    generatedAt: persona.createdAt,
  };
}

export default function PersonaDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [persona, setPersona] = useState<Persona | null>(null);
  const [equipping, setEquipping] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getPersona(id);
        if (mounted) setPersona(res.persona);
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
    toast.error(t("arena.personaDetail.loginRequired"));
    navigate(`/login?next=/arena/persona/${id}`);
  }

  /** 购买付费人格（永久解锁选用权：装备/绑进情景） */
  async function handlePurchase() {
    if (!id || !persona) return;
    if (!user) return requireLogin();
    try {
      setPurchasing(true);
      const res = await purchasePersona(id, persona.price || 0);
      setPersona((p) => (p ? { ...p, purchased: true } : p));
      toast.success(
        res.alreadyOwned
          ? t("arena.personaDetail.alreadyOwned")
          : t("arena.personaDetail.purchased", { price: res.price })
      );
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setPurchasing(false);
    }
  }

  async function handleInstall() {
    if (!id || !persona) return;
    if (!user) return requireLogin();
    const prev = persona;
    const nextInstalled = !persona.installed;
    setPersona({
      ...persona,
      installed: nextInstalled,
      stats: {
        ...persona.stats,
        downloadCount: Math.max(0, persona.stats.downloadCount + (nextInstalled ? 1 : -1)),
      },
    });
    try {
      const res = nextInstalled ? await installPersona(id) : await uninstallPersona(id);
      setPersona((p) =>
        p ? { ...p, installed: res.installed, stats: { ...p.stats, downloadCount: res.downloadCount } } : p
      );
    } catch (e) {
      setPersona(prev);
      toast.error(humanizeError(e));
    }
  }

  async function handleLike() {
    if (!id || !persona) return;
    if (!user) return requireLogin();
    const prev = persona;
    const nextLiked = !persona.liked;
    setPersona({
      ...persona,
      liked: nextLiked,
      stats: { ...persona.stats, likeCount: Math.max(0, persona.stats.likeCount + (nextLiked ? 1 : -1)) },
    });
    try {
      const res = await togglePersonaLike(id);
      setPersona((p) => (p ? { ...p, liked: res.liked, stats: { ...p.stats, likeCount: res.likeCount } } : p));
    } catch (e) {
      setPersona(prev);
      toast.error(humanizeError(e));
    }
  }

  async function handleEquip() {
    if (!id || !persona) return;
    if (!user) return requireLogin();
    try {
      setEquipping(true);
      const res = await equipPersona(id);
      const eq = res.equipped;
      // 写入插件桥：装备后由插件读取该 localStorage 键
      localStorage.setItem(
        ACTIVE_PERSONA_KEY,
        JSON.stringify({ name: persona.name, descriptor: persona.styleDescriptor })
      );
      // 通知浏览器插件即时重新同步已装备的人格（无需刷新页面）
      window.dispatchEvent(new CustomEvent("lbw:persona-equipped"));
      setPersona((p) => {
        if (!p) return p;
        const merged = eq && eq._id === p._id ? { ...p, ...eq } : p;
        return { ...merged, equipped: true, installed: true };
      });
      toast.success(t("arena.personaDetail.equippedToast"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setEquipping(false);
    }
  }

  async function handleUnequip() {
    if (!persona) return;
    if (!user) return requireLogin();
    try {
      setEquipping(true);
      await equipPersona(null);
      // 切回本人风格：清除插件桥
      localStorage.setItem(ACTIVE_PERSONA_KEY, JSON.stringify({ name: "self", descriptor: "" }));
      window.dispatchEvent(new CustomEvent("lbw:persona-equipped"));
      setPersona((p) => (p ? { ...p, equipped: false } : p));
      toast.success(t("arena.personaDetail.switchedBackToast"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setEquipping(false);
    }
  }

  async function handleDelete() {
    if (!id || !persona) return;
    if (typeof window !== "undefined" && !window.confirm(t("arena.personaDetail.deleteConfirm"))) return;
    try {
      await deletePersona(id);
      toast.success(t("arena.personaDetail.deleted"));
      navigate("/arena/persona");
    } catch (e) {
      toast.error(humanizeError(e));
    }
  }

  if (loading) return <div className="mx-auto max-w-6xl p-4 text-gray-300">{t("arena.personaDetail.loading")}</div>;
  if (!persona)
    return (
      <div className="mx-auto max-w-6xl p-4">
        <p className="text-gray-400">{t("arena.personaDetail.notFound")}</p>
        <Link to="/arena/persona" className="mt-3 inline-block text-sm text-cyan-300 hover:underline">
          ← {t("arena.personaDetail.backToPersonas")}
        </Link>
      </div>
    );

  const isOwner = Boolean(persona.isOwner || (user && authorId(persona.author) === user._id));

  return (
    <div className="mx-auto max-w-5xl p-4 pb-20">
      <Link to="/arena/persona" className="text-sm text-gray-400 hover:text-white">
        ← {t("arena.personaDetail.backToPersonas")}
      </Link>

      <div className="mt-3 space-y-4">
        {/* ===== 头部信息卡 ===== */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="flex items-start gap-4">
            <PersonaCover emoji={persona.coverEmoji} imageUrl={persona.coverImageUrl} sizeClass="h-20 w-20" emojiClass="text-6xl" alt={persona.name} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-white">{persona.name}</h1>
                {persona.equipped ? (
                  <span className="rounded-full border border-cyan-500/60 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
                    {t("arena.personaDetail.equippedBadge")}
                  </span>
                ) : persona.installed ? (
                  <span className="rounded-full border border-gray-700 bg-gray-800/60 px-2.5 py-0.5 text-xs text-gray-300">
                    {t("arena.personaDetail.savedBadge")}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-gray-400">
                {t("arena.personaDetail.authorLabel", { name: authorName(persona.author) })}
              </p>
            </div>
          </div>

          {persona.description ? (
            <p className="mt-3 text-gray-300">{persona.description}</p>
          ) : (
            <p className="mt-3 text-gray-500">{t("arena.personaDetail.noDescription")}</p>
          )}

          {(persona.tags || []).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-cyan-200">
              {(persona.tags || []).map((tag) => (
                <span key={tag} className="rounded-full border border-cyan-700/60 px-2 py-1">
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <span className="inline-flex items-center gap-1">👀 {persona.stats.viewCount}</span>
            <span className="inline-flex items-center gap-1">🎭 {persona.stats.downloadCount}</span>
            <span className="inline-flex items-center gap-1">❤️ {persona.stats.likeCount}</span>
            {(persona.price || 0) > 0 && (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                  persona.purchased || persona.isOwner
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-200"
                    : "border-amber-600/60 bg-amber-950/30 text-amber-300"
                }`}
              >
                {persona.purchased
                  ? t("arena.personaDetail.priceOwned")
                  : persona.isOwner
                    ? t("arena.personaDetail.priceMine", { price: persona.price })
                    : t("arena.personaDetail.priceTag", { price: persona.price })}
              </span>
            )}
          </div>

          {/* ===== 操作按钮 ===== */}
          <div className="mt-5 flex flex-wrap gap-2">
            {/* 付费未购（非作者）：装备会被后端挡（需先购买），把购买入口放最前 */}
            {(persona.price || 0) > 0 && !persona.purchased && !persona.isOwner && (
              <button
                type="button"
                disabled={purchasing}
                onClick={handlePurchase}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
              >
                💰 {purchasing
                  ? t("arena.personaDetail.purchasing")
                  : t("arena.personaDetail.purchaseButton", { price: persona.price })}
              </button>
            )}
            {persona.equipped ? (
              <button
                type="button"
                disabled={equipping}
                onClick={handleUnequip}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-950/30 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />{" "}
                {equipping ? t("arena.personaDetail.processing") : t("arena.personaDetail.switchBackStyle")}
              </button>
            ) : (
              <button
                type="button"
                disabled={equipping}
                onClick={handleEquip}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" />{" "}
                {equipping ? t("arena.personaDetail.equippingButton") : t("arena.personaDetail.equipPersona")}
              </button>
            )}
            <button
              type="button"
              onClick={handleInstall}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                persona.installed
                  ? "border-cyan-500 text-cyan-300"
                  : "border-gray-700 text-gray-200 hover:bg-gray-800"
              }`}
            >
              <Download className="h-4 w-4" />
              {persona.installed ? t("arena.personaDetail.unsave") : t("arena.personaDetail.downloadSave")}
            </button>
            <button
              type="button"
              onClick={handleLike}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm ${
                persona.liked ? "border-rose-500 text-rose-300" : "border-gray-700 text-gray-200 hover:bg-gray-800"
              }`}
            >
              <Heart className={`h-4 w-4 ${persona.liked ? "fill-rose-400" : ""}`} />
              {persona.liked ? t("arena.personaDetail.liked") : t("arena.personaDetail.like")}
            </button>
            {isOwner && (
              <>
                <Link
                  to={`/arena/persona/${persona._id}/edit`}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-700 px-4 py-2 text-sm text-cyan-300 hover:bg-cyan-950/30"
                >
                  <Pencil className="h-4 w-4" /> {t("arena.personaDetail.edit")}
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-2 rounded-xl border border-rose-800 px-4 py-2 text-sm text-rose-300 hover:bg-rose-950/30"
                >
                  <Trash2 className="h-4 w-4" /> {t("arena.personaDetail.delete")}
                </button>
              </>
            )}
          </div>

          {!user && (
            <p className="mt-3 text-xs text-gray-500">
              {t("arena.personaDetail.loginHint")}
            </p>
          )}
        </div>

        {/* ===== 风格面板 ===== */}
        <StyleStandCard profile={toProfile(persona)} />

        {/* ===== 讨论区：人格作者是版主，可删任何人的评论 ===== */}
        <CommentThread targetType="persona" targetId={persona._id} canModerate={isOwner} />
      </div>
    </div>
  );
}
