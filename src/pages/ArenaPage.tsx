/**
 * @file ArenaPage.tsx - “卢本伟广场” 落地页 / 功能中枢
 * @category Page
 * @route /arena
 * @i18n partial (导航项走 t("nav.arena")，页面内容以中文为主，与 GroupsPage 等现有页面一致)
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 路由表与页面列表
 *
 * 职责:
 * - 作为 “AI 模拟人类对话 / 收集用户对话数据” 的统一入口与介绍页
 * - 展示两大核心玩法（情景模拟 / 赏金猎人）、浏览器插件能力、对话人格、立场展开
 * - 各子功能按阶段逐步上线；未上线的入口给出明确的 “即将上线” 提示，避免死链
 *
 * 依赖文件:
 * @uses ../authContext.tsx - 判断登录态以调整 CTA
 *
 * 被使用于:
 * @used_in App.tsx - 路由 /arena
 */

import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../authContext";
import {
  Bomb,
  Bookmark,
  Download,
  Eye,
  Gauge,
  Heart,
  ImagePlus,
  MessagesSquare,
  Puzzle,
  Radar,
  ScanSearch,
  ShieldAlert,
  Smile,
  Sparkles,
  Swords,
  Target,
  Trophy,
  UserRoundCog,
  WandSparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** 各子功能所属的开发阶段，用于 “即将上线” 徽章文案。*/
type Phase = 2 | 3 | 4 | 5 | 6 | 7;

function phaseLabel(phase: Phase) {
  return `即将上线 · 阶段 ${phase}`;
}

/** 通用的 “功能开发中” 提示，避免未完成入口跳转到空路由。*/
function useComingSoon() {
  return (name: string, phase: Phase) =>
    toast(`「${name}」正在开发中（阶段 ${phase}），敬请期待`, { icon: "🚧" });
}

function StatPill({ icon: Icon, value, label }: { icon: LucideIcon; value: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <div className="text-lg font-bold leading-none text-white">{value}</div>
        <div className="mt-1 text-xs text-gray-400">{label}</div>
      </div>
    </div>
  );
}

function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-amber-600/50 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-200">
      {phaseLabel(phase)}
    </span>
  );
}

/** 能力小卡片（插件能力 / 人格能力等）。*/
function FeatureTile({
  icon: Icon,
  title,
  desc,
  points,
  accent = "text-cyan-300",
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  points?: string[];
  accent?: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-950/40 p-5">
      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900 ${accent}`}>
        <Icon className="h-6 w-6" />
      </span>
      <h3 className="mt-3 text-base font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{desc}</p>
      {points && points.length > 0 ? (
        <ul className="mt-3 space-y-1.5 text-sm text-gray-300">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cyan-400" />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function ArenaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const comingSoon = useComingSoon();

  return (
    <div className="mx-auto max-w-6xl space-y-10 p-4 pb-24">
      {/* ===== Hero ===== */}
      <section className="relative overflow-hidden rounded-3xl border border-gray-800 bg-gradient-to-br from-cyan-500/10 via-gray-950 to-gray-950 p-6 md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-cyan-300/90">
            <Bomb className="h-4 w-4" /> AI 对话模拟实验室
          </div>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight text-white md:text-5xl">卢本伟广场</h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-gray-300 md:text-lg">
            让 AI 模拟真实网络对话，在唇枪舌战中锻炼你的表达与思辨。上传热点评论区、接取悬赏、佩戴专属 “发言人格”，
            我们在过程中收集并分析你的对话数据，帮你看清自己的说话风格。
          </p>
          <p className="mt-2 max-w-2xl text-xs text-gray-500">
            隐私说明：对话数据仅用于生成你的个人风格分析与改进推荐；涉及私信/账号的功能均需你显式授权后才会启用。
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => navigate("/arena/simulate")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-gray-200"
            >
              <Swords className="h-4 w-4" /> 浏览情景模拟
            </button>
            <button
              type="button"
              onClick={() => navigate("/arena/bounty")}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-700 px-5 py-2.5 text-sm font-semibold text-gray-100 hover:bg-gray-900"
            >
              <Target className="h-4 w-4" /> 赏金猎人
            </button>
            <button
              type="button"
              onClick={() => comingSoon("浏览器插件", 4)}
              className="inline-flex items-center gap-2 rounded-xl border border-cyan-800/60 bg-cyan-950/30 px-5 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-950/60"
            >
              <Puzzle className="h-4 w-4" /> 安装浏览器插件
            </button>
          </div>

          {!user ? (
            <button
              type="button"
              onClick={() => navigate("/login?next=/arena")}
              className="mt-4 text-sm text-cyan-300 hover:underline"
            >
              登录后解锁保存模板、接取任务与个人风格分析 →
            </button>
          ) : null}
        </div>
      </section>

      {/* ===== 数据概览（占位，后端接入后替换真实数据） ===== */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatPill icon={Swords} value="—" label="情景模拟场景" />
        <StatPill icon={Target} value="—" label="进行中的悬赏" />
        <StatPill icon={MessagesSquare} value="—" label="已收集对话轮次" />
        <StatPill icon={UserRoundCog} value="—" label="分享的发言人格" />
      </section>

      {/* ===== 两大核心玩法 ===== */}
      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">两大核心玩法</h2>
            <p className="mt-1 text-sm text-gray-400">在模拟与真实两个战场锻炼对话能力</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* 情景模拟 */}
          <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center justify-between">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/10 text-cyan-300">
                <Swords className="h-6 w-6" />
              </span>
              <PhaseBadge phase={2} />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">情景模拟</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              上传一个评论区链接（贴吧 / Instagram / Bilibili 等），AI 自动识别所属平台，调用对应 UI 模板重建出一模一样的
              “仿真页面”，并把原评论填充进去。AI 扮演页面里的其他账号与你对线，让你在激烈的观点争论中练习表达。
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-300">
              <li className="flex gap-2">
                <ScanSearch className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                自动识别主流平台并套用对应 UI 模板
              </li>
              <li className="flex gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                AI 依据真实评论扮演其它账号进行情景对话
              </li>
              <li className="flex gap-2">
                <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
                创作者可设标题/简介/封面并发布，其他人可体验
              </li>
              <li className="flex gap-2 text-gray-400">
                <span className="mt-0.5 inline-flex gap-2">
                  <Eye className="h-4 w-4" />
                  <Heart className="h-4 w-4" />
                  <Bookmark className="h-4 w-4" />
                </span>
                模板介绍页展示浏览 / 点赞 / 收藏数据
              </li>
            </ul>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/arena/simulate")}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200"
              >
                浏览模板广场
              </button>
              <button
                type="button"
                onClick={() => navigate("/arena/simulate/new")}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
              >
                成为创作者
              </button>
            </div>
          </div>

          {/* 赏金猎人 */}
          <div className="flex flex-col rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center justify-between">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
                <Target className="h-6 w-6" />
              </span>
              <PhaseBadge phase={3} />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">赏金猎人</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              发布或接取悬赏任务：附上外部热点评论区链接，猎人跳转到真实平台参与对话即可获得赏金。浏览器插件实时追踪你的发言，
              发言后弹窗提示 “任务完成”，并提供一键返回任务页提交的入口。
            </p>
            <ul className="mt-4 space-y-2 text-sm text-gray-300">
              <li className="flex gap-2">
                <Target className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                发布带外链的悬赏，聚焦当下社会热点
              </li>
              <li className="flex gap-2">
                <Radar className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                插件实时追踪发言，完成即弹窗提示
              </li>
              <li className="flex gap-2">
                <ImagePlus className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                提交前可让插件自动截图存证
              </li>
              <li className="flex gap-2">
                <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                任务详情页含评论区，可交流并发布截图
              </li>
            </ul>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => navigate("/arena/bounty")}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200"
              >
                进入任务大厅
              </button>
              <button
                type="button"
                onClick={() => navigate("/arena/bounty/new")}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-800"
              >
                发布悬赏
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 浏览器插件 ===== */}
      <section className="space-y-4 rounded-3xl border border-cyan-900/40 bg-gradient-to-b from-cyan-950/20 to-gray-950 p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-300">
            <Puzzle className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-2xl font-bold text-white">浏览器插件</h2>
            <p className="mt-1 text-sm text-gray-400">解锁完整能力的钥匙——在任何平台辅助你发言</p>
          </div>
          <div className="ml-auto">
            <PhaseBadge phase={4} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FeatureTile
            icon={WandSparkles}
            title="三条发言方案推荐"
            desc="在评论输入框旁实时给出三种不同风格的发言方案，随你输入的内容自动调整意图，一键填入。"
            points={[
              "风格如：理性反驳 / 胡搅蛮缠 / 转移话题",
              "每条标注破防等级、叠甲等级、被举报吞评风险",
              "最贴合你个人风格的方案自动置顶",
            ]}
          />
          <FeatureTile
            icon={Smile}
            title="表情 / 梗图库"
            desc="跨平台收藏表情，在任意评论框旁一键搜索并插入；配套创意工坊与公开素材库，快速找到需要的梗图。"
            points={["跨平台收藏与同步", "评论框旁一键搜索插入", "创意工坊 + 公开素材库"]}
          />
          <FeatureTile
            icon={Gauge}
            title="个人风格学习"
            desc="记录你的选择习惯与发言风格，AI 持续总结出你的 “个人风格”，让推荐越来越像你自己。"
            points={["记录发言选择与风格偏好", "总结个人风格画像", "驱动方案排序与人格生成"]}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => comingSoon("浏览器插件下载", 4)}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
          >
            <Download className="h-4 w-4" /> 下载插件（开发中）
          </button>
          <button
            type="button"
            onClick={() => navigate("/arena/memes")}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-800/60 bg-cyan-950/30 px-5 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-950/60"
          >
            <Smile className="h-4 w-4" /> 打开素材库
          </button>
          <span className="text-xs text-gray-500">支持 Chrome / Edge 等 Chromium 内核浏览器</span>
        </div>
      </section>

      {/* ===== 你的对话人格 ===== */}
      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-white">你的对话人格</h2>
          <p className="mt-1 text-sm text-gray-400">把说话风格量化成面板，甚至下载别人的风格来武装自己</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center justify-between">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300">
                <Gauge className="h-6 w-6" />
              </span>
              <PhaseBadge phase={5} />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">发言风格面板</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              基于收集到的发言数据，AI 总结你的对话风格，生成一张类似 “JOJO 替身面板” 的能力图：攻击力、
              嘴臭指数、逻辑性、叠甲熟练度、抗压能力……让你一眼看懂自己的风格。
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate("/arena/style")}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200"
              >
                查看我的面板
              </button>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
            <div className="flex items-center justify-between">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-fuchsia-500/10 text-fuchsia-300">
                <Download className="h-6 w-6" />
              </span>
              <PhaseBadge phase={6} />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-white">人格下载</h3>
            <p className="mt-2 text-sm leading-relaxed text-gray-300">
              收藏并加装其他用户分享的发言风格。在其它平台发言时可自由切换 “按本人风格” 或 “按下载的人格”
              来生成三条方案，随场合更换你的嘴替。
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => navigate("/arena/persona")}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200"
              >
                进入人格广场
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 立场展开（头号卖点） ===== */}
      <section className="relative overflow-hidden rounded-3xl border border-rose-900/40 bg-gradient-to-br from-rose-500/10 via-gray-950 to-gray-950 p-6 md:p-10">
        <div className="pointer-events-none absolute -left-20 bottom-0 h-64 w-64 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
              <Radar className="h-6 w-6" />
            </span>
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-rose-300/90">
                头号卖点
              </div>
              <h2 className="text-2xl font-bold text-white md:text-3xl">立场展开</h2>
            </div>
            <div className="ml-auto">
              <PhaseBadge phase={7} />
            </div>
          </div>

          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-gray-300 md:text-base">
            我们给你一个后台运行的服务器容器并加装 OpenClaw。绑定平台账号后，AI 监控你的平台接口——当你睡觉或离开电子设备时，
            如果有人私信你或回复你的发言，AI 会自动 “展开” 分析并按你选择的风格（激进 / 和平…）与人格自动回复。
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-5">
              <div className="flex items-center gap-2 text-rose-200">
                <ShieldAlert className="h-5 w-5" />
                <span className="font-semibold">情景一 · 即时反击</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                对面若是恶意发言，第一时间以相同方式回应回去，防止对方趁你不在时骂完就拉黑——
                避免你上线后只看到别人的辱骂却无从回应。
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-950/50 p-5">
              <div className="flex items-center gap-2 text-emerald-200">
                <MessagesSquare className="h-5 w-5" />
                <span className="font-semibold">情景二 · 自动应答</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-gray-300">
                遇到专业知识询问或 “怎么加入粉丝群” 之类的请求，AI 依据你预填的个人信息自动回复，
                第一时间告诉对方粉丝群的加入方式等。
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigate('/arena/standpoint')}
              className="inline-flex items-center gap-2 rounded-xl bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-400"
            >
              <Radar className="h-4 w-4" /> 配置立场展开
            </button>
            <span className="text-xs text-gray-500">需绑定平台账号并显式授权，后台容器由平台托管</span>
          </div>
        </div>
      </section>

      {/* ===== 运作流程 ===== */}
      <section className="space-y-4">
        <h2 className="text-2xl font-bold text-white">运作流程</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { n: "01", t: "安装插件 / 佩戴人格", d: "安装浏览器插件并选择本人风格或下载的人格。" },
            { n: "02", t: "上场对话", d: "进入情景模拟、接取悬赏，或在真实平台由插件辅助发言。" },
            { n: "03", t: "收集与总结", d: "对话数据被记录，AI 持续总结你的发言风格。" },
            { n: "04", t: "人格进化 / 立场展开", d: "生成风格面板，分享/下载人格，离线时由立场展开自动应对。" },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
              <div className="text-2xl font-black text-cyan-400/80">{s.n}</div>
              <h3 className="mt-2 text-base font-semibold text-white">{s.t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-gray-400">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 页脚说明 ===== */}
      <section className="rounded-2xl border border-gray-800 bg-gray-950/40 p-5 text-center">
        <p className="text-sm text-gray-400">
          卢本伟广场目前处于分阶段建设中。上方带 “即将上线” 徽章的入口会随版本逐步开放，功能上线后此处将替换为真实数据与可用链接。
        </p>
      </section>
    </div>
  );
}
