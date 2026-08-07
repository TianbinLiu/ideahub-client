/**
 * @file StyleProfilePage.tsx - 我的发言风格面板
 * @category Page
 * @route /arena/style (ProtectedRoute)
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 拉取当前用户的发言风格档案（getMyStyleProfile）并以 <StyleStandCard owner /> 渲染
 * - “分析我的发言风格 / 重新分析” 触发 generateStyleProfile（尝试读 localStorage 'lbw_style_tally'
 *   作为可选 styleTally 传入），后端聚合情景模拟/赏金/评论区发言由 AI 总结
 * - 无档案时给空状态引导；生成中 loading/禁用按钮；错误 toast
 *
 * ⚠️ 「我的发言样本 · 风格记忆」（粘贴录入 / 列表 / 删除单条 / 清空全部）以及「删除风格档案」
 *    已【整块搬到】 pages/ArenaProfilePage.tsx（/arena/profile 的「个人记录」区）——
 *    个人数据的增删统一收口在个人主页一处，本页只负责“生成 + 展示档案”。
 *    别把样本管理搬回来，会变成两处入口各改各的。
 *
 * 被使用于:
 * @used_in App.tsx - 路由 /arena/style
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Brain, Gauge, RefreshCw, Sparkles } from "lucide-react";
import {
  generateStyleProfile,
  getMyStyleProfile,
  type SpeakingProfile,
} from "../api";
import StyleStandCard from "../components/StyleStandCard";
import { humanizeError } from "../utils/humanizeError";

/** 读取插件记录的风格选择次数（可选）；读不到 / 非法就返回 undefined，不传给后端。 */
const STYLE_LABELS: Record<string, string> = {
  rational: "styleRational",
  troll: "styleTroll",
  deflect: "styleDeflect",
  mock: "styleMock",
  deescalate: "styleDeescalate",
  support: "styleSupport",
};

/** 4c：发言风格倾向 —— 展示插件记录的实际发言风格选择分布。*/
function StyleTallyPanel({ tally }: { tally: Record<string, number> }) {
  const { t } = useTranslation();
  const entries = Object.entries(tally)
    .filter(([k, n]) => STYLE_LABELS[k] && Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const total = entries.reduce((s, [, n]) => s + Number(n), 0);
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="text-base font-semibold text-white">{t("arena.style.tendencyTitle")}</h2>
      <p className="mt-1 text-xs text-gray-500">
        {t("arena.style.tendencyDesc", { total })}
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          {t("arena.style.tendencyEmpty")}
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {entries.map(([k, n]) => {
            const pct = total ? Math.round((Number(n) / total) * 100) : 0;
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm text-gray-200">{t(`arena.style.${STYLE_LABELS[k]}`)}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                  <span className="block h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-gray-400">{t("arena.style.tendencyCount", { count: n, pct })}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function readStyleTally(): Record<string, number> | undefined {
  try {
    const raw = localStorage.getItem("lbw_style_tally");
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export default function StyleProfilePage() {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<SpeakingProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getMyStyleProfile();
        if (!mounted) return;
        setProfile(res.profile);
      } catch (e) {
        if (mounted) toast.error(humanizeError(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateStyleProfile(readStyleTally());
      setProfile(res.profile);
      toast.success(t("arena.style.generateSuccess"));
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 pb-20">
      {/* ===== 标题 ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-500/15 text-fuchsia-300">
          <Gauge className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-white md:text-3xl">{t("arena.style.pageTitle")}</h1>
          <p className="mt-1 text-sm text-gray-400">
            {t("arena.style.pageSubtitle")}
          </p>
        </div>
        <Link to="/arena" className="ml-auto text-sm text-cyan-300 hover:underline">
          ← {t("arena.style.backToArena")}
        </Link>
      </div>

      {/* ===== 操作条 ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={generating || loading}
          onClick={handleGenerate}
          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200 disabled:opacity-60"
        >
          {profile ? <RefreshCw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {generating ? t("arena.style.generating") : profile ? t("arena.style.reanalyze") : t("arena.style.analyzeMyStyle")}
        </button>
        <span className="text-xs text-gray-500">
          {t("arena.style.analyzeHint")}
        </span>
      </div>

      {/* ===== 主体 ===== */}
      {loading ? (
        <p className="text-sm text-gray-400">{t("arena.style.loading")}</p>
      ) : profile ? (
        <div className="space-y-6">
          <StyleStandCard profile={profile} owner />
          <StyleTallyPanel tally={profile.styleTally || readStyleTally() || {}} />
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-800 bg-gray-950/40 p-8 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300">
            <Gauge className="h-6 w-6" />
          </span>
          <p className="mt-3 text-sm text-gray-300">{t("arena.style.emptyTitle")}</p>
          <p className="mt-1 text-xs text-gray-500">
            {t("arena.style.emptyHint")}
          </p>
        </div>
      )}

      {/* ===== 个人记录入口（样本管理已搬去 /arena/profile） ===== */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
          <Brain className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-white">{t("arena.style.sampleTitle")}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-gray-500">
            {t("arena.style.sampleDesc")}
          </p>
        </div>
        <Link
          to="/arena/profile"
          className="ml-auto shrink-0 rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
        >
          {t("arena.style.manageRecords")} →
        </Link>
      </div>

    </div>
  );
}
