/**
 * @file FeedPage.tsx - 动态页（B 站式）：发布动态 + 关注的人的动态流。
 * @category Page
 * @route /feed
 * @i18n yes
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 入口 = 首页「动态」按钮（该按钮已从「切换 feed 排序」改为本页入口）
 * - 顶部发布框：一段话 + 可选配图 → 发布为 ideaType="dynamic" 的公开 idea
 *   （动态没有独立标题：取内容首行/前 30 字作 title，与「动态」类型的轻量定位一致）
 * - 关注头像横排：「全部动态」+ 逐人过滤（server 端仍限定在我的关注集合内）
 * - 动态流：GET /api/feed/following（服务端关注流，取代旧的前端 fan-out 拼接）
 * - 未登录：引导登录（页内处理，不用 ProtectedRoute 硬跳）
 */

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { ImagePlus, Radio, Send, X } from "lucide-react";
import {
  apiFetch,
  apiUploadImage,
  getFollowingFeed,
  type FeedAuthor,
  type Idea,
} from "../api";
import { useAuth } from "../authContext";
import { humanizeError } from "../utils/humanizeError";
import { formatRelativeTime } from "../utils/relativeTime";

const PAGE_SIZE = 20;

type FollowingUser = { _id: string; username?: string; displayName?: string; avatarUrl?: string };

/** 头像：有图用图，否则用户名首字符圆片 */
function Avatar({ user, sizeClass = "h-12 w-12" }: { user?: FollowingUser | FeedAuthor | null; sizeClass?: string }) {
  const name = user?.displayName || user?.username || "?";
  if (user?.avatarUrl) {
    return <img src={user.avatarUrl} alt={name} className={`${sizeClass} shrink-0 rounded-full border border-gray-700 object-cover`} />;
  }
  return (
    <span className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-sm font-semibold text-gray-200`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function FeedPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  // ── 发布框 ──
  const [draft, setDraft] = useState("");
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // ── 关注头像栏 + 流 ──
  const [following, setFollowing] = useState<FollowingUser[]>([]);
  const [filterAuthor, setFilterAuthor] = useState<string>("");
  const [ideas, setIdeas] = useState<(Idea & { author?: FeedAuthor })[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);

  useEffect(() => {
    if (!user?._id) return;
    let mounted = true;
    (async () => {
      try {
        const res = await apiFetch<{ ok: true; following: FollowingUser[] }>(`/api/users/${user._id}/following?limit=30`);
        if (mounted) setFollowing(res.following || []);
      } catch {
        // 头像栏拉不到不阻塞主流
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user?._id]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const seq = ++loadSeq.current;
    (async () => {
      try {
        setLoading(true);
        const res = await getFollowingFeed({ page, limit: PAGE_SIZE, authorId: filterAuthor || undefined });
        if (!mounted || loadSeq.current !== seq) return;
        // 追加去重（评审实锤）：翻页间隔里关注的人发了新帖，会把上一页尾部推进下一页窗口
        setIdeas((prev) => {
          if (page === 1) return res.ideas || [];
          const seen = new Set(prev.map((i) => i._id));
          return [...prev, ...(res.ideas || []).filter((i) => !seen.has(i._id))];
        });
        setTotalPages(res.totalPages || 1);
      } catch (e) {
        if (mounted && loadSeq.current === seq) toast.error(humanizeError(e));
      } finally {
        if (mounted && loadSeq.current === seq) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [user, page, filterAuthor]);

  function switchFilter(authorId: string) {
    setFilterAuthor(authorId);
    setPage(1);
  }

  async function handleDraftImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (draftImages.length >= 4) {
      toast.error(t("feedPage.imagesLimit"));
      return;
    }
    try {
      setUploading(true);
      const res = await apiUploadImage(file, "idea");
      setDraftImages((prev) => [...prev, res.imageUrl]);
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handlePublish() {
    const content = draft.trim();
    if (!content) {
      toast.error(t("feedPage.draftEmpty"));
      return;
    }
    try {
      setPublishing(true);
      // 动态没有独立标题：取首行前 30 字（server title 必填）
      const title = content.split("\n")[0].slice(0, 30) || t("feedPage.defaultTitle");
      await apiFetch<{ idea: { _id: string } }>("/api/ideas", {
        method: "POST",
        body: JSON.stringify({
          ideaType: "dynamic",
          title,
          summary: "",
          content,
          imageUrls: draftImages,
          coverImageUrl: draftImages[0] || "",
          tags: [],
          groupSlug: "world",
          visibility: "public",
          isMonetizable: false,
          isFeedback: false,
        }),
      });
      toast.success(t("feedPage.published"));
      setDraft("");
      setDraftImages([]);
      // 发布后刷新流（自己的动态在关注流里看不到——那是关注的人的；提示去主页看）
      setPage(1);
      setFilterAuthor("");
    } catch (err) {
      toast.error(humanizeError(err));
    } finally {
      setPublishing(false);
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center">
        <Radio className="mx-auto h-10 w-10 text-cyan-300" />
        <h1 className="mt-3 text-xl font-bold text-white">{t("feedPage.title")}</h1>
        <p className="mt-2 text-sm text-gray-400">{t("feedPage.loginRequired")}</p>
        <Link to="/login?next=/feed" className="mt-4 inline-block rounded-xl bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-gray-200">
          {t("feedPage.loginButton")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 pb-20">
      <h1 className="text-xl font-bold text-white">{t("feedPage.title")}</h1>

      {/* ── 发布框 ── */}
      <section className="mt-3 rounded-2xl border border-gray-800 bg-gray-900 p-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={5000}
          rows={3}
          placeholder={t("feedPage.draftPlaceholder")}
          className="w-full rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2 text-sm text-gray-100 placeholder-gray-500"
        />
        {draftImages.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {draftImages.map((url) => (
              <div key={url} className="relative">
                <img src={url} alt="" className="h-20 w-20 rounded-xl border border-gray-800 object-cover" />
                <button
                  type="button"
                  onClick={() => setDraftImages((prev) => prev.filter((x) => x !== url))}
                  className="absolute -right-2 -top-2 rounded-full border border-gray-700 bg-gray-900 p-0.5 text-gray-300 hover:text-white"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
            <ImagePlus className="h-4 w-4" /> {uploading ? t("feedPage.imageUploading") : t("feedPage.addImage")}
            <input type="file" accept="image/*" className="hidden" onChange={handleDraftImage} disabled={uploading} />
          </label>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-gray-600">{draft.length}/5000</span>
            <button
              type="button"
              disabled={publishing || !draft.trim()}
              onClick={handlePublish}
              className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-600 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> {publishing ? t("feedPage.publishing") : t("feedPage.publish")}
            </button>
          </div>
        </div>
      </section>

      {/* ── 关注头像横排：「全部动态」 + 逐人过滤 ── */}
      {following.length > 0 && (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-1">
          <button type="button" onClick={() => switchFilter("")} className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs">
            <span
              className={`flex h-12 w-12 items-center justify-center rounded-full border ${
                filterAuthor === "" ? "border-cyan-400 bg-cyan-500/15 text-cyan-200" : "border-gray-700 bg-gray-900 text-gray-300"
              }`}
            >
              <Radio className="h-5 w-5" />
            </span>
            <span className={filterAuthor === "" ? "text-cyan-200" : "text-gray-400"}>{t("feedPage.allFeed")}</span>
          </button>
          {following.map((f) => (
            <button key={f._id} type="button" onClick={() => switchFilter(f._id)} className="flex w-16 shrink-0 flex-col items-center gap-1 text-xs">
              <span className={`rounded-full ${filterAuthor === f._id ? "ring-2 ring-cyan-400" : ""}`}>
                <Avatar user={f} />
              </span>
              <span className={`w-full truncate text-center ${filterAuthor === f._id ? "text-cyan-200" : "text-gray-400"}`}>
                {f.displayName || f.username}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── 动态流 ── */}
      {loading && ideas.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-500">{t("feedPage.loading")}</p>
      ) : ideas.length === 0 ? (
        <div className="mt-10 text-center text-sm text-gray-500">
          <p>{following.length === 0 ? t("feedPage.emptyNoFollowing") : t("feedPage.empty")}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {ideas.map((idea) => (
            <Link
              key={idea._id}
              to={`/ideas/${idea._id}`}
              className="flex gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-4 hover:bg-gray-900/70"
            >
              <Avatar user={idea.author} sizeClass="h-10 w-10" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-white">{idea.author?.displayName || idea.author?.username || "-"}</span>
                  <span className="text-xs text-gray-600">{formatRelativeTime(idea.createdAt)}</span>
                  {idea.ideaType && idea.ideaType !== "dynamic" && (
                    <span className="rounded-full border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                      {t(`home.ideaType_${idea.ideaType}`, { defaultValue: idea.ideaType })}
                    </span>
                  )}
                </div>
                <h3 className="mt-1 line-clamp-2 font-medium text-gray-100">{idea.title}</h3>
                {idea.summary && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{idea.summary}</p>}
              </div>
              {(idea.coverImageUrl || idea.imageUrls?.[0]) && (
                <img
                  src={idea.coverImageUrl || idea.imageUrls?.[0]}
                  alt=""
                  loading="lazy"
                  className="h-20 w-28 shrink-0 rounded-xl border border-gray-800 object-cover"
                />
              )}
            </Link>
          ))}
        </div>
      )}

      {page < totalPages && (
        <div className="mt-5 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-gray-700 px-6 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? t("feedPage.loading") : t("feedPage.loadMore")}
          </button>
        </div>
      )}
    </div>
  );
}
