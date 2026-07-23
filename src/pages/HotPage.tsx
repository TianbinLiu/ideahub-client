/**
 * @file HotPage.tsx - 热门页（B 站式）：全站热度最高的内容，双列大卡流。
 * @category Page
 * @route /hot
 * @i18n yes
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 入口 = 首页「热门」按钮（该按钮已从「切换 feed 排序」改为本页入口）
 * - 数据 = GET /api/ideas?sort=hot（全类型，不筛），分页加载更多
 * - 「热门规则」弹窗：说明热度怎么算（与 server getIdeaHotScore 口径一致的通俗版）
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Flame, Info, X } from "lucide-react";
import { apiFetch, type Idea } from "../api";
import { humanizeError } from "../utils/humanizeError";
import { formatRelativeTime } from "../utils/relativeTime";

const PAGE_SIZE = 20;

export default function HotPage() {
  const { t } = useTranslation();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [rulesOpen, setRulesOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const qs = new URLSearchParams({ sort: "hot", page: String(page), limit: String(PAGE_SIZE), group: "world" });
        const res = await apiFetch<{ ideas: Idea[]; totalPages: number }>(`/api/ideas?${qs.toString()}`);
        if (!mounted) return;
        // 追加去重（评审实锤）：sort=hot 的排名在两次请求间会漂移，
        // 已渲染的条目可能再次落进下一页窗口 —— 不去重会出现重复卡片和重复 key
        setIdeas((prev) => {
          if (page === 1) return res.ideas || [];
          const seen = new Set(prev.map((i) => i._id));
          return [...prev, ...(res.ideas || []).filter((i) => !seen.has(i._id))];
        });
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
  }, [page]);

  return (
    <div className="mx-auto max-w-6xl p-4 pb-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-500/60 bg-rose-500/10">
            <Flame className="h-5 w-5 text-rose-300" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-white">{t("hotPage.title")}</h1>
            <p className="text-xs text-gray-500">{t("hotPage.subtitle")}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setRulesOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
        >
          <Info className="h-3.5 w-3.5" /> {t("hotPage.rulesButton")}
        </button>
      </div>

      {loading && ideas.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-500">{t("hotPage.loading")}</p>
      ) : ideas.length === 0 ? (
        <p className="mt-10 text-center text-sm text-gray-500">{t("hotPage.empty")}</p>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {ideas.map((idea) => (
            <Link
              key={idea._id}
              to={`/ideas/${idea._id}`}
              className="flex gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-3 hover:bg-gray-900/70"
            >
              {(idea.coverImageUrl || idea.imageUrls?.[0]) && (
                <img
                  src={idea.coverImageUrl || idea.imageUrls?.[0]}
                  alt=""
                  loading="lazy"
                  className="h-24 w-40 shrink-0 rounded-xl border border-gray-800 object-cover"
                />
              )}
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 font-semibold text-white">{idea.title}</h3>
                {idea.summary && <p className="mt-1 line-clamp-1 text-xs text-gray-500">{idea.summary}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-400">
                  <span className="text-gray-300">{idea.author?.username || "-"}</span>
                  <span>👀 {idea.stats?.viewCount ?? 0}</span>
                  <span>❤️ {idea.stats?.likeCount ?? 0}</span>
                  <span>💬 {idea.stats?.commentCount ?? 0}</span>
                  <span className="ml-auto text-gray-600">{formatRelativeTime(idea.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {page < totalPages && (
        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={loading}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-xl border border-gray-700 px-6 py-2 text-sm text-gray-200 hover:bg-gray-800 disabled:opacity-50"
          >
            {loading ? t("hotPage.loading") : t("hotPage.loadMore")}
          </button>
        </div>
      )}

      {/* 热门规则弹窗（对齐 B 站「热门规则」的形态；文案与 server 热度算分口径一致） */}
      {rulesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setRulesOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t("hotPage.rulesTitle")}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">{t("hotPage.rulesTitle")}</h2>
              <button type="button" onClick={() => setRulesOpen(false)} className="rounded-lg p-1 text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="mt-3 space-y-3 text-sm text-gray-300">
              <div>
                <h3 className="font-semibold text-white">{t("hotPage.rulesWhatTitle")}</h3>
                <p className="mt-1 text-gray-400">{t("hotPage.rulesWhatBody")}</p>
              </div>
              <div>
                <h3 className="font-semibold text-white">{t("hotPage.rulesHowTitle")}</h3>
                <ul className="mt-1 list-inside list-disc space-y-1 text-gray-400">
                  <li>{t("hotPage.rulesPoint1")}</li>
                  <li>{t("hotPage.rulesPoint2")}</li>
                  <li>{t("hotPage.rulesPoint3")}</li>
                  <li>{t("hotPage.rulesPoint4")}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
