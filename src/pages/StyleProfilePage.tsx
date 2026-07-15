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
 * 被使用于:
 * @used_in App.tsx - 路由 /arena/style
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Gauge, RefreshCw, Sparkles } from "lucide-react";
import { generateStyleProfile, getMyStyleProfile, type SpeakingProfile } from "../api";
import StyleStandCard from "../components/StyleStandCard";
import { humanizeError } from "../utils/humanizeError";

/** 读取插件记录的风格选择次数（可选）；读不到 / 非法就返回 undefined，不传给后端。 */
const STYLE_LABELS: Record<string, string> = {
  rational: "理性反驳",
  troll: "胡搅蛮缠",
  deflect: "转移话题",
  mock: "阴阳怪气",
  deescalate: "以和为贵",
  support: "附和声援",
};

/** 4c：发言风格倾向 —— 展示插件记录的实际发言风格选择分布。*/
function StyleTallyPanel({ tally }: { tally: Record<string, number> }) {
  const entries = Object.entries(tally)
    .filter(([k, n]) => STYLE_LABELS[k] && Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  const total = entries.reduce((s, [, n]) => s + Number(n), 0);
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
      <h2 className="text-base font-semibold text-white">发言风格倾向</h2>
      <p className="mt-1 text-xs text-gray-500">
        来自浏览器插件记录的你在各平台实际选用的发言风格（共 {total} 次），已纳入上方画像分析。
      </p>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">
          还没有记录。安装插件、在评论区选用发言方案后，这里会统计你最常用的风格，并同步到面板分析。
        </p>
      ) : (
        <div className="mt-4 space-y-2.5">
          {entries.map(([k, n]) => {
            const pct = total ? Math.round((Number(n) / total) * 100) : 0;
            return (
              <div key={k} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm text-gray-200">{STYLE_LABELS[k]}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                  <span className="block h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-16 shrink-0 text-right text-xs text-gray-400">{n} 次 · {pct}%</span>
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
      toast.success("已生成你的发言风格面板");
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
          <h1 className="text-2xl font-bold text-white md:text-3xl">我的发言风格面板</h1>
          <p className="mt-1 text-sm text-gray-400">
            面板基于你在情景模拟 / 赏金 / 评论区的发言数据，由 AI 总结成一张“替身能力面板”。
          </p>
        </div>
        <Link to="/arena" className="ml-auto text-sm text-cyan-300 hover:underline">
          ← 返回卢本伟广场
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
          {generating ? "分析中..." : profile ? "重新分析" : "分析我的发言风格"}
        </button>
        <span className="text-xs text-gray-500">
          分析会聚合你最近的发言文本；未配置 AI 时使用启发式估算。
        </span>
      </div>

      {/* ===== 主体 ===== */}
      {loading ? (
        <p className="text-sm text-gray-400">加载中...</p>
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
          <p className="mt-3 text-sm text-gray-300">你还没有生成过发言风格面板。</p>
          <p className="mt-1 text-xs text-gray-500">
            点击上方“分析我的发言风格”，让 AI 依据你的发言数据生成一张专属替身能力面板。
          </p>
        </div>
      )}
    </div>
  );
}
