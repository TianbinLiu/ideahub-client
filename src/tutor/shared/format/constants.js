// 人格资产格式 ideahub-tutor/1 的全部「定数」只在这一处（docs/03 是它的文字版；两边不一致以 docs/03 为准并回来改这里）。
// ★ 为什么把上限也放这儿：docs/03 §3 / §4 的每个上限将来同时被 服务端 zod、官网表单、本地脚本 三处引用，
//   各抄一份就是 App CLAUDE.md 坑表里「最多出几张卡的上限自己抄一份」那一格 —— 报价 6、实收 8、零症状。

export const FORMAT_NAME = "ideahub-tutor";
export const FORMAT_MAJOR = 1;
export const FORMAT_MINOR = 1; // 1.1（2026-09-26）：④ 条目可带锚点、每阶段可带「讲解步」（docs/03 §6.1.1）
export const FORMAT_ID = `${FORMAT_NAME}/${FORMAT_MAJOR}.${FORMAT_MINOR}`;

/** 六段固定二级标题（docs/03 §5 第 1 条：中文正本 + 英文别名，编号符号可省）。顺序就是渲染顺序。 */
export const SECTIONS = [
  { key: "card", num: "①", zh: "老师人格卡", en: "Teacher Card" },
  { key: "profile", num: "②", zh: "学生画像", en: "Learner Profile" },
  { key: "map", num: "③", zh: "课程地图", en: "Course Map" },
  { key: "distill", num: "④", zh: "知识蒸馏", en: "Distillation" },
  { key: "log", num: "⑤", zh: "对话日志", en: "Dialogue Log" },
  { key: "guide", num: "⑥", zh: "复刻指南", en: "Replication Guide" },
];

/** ① 的三级标题 → 字段名（docs/03 §4.1）。 */
export const CARD_SUBS = [
  { key: "who", zh: "是谁", en: "Who" },
  { key: "catchphrases", zh: "口头禅", en: "Catchphrases" },
  { key: "teaching_style", zh: "教学风格", en: "Teaching Style" },
  { key: "hard_rules", zh: "硬规则", en: "Hard Rules" },
  { key: "greeting_closing", zh: "开场与收尾", en: "Greeting and Closing" },
  { key: "example_turns", zh: "示例对话", en: "Example Turns" },
];

/** ② 的三级标题（docs/03 §4.2）。「误解」是 1.0 定稿时补的可选标题：字段表里早有 misconceptions，md 里却没处放。 */
export const PROFILE_SUBS = [
  { key: "pace", zh: "学习节奏", en: "Pace" },
  { key: "preferences", zh: "偏好", en: "Preferences" },
  { key: "stuck_points", zh: "卡点", en: "Stuck Points" },
  { key: "effective_methods", zh: "有效讲法", en: "Effective Methods" },
  { key: "misconceptions", zh: "误解", en: "Misconceptions" },
];

/** ③ 的表头（按列名认列，不按位置；「摘要」列只在任一阶段有摘要时才渲染）与三级标题。 */
export const MAP_COLUMNS = [
  { key: "week", zh: "周", en: "Week" },
  { key: "stage_id", zh: "阶段 id", en: "Stage" },
  { key: "title", zh: "主题", en: "Topic" },
  { key: "status", zh: "状态", en: "Status" },
  { key: "key_date", zh: "关键日期", en: "Key Date" },
  { key: "summary", zh: "摘要", en: "Summary" },
];
export const MAP_SUBS = [
  { key: "key_dates", zh: "关键日期", en: "Key Dates" },
  // 1.0 定稿补的可选标题：source_material_hashes 在字段表里（§4.3），md 里原来没处放。
  { key: "source_material_hashes", zh: "教材指纹", en: "Material Hashes" },
];

/** ④ 每个阶段下的四级标题，顺序固定（docs/03 §4.4）。 */
export const DISTILL_SUBS = [
  { key: "method", zh: "老师的讲法", en: "How the Teacher Explains" },
  // 1.1 新增：导学漫游的脚本 —— 每一步锚在教材的一处，老师说一句、可选反问一句（docs/03 §4.7）。1.0 读者当未知四级标题原样保留
  { key: "walkthrough", zh: "讲解步", en: "Walkthrough" },
  { key: "must_memorize", zh: "必背", en: "Must Memorize" },
  { key: "self_checks", zh: "自检题", en: "Self-checks" },
  { key: "student_qa", zh: "学生问答", en: "Student Q&A" },
  { key: "pitfalls", zh: "易错点", en: "Pitfalls" },
];

/** ⑥ 的三级标题（docs/03 §4.6）。 */
export const GUIDE_SUBS = [
  { key: "system_prompt", zh: "给任意 AI 的一段话", en: "A Note for Any AI" },
  { key: "how_to_continue", zh: "怎么接着上", en: "How to Continue" },
  { key: "how_to_update_profile", zh: "怎么更新学生画像", en: "How to Update the Learner Profile" },
  { key: "boundaries", zh: "边界", en: "Boundaries" },
];

export const STAGE_STATUS = ["未讲", "已讲", "学生已通过"];
export const STAGE_STATUS_EN = { "未讲": "not taught", "已讲": "taught", "学生已通过": "passed" };
export const SELF_CHECK_KINDS = { "计算": "calc", "概念": "concept", "排错": "debug" };
export const SELF_CHECK_KINDS_REV = Object.fromEntries(Object.entries(SELF_CHECK_KINDS).map(([zh, en]) => [en, zh]));
export const KEY_DATE_KINDS = ["exam", "homework", "project", "other"];
export const LICENSE_SOURCES = ["self", "instructor_public", "instructor_consent", "unsure"];
export const POLICY_AI = ["prohibited", "limited", "allowed"];
export const HOMEWORK_MODES = ["principles_only", "full"];
export const AUDIENCES = ["market", "self"];
export const PROFILE_INCLUDES = ["none", "seed", "full"];
export const LOG_INCLUDES = ["none", "excerpts", "full"];
export const STAGE_ID_RE = /^stage-\d{2,3}$/;
export const SHA256_RE = /^(sha256:)?[0-9a-f]{64}$/;

/** 全部上限（docs/03 §3 / §4）。「建议值」的那几个另标 `suggested`，dogfood 里量过再钉死（AGENTS.md 第 6 条）。 */
export const LIMITS = {
  file_bytes: { max: 1024 * 1024, suggested: true }, // §2：S2 给 /api/tutor 2 MB JSON 上限，留一倍给转义膨胀
  version_note: 300,
  name: 120,
  subject: 60,
  tags: { count: 6, each: 10 },
  card: {
    who: 1000,
    catchphrases: { count: 12, each: 120 },
    teaching_style: 2000,
    tone: 300,
    address_student: 60,
    hard_rules: { count: 12, each: 120 },
    greeting: 300,
    closing: 300,
    example_turns: { count: 12, each: 300 },
  },
  profile: {
    pace: 200,
    preferences: { count: 10, each: 120 },
    stuck_points: { count: 30, each: 200 },
    effective_methods: { count: 20, each: 200 },
    misconceptions: { count: 30, each: 200 },
  },
  map: {
    stages: 60,
    title: 80,
    summary: 300,
    key_date: 60,
    key_dates: { count: 30, label: 60 },
  },
  distill: {
    method: 1500,
    walkthrough: { count: 12, say: 300, ask: 200 }, // 一阶段 ≤ 12 步（建议值：一页幻灯 1～2 步、一阶段 6～8 页）
    anchor_quote: 40, // 锚点短引 ≤ 40 字：够重新对上、又远低于泄漏核查阈值 120，属合理引用（docs/09 §5.2）
    must_memorize: { count: 12, each: 200 },
    self_checks: { count: 8, q: 300, a: 500, rubric: 200, min_for_market: 2 },
    student_qa: { count: 10, q: 300, a: 500 },
    pitfalls: { count: 10, each: 200 },
    per_stage_chars: { max: 3000, suggested: true }, // §4.4：一次一阶段要整段塞进上下文
  },
  log: {
    excerpts: 20,
    why: 200,
    turns: { count: 12, each: 1000 },
  },
  guide: {
    system_prompt: 2000, // §4.6：塞进任何聊天窗口的一条消息（Character.AI Definition 32000 字符可对照）
    how_to_continue: 1500,
    how_to_update_profile: 1500,
    boundaries: 1000,
  },
};

/**
 * 显式 AIGC 标识（docs/03 §9）：正文第一行与最后一行各一条引用块。
 * 文案同时含「人工智能」与「生成合成」，满足《标识办法》第四条第（一）项对文本起始 / 末尾的要求；
 * 两行**参与** checksum（它们是正文的一部分），删掉就校验失败 —— 第十条「不得恶意删除」要的效果。
 */
export function explicitLabelLine({ producer, id, version }) {
  return `> 本文件为人工智能生成合成内容（${producer} · 老师人格 ${id} v${version}）。`;
}
export const EXPLICIT_LABEL_RE = /^>\s*本文件为人工智能生成合成内容（(.+?) · 老师人格 (\S+) v(\d+)）。\s*$/;

/**
 * 隐式标识（docs/03 §9）按 GB 45438-2025 附录 E 的字段名写在 frontmatter 顶层 `AIGC` 键下 ——
 * TC260-PG-20258A《…文件元数据隐式标识 文本文件》（2025-08-28）对 Markdown 的落点就是「文件头部」，且要求记录里含关键词「AIGC」。
 * ★ 2026-09-24 定稿前这里写的是自造的 aigc.label/producer/content_id：核验平台按附录 E 找字段，自造名字会被判「未核验到」（调研 decisions-market-survey §B）。
 * Label：1 = 属于 AI 生成合成、2 = 可能、3 = 疑似（附录 E）。ContentProducer：服务提供者名称或 27 位编码 / 备案号 / 登记号（拿到编码后换）。
 * ContentPropagator / PropagateID 由传播平台填，生成侧留空；ReservedCode1/2 留空。
 */
export const AIGC_KEYS = ["Label", "ContentProducer", "ProduceID", "ReservedCode1", "ContentPropagator", "PropagateID", "ReservedCode2"];
export const AIGC_LABEL_GENERATED = "1";
/** ProduceID 用 UUID v5 从 `tutor:<id>:v<version>` 派生：既是实践指南建议的 UUID 形态，又能从人格 id + 版次复算、导出日志能反查。命名空间是本项目自己抽的一个 v4。 */
export const PRODUCE_ID_NAMESPACE = "6f3c9a4e-2c1b-4f0a-9d7e-8b5a1c2d3e4f";
export function contentIdOf({ id, version }) {
  return `tutor:${id}:v${version}`;
}

/**
 * 锚点在 Markdown 里的记法（docs/03 §4.7）：`〔m:<教材 sha256 前 12 位> p<页> #<块哈希前 12 位> <start>-<end>「<短引 ≤ 40 字>」〕`
 * —— 块哈希与偏移可省；短引必带（重新对上靠它）；只有指纹与短引，教材原文不出（docs/09 §5.2）。
 * ★ 12 位十六进制而不是整段 sha：md 与 json 要能无损往返，所以两边都只存这 12 位（一门课内碰撞概率可忽略）。
 */
export const ANCHOR_RE = /〔m:([0-9a-f]{12}) p(\d+)(?: #([0-9a-f]{12}))?(?: (\d+)-(\d+))?「([^」]{1,40})」〕/;
export const ANCHOR_TAIL_RE = new RegExp(`\\s*${ANCHOR_RE.source}\\s*$`);
export function renderAnchor(a) {
  const parts = [`m:${a.material}`, `p${a.page}`];
  if (a.chunk) parts.push(`#${a.chunk}`);
  if (a.start !== undefined && a.end !== undefined) parts.push(`${a.start}-${a.end}`);
  return `〔${parts.join(" ")}「${a.quote}」〕`;
}
export function parseAnchorMatch(m) {
  const a = { material: m[1], page: Number(m[2]), quote: m[6] };
  if (m[3]) a.chunk = m[3];
  if (m[4] !== undefined) { a.start = Number(m[4]); a.end = Number(m[5]); }
  return a;
}

/**
 * ② 的运行态尾注（docs/03 §5 第 8 条、§7.4）：条目行最末的 `‹t:14,15 · 首见 <ISO> · 末见 <ISO> · 已解 <ISO>›`，
 * 承载 evidence / first_seen / last_seen / resolved_at。只有自用件有：export 的 strip 剥掉，validate 见发布件带着整句拒。
 * ★ 为什么必须进 .md：工作区的头文档只存 Markdown（cli/common.saveCourse），不进文件 = 每次保存都把证据与时间丢掉，
 *   而 §8「发布件剥掉 evidence」那道门从此剥的是空气 —— 2026-09-26 的往返测试抓到的正是这个，此前零报错。
 * ★ 位置在锚点之后：锚点属于内容（发布件也带），尾注属于运行态（发布件不带），解析时从右往左各剥一层。
 * 记法读不懂（多一个分隔、少一个空格）就整组留在文字里：不丢、也不猜。
 */
export const STAGED_META_TAIL_RE = /\s*‹([^‹›]+)›\s*$/;
const META_KEYS = [["首见", "first_seen"], ["末见", "last_seen"], ["已解", "resolved_at"]];
export function renderStagedMeta(x) {
  const parts = [];
  if (x.evidence?.length) parts.push(`t:${renderSeqs(x.evidence)}`);
  for (const [zh, key] of META_KEYS) if (x[key]) parts.push(`${zh} ${x[key]}`);
  return parts.length ? `‹${parts.join(" · ")}›` : "";
}
/** 轮次列表 → `3,7–9`：按原顺序写，连续递增 ≥3 个折成区间（§7.4「t:41–44 表示区间」）；不排序不去重，往返才逐位相等。 */
export function renderSeqs(seqs) {
  const out = [];
  for (let i = 0; i < seqs.length;) {
    let j = i;
    while (j + 1 < seqs.length && seqs[j + 1] === seqs[j] + 1) j++;
    if (j - i >= 2) { out.push(`${seqs[i]}–${seqs[j]}`); i = j + 1; } else { out.push(String(seqs[i])); i++; }
  }
  return out.join(",");
}
/** `3,7–9` → [3,7,8,9]；区间接受 – 与 -；任何一段读不懂返回 null。 */
export function parseSeqs(s) {
  const out = [];
  for (const tok of s.split(",")) {
    const m = /^(\d+)(?:[–-](\d+))?$/.exec(tok);
    if (!m) return null;
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (b < a) return null;
    for (let k = a; k <= b; k++) out.push(k);
  }
  return out;
}
/** 尾注正文 → 字段；任何一段读不懂就整组不认（返回 null，调用方把它留在文字里）。 */
export function parseStagedMeta(inner) {
  const out = {};
  for (const part of inner.split(/\s*·\s*/)) {
    let m;
    if ((m = /^t:(\S+)$/.exec(part))) { const seqs = parseSeqs(m[1]); if (!seqs) return null; out.evidence = seqs; }
    else if ((m = /^(首见|末见|已解)\s+(\S+)$/.exec(part))) out[META_KEYS.find(([zh]) => zh === m[1])[1]] = m[2];
    else return null;
  }
  return Object.keys(out).length ? out : null;
}

/** 「未勾选 / 空」的占位句：渲染时只在数组为空且没有作者自己写的说明时才用。 */
export const EMPTY_NOTES = {
  stuck_points: "（作者未勾选任何卡点随人格发布。）",
  student_qa: "（作者未勾选。）",
};
