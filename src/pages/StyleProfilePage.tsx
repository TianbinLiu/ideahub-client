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
 * - 「我的发言样本 · 风格记忆」：粘贴自己的过往发言加入样本库（addStyleSamples），查看/删除/清空
 *   （listStyleSamples / deleteStyleSample / clearStyleSamples）。样本只来自用户自己提供，
 *   不自动爬取平台历史；加入/删除后仅提示可重新生成，绝不自动触发 AI 生成。
 *
 * 被使用于:
 * @used_in App.tsx - 路由 /arena/style
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Brain, Gauge, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  addStyleSamples,
  clearStyleSamples,
  deleteStyleSample,
  generateStyleProfile,
  getMyStyleProfile,
  listStyleSamples,
  type SpeakingProfile,
  type StyleSample,
} from "../api";
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

/** 风格记忆：每页样本数 / 单条上限 / 单批上限（与后端 samplesBody 校验保持一致） */
const SAMPLE_PAGE_SIZE = 20;
const SAMPLE_MAX_LEN = 1000;
const SAMPLE_MAX_COUNT = 50;

const SAMPLE_SOURCE_LABELS: Record<string, string> = {
  paste: "粘贴",
  capture: "插件抓取",
};

/** 把粘贴的整段文本按空行拆成多条（无空行时即单条）；过滤空串、每条截断 1000、最多 50 条。 */
function parseSampleTexts(raw: string): string[] {
  return raw
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => t.slice(0, SAMPLE_MAX_LEN))
    .slice(0, SAMPLE_MAX_COUNT);
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

  // ===== 风格记忆：我的发言样本 =====
  const [samples, setSamples] = useState<StyleSample[]>([]);
  const [sampleTotal, setSampleTotal] = useState(0);
  const [samplePage, setSamplePage] = useState(1);
  const [samplesLoading, setSamplesLoading] = useState(true);
  const [pasteText, setPasteText] = useState("");
  const [adding, setAdding] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  /** 样本有增删后置为 true：提示用户可手动重新生成档案（绝不自动触发 AI） */
  const [samplesDirty, setSamplesDirty] = useState(false);

  const loadSamples = useCallback(async (targetPage: number, append: boolean) => {
    setSamplesLoading(true);
    try {
      const res = await listStyleSamples({ page: targetPage, limit: SAMPLE_PAGE_SIZE });
      setSamples((prev) => (append ? [...prev, ...res.samples] : res.samples));
      setSampleTotal(res.total);
      setSamplePage(res.page);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setSamplesLoading(false);
    }
  }, []);

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

  useEffect(() => {
    void loadSamples(1, false);
  }, [loadSamples]);

  async function handleGenerate() {
    setGenerating(true);
    try {
      const res = await generateStyleProfile(readStyleTally());
      setProfile(res.profile);
      setSamplesDirty(false);
      toast.success("已生成你的发言风格面板");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setGenerating(false);
    }
  }

  async function handleAddSamples() {
    const texts = parseSampleTexts(pasteText);
    if (texts.length === 0) {
      toast.error("请先粘贴你自己的发言内容");
      return;
    }
    setAdding(true);
    try {
      const res = await addStyleSamples({ texts, source: "paste" });
      toast.success(`已加入 ${res.added} 条（跳过 ${res.skipped} 条重复）`);
      setPasteText("");
      if (res.added > 0) setSamplesDirty(true);
      await loadSamples(1, false);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleDeleteSample(id: string) {
    setDeletingId(id);
    try {
      await deleteStyleSample(id);
      setSamples((prev) => prev.filter((s) => s._id !== id));
      setSampleTotal((prev) => Math.max(prev - 1, 0));
      setSamplesDirty(true);
      toast.success("已删除该样本");
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleClearSamples() {
    if (!window.confirm("确定清空全部发言样本？此操作不可撤销。")) return;
    setClearing(true);
    try {
      const res = await clearStyleSamples();
      setSamples([]);
      setSampleTotal(0);
      setSamplePage(1);
      setSamplesDirty(true);
      toast.success(`已清空 ${res.deleted} 条样本`);
    } catch (e) {
      toast.error(humanizeError(e));
    } finally {
      setClearing(false);
    }
  }

  const parsedCount = parseSampleTexts(pasteText).length;
  const hasMoreSamples = samples.length < sampleTotal;

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
            面板优先参考你加入风格记忆的发言样本，并结合情景模拟 / 赏金 / 评论区的发言数据，由 AI 总结成一张“发言风格面板”。
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
            点击上方“分析我的发言风格”，让 AI 依据你的发言数据生成一张专属发言风格面板。
          </p>
        </div>
      )}

      {/* ===== 我的发言样本 · 风格记忆 ===== */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300">
            <Brain className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-white">我的发言样本 · 风格记忆</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              只收录你自己的发言。样本越多，风格记忆越准；生成档案时会优先参考这些样本。
            </p>
          </div>
          <span className="ml-auto text-xs text-gray-400">
            共 <span className="font-semibold text-cyan-300">{sampleTotal}</span> 条
          </span>
        </div>

        {/* --- 粘贴录入 --- */}
        <div className="mt-5">
          <label htmlFor="style-sample-input" className="text-sm text-gray-200">
            粘贴你的过往发言
          </label>
          <textarea
            id="style-sample-input"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={6}
            placeholder={"每条发言之间空一行分隔，例如：\n\n这游戏平衡性早就崩了，数据摆在那儿。\n\n别急，我慢慢跟你捋一遍时间线。"}
            className="mt-2 w-full resize-y rounded-xl border border-gray-800 bg-gray-950 p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-cyan-500/60 focus:outline-none"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={adding || parsedCount === 0}
              onClick={handleAddSamples}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-black hover:bg-cyan-400 disabled:opacity-60"
            >
              <Brain className="h-4 w-4" />
              {adding ? "加入中..." : "加入风格记忆"}
            </button>
            <span className="text-xs text-gray-500">
              按空行分隔为多条（单条也可）；已识别 {parsedCount} 条，单次最多 {SAMPLE_MAX_COUNT} 条、每条 {SAMPLE_MAX_LEN} 字。
            </span>
            {sampleTotal > 0 ? (
              <button
                type="button"
                disabled={clearing}
                onClick={handleClearSamples}
                className="ml-auto inline-flex items-center gap-1.5 rounded-xl border border-gray-800 px-3 py-2 text-xs text-gray-400 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearing ? "清空中..." : "清空全部"}
              </button>
            ) : null}
          </div>
        </div>

        {/* --- 样本变动提示：只提示，不自动生成 --- */}
        {samplesDirty ? (
          <p className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            风格记忆已更新。想让新样本生效，请点击上方的“{profile ? "重新分析" : "分析我的发言风格"}”重新生成档案。
          </p>
        ) : null}

        {/* --- 样本列表 --- */}
        <div className="mt-5">
          {samplesLoading && samples.length === 0 ? (
            <p className="text-sm text-gray-400">加载中...</p>
          ) : samples.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-400">
              还没有样本 —— 粘贴你的过往发言，或在插件里用 🧠 在你自己的主页/评论页收集。
            </div>
          ) : (
            <ul className="space-y-2.5">
              {samples.map((s) => (
                <li
                  key={s._id}
                  className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-950/60 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-gray-200">{s.text}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                      <span className="rounded-md bg-gray-800 px-1.5 py-0.5 text-gray-300">
                        {SAMPLE_SOURCE_LABELS[s.source] || s.source}
                      </span>
                      {s.platform ? <span>{s.platform}</span> : null}
                      <span>{s.createdAt ? new Date(s.createdAt).toLocaleString() : ""}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={deletingId === s._id}
                    onClick={() => handleDeleteSample(s._id)}
                    title="删除该样本"
                    className="shrink-0 rounded-lg border border-gray-800 p-1.5 text-gray-500 hover:border-red-500/50 hover:text-red-300 disabled:opacity-60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {hasMoreSamples ? (
            <button
              type="button"
              disabled={samplesLoading}
              onClick={() => loadSamples(samplePage + 1, true)}
              className="mt-3 w-full rounded-xl border border-gray-800 py-2 text-sm text-gray-300 hover:border-cyan-500/50 hover:text-cyan-300 disabled:opacity-60"
            >
              {samplesLoading ? "加载中..." : `加载更多（还有 ${sampleTotal - samples.length} 条）`}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
