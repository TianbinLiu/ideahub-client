/**
 * @file StyleStandCard.tsx - 发言风格面板 · JOJO 替身能力卡（纯展示，不发请求）。
 * 顶部大字替身名（owner 时标“本体：你”）；SVG 六边形雷达图（6 项 value 按 6 边均分，
 * 半径映射 value/100，带网格环与描边填充，深色 cyan/紫）；6 项能力列表（中文 label + 评级徽章 +
 * 进度条）；summary 点评段落；catchphrases 以 pill 标签展示；底部元信息（生成于 · 样本 N 条 ·
 * heuristic 时标“启发式(未配置AI)”）。type 从 '../api' import。
 */
import type { SpeakingProfile } from "../api";

type StyleStandCardProps = {
  profile: SpeakingProfile;
  owner?: boolean;
};

/** 评级徽章配色：S 金 / A 青 / B 蓝 / C 灰 / D 暗 / E 红渐弱 */
const GRADE_STYLES: Record<string, string> = {
  S: "border-amber-400/60 bg-amber-400/15 text-amber-200",
  A: "border-cyan-400/60 bg-cyan-400/15 text-cyan-200",
  B: "border-blue-400/60 bg-blue-400/15 text-blue-200",
  C: "border-gray-500/60 bg-gray-500/15 text-gray-300",
  D: "border-zinc-600/60 bg-zinc-700/25 text-zinc-400",
  E: "border-rose-500/50 bg-rose-500/10 text-rose-300/80",
};

function gradeClass(grade: string) {
  return GRADE_STYLES[grade] || GRADE_STYLES.C;
}

function clampValue(value: number) {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("zh-CN", { hour12: false });
}

// ===== SVG 雷达几何 =====
const VIEW = 240;
const CENTER = VIEW / 2;
const RADIUS = 82;
const RINGS = [0.25, 0.5, 0.75, 1];

/** 第 i 个顶点在给定半径处的坐标：-90° 起、每 60° 一个（顺时针） */
function vertex(index: number, total: number, radius: number) {
  const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function polygonPoints(total: number, radiusAt: (index: number) => number) {
  return Array.from({ length: total }, (_, i) => {
    const p = vertex(i, total, radiusAt(i));
    return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
  }).join(" ");
}

export default function StyleStandCard({ profile, owner = false }: StyleStandCardProps) {
  const stats = profile.stats || [];
  const total = stats.length || 6;

  const valuePoints = polygonPoints(total, (i) => (RADIUS * clampValue(stats[i]?.value ?? 0)) / 100);

  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-900 p-4 md:p-5">
      {/* ===== 顶部：替身名 ===== */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-fuchsia-300/80">
          STAND · 发言风格面板
        </span>
        {owner ? (
          <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">
            本体：你
          </span>
        ) : null}
        {profile.heuristic ? (
          <span className="rounded-full border border-gray-700 bg-gray-800/60 px-2 py-0.5 text-[11px] text-gray-400">
            启发式(未配置AI)
          </span>
        ) : null}
      </div>
      <h2 className="mt-2 bg-gradient-to-r from-cyan-300 via-white to-fuchsia-300 bg-clip-text text-2xl font-extrabold text-transparent md:text-3xl">
        「{profile.standName}」
      </h2>

      {/* ===== 主体：雷达图 + 能力列表 ===== */}
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        {/* 雷达图 */}
        <div className="flex items-center justify-center rounded-2xl border border-gray-800 bg-gray-950/50 p-3">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="h-auto w-full max-w-[280px]"
            role="img"
            aria-label={`${profile.standName} 能力雷达图`}
          >
            <defs>
              <linearGradient id="stand-radar-fill" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#a855f7" stopOpacity="0.3" />
              </linearGradient>
            </defs>

            {/* 网格环 */}
            {RINGS.map((ring) => (
              <polygon
                key={ring}
                points={polygonPoints(total, () => RADIUS * ring)}
                fill="none"
                stroke="rgba(148,163,184,0.16)"
                strokeWidth={1}
              />
            ))}

            {/* 轴线 */}
            {Array.from({ length: total }, (_, i) => {
              const p = vertex(i, total, RADIUS);
              return (
                <line
                  key={i}
                  x1={CENTER}
                  y1={CENTER}
                  x2={p.x}
                  y2={p.y}
                  stroke="rgba(148,163,184,0.18)"
                  strokeWidth={1}
                />
              );
            })}

            {/* 数值多边形 */}
            <polygon
              points={valuePoints}
              fill="url(#stand-radar-fill)"
              stroke="#22d3ee"
              strokeWidth={2}
              strokeLinejoin="round"
            />

            {/* 顶点圆点 + 标签 */}
            {stats.map((s, i) => {
              const dot = vertex(i, total, (RADIUS * clampValue(s.value)) / 100);
              const labelPos = vertex(i, total, RADIUS + 18);
              const cos = Math.cos((-90 + (360 / total) * i) * (Math.PI / 180));
              const anchor = cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle";
              return (
                <g key={s.key}>
                  <circle cx={dot.x} cy={dot.y} r={2.6} fill="#67e8f9" />
                  <text
                    x={labelPos.x}
                    y={labelPos.y}
                    dy="0.32em"
                    textAnchor={anchor}
                    fontSize={11}
                    fill="rgba(226,232,240,0.75)"
                  >
                    {s.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* 能力列表 */}
        <ul className="space-y-3">
          {stats.map((s) => {
            const value = clampValue(s.value);
            return (
              <li key={s.key}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-200">{s.label}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-md border text-xs font-bold ${gradeClass(
                        s.grade
                      )}`}
                    >
                      {s.grade}
                    </span>
                    <span className="w-9 text-right text-xs tabular-nums text-gray-400">{value}</span>
                  </div>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500"
                    style={{ width: `${value}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ===== 点评 ===== */}
      {profile.summary ? (
        <p className="mt-4 rounded-2xl border border-gray-800 bg-gray-950/50 px-4 py-3 text-sm leading-relaxed text-gray-300">
          {profile.summary}
        </p>
      ) : null}

      {/* ===== 口头禅 ===== */}
      {profile.catchphrases && profile.catchphrases.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-xs font-medium text-gray-400">口头禅 / 风格短语</div>
          <div className="flex flex-wrap gap-2">
            {profile.catchphrases.map((phrase, i) => (
              <span
                key={`${phrase}-${i}`}
                className="rounded-full border border-fuchsia-700/40 bg-fuchsia-950/30 px-3 py-1 text-xs text-fuchsia-100"
              >
                {phrase}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* ===== 底部元信息 ===== */}
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-gray-800 pt-3 text-[11px] text-gray-500">
        <span>生成于 {formatTime(profile.generatedAt)}</span>
        <span>·</span>
        <span>样本 {profile.sampleCount} 条</span>
        {profile.model ? (
          <>
            <span>·</span>
            <span>{profile.model}</span>
          </>
        ) : null}
        {profile.heuristic ? (
          <>
            <span>·</span>
            <span className="text-gray-400">启发式(未配置AI)</span>
          </>
        ) : null}
      </div>
    </div>
  );
}
