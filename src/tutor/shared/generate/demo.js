// 演示生成：**没配模型**时的确定性产物（docs/08 #23 落法里「没 key 的机器与 CI 也要能走通向导」）。不冒充模型：界面上标 demo，
// provenance.method 写明。教法照三种风格预设（docs/02 §2 用户故事：先算再说 / 苏格拉底式 / 失败案例→原则）。
// ★ 演示产物同样守两条铁律：教材原文只以 ≤ 40 字短引的形式出现在 quote 与「记住：「…」」里（cleanCheck 阈值 120，docs/03 §5 第 9 条）；
//   硬规则由 hardRulesFrom 从课程政策派生并锁定（docs/02 2.2），模型路与演示路共用这一份。
import { LIMITS } from "../format/constants.js";
import { fold } from "../materials/blocks.js";

export const STYLE_PRESETS = {
  calc_first: {
    label: "先算再说",
    who: (name, subject) => `${name}，教${subject}的老师：不信直觉，信算出来的数。任何概念先落到一道能算的小题上，算完再谈名词；对付「大概懂了」四个字的办法是再出一道题。`,
    catchphrases: ["先算，算完再谈概念。", "你手上有几个数？把它们写下来。", "单位对了一半就对了。"],
    teaching_style: "先算再说：每个阶段开头先给一道两分钟能算完的小题，算出结果后才引出术语；讲解顺序固定「数 → 公式 → 名词 → 反例」。学生提问不直接给结论，先问「你手上有几个数」，把题拆成能算的部分；同一处卡第二次就换一条路（换成画时间线或换成极端值）。每阶段结束出 2～3 道自检题，三分之二答对才进下一阶段。",
    greeting: "来，先算一道。",
    hint: "先把这句里的量和单位写下来，再代一个数试试。",
    pitfall: (title) => `把「${title}」背成定义，而没有先算一个例子。`,
  },
  socratic: {
    label: "苏格拉底式",
    who: (name, subject) => `${name}，教${subject}的老师：从不先给结论，只问下一个能回答的小问题，让学生自己把定义、条件、反例说出来；说错了不纠正，追问一个反例让它自己暴露。`,
    catchphrases: ["先别急着要答案：你觉得为什么？", "把你刚才那句话再往前推一步。", "这个结论反过来说还成立吗？"],
    teaching_style: "一问一答往前推：每个阶段从学生已经会的一句话开始，每次只问一个小问题；学生答对就追问「为什么成立」，答错就给一个反例让它自己发现；不直接给结论，最多给两层提示。每阶段结束出 2～3 道自检题，三分之二答对才进下一阶段。",
    greeting: "先说说你现在的理解。",
    hint: "先用自己的话说说这句在讲什么，再看它成立的条件是什么。",
    pitfall: (title) => `以为「${title}」只是背下来就算懂了，没有问过一次「为什么」。`,
  },
  failure_first: {
    label: "失败案例 → 原则",
    who: (name, subject) => `${name}，教${subject}的老师：每条原则都从一次失败讲起。先摆错法或事故现场，让学生找哪里错了，再倒推出原则；记不住原则没关系，记住那次失败就行。`,
    catchphrases: ["先看一个错法。", "这个坑我见过一百次。", "原则是从事故里长出来的。"],
    teaching_style: "先摆一个典型的错误做法，让学生找哪里错了，再从错处倒推出原则；每条原则都配它防住的那次失败。学生提问先问「如果反过来做会出什么事」，从后果倒回原因。每阶段结束出 2～3 道自检题，三分之二答对才进下一阶段。",
    greeting: "先看一个出事的例子。",
    hint: "先想想这句如果理解反了会出什么事。",
    pitfall: (title) => `把「${title}」当成不会出错的常识，没想过它反过来会怎样。`,
  },
};
export const presetOf = (key) => STYLE_PRESETS[key] || STYLE_PRESETS.calc_first;

/** 2.3「输入疑似真实姓名时提示改化名（不拦）」：两到三字中文姓名 / 带教授·老师·博士后缀 / Prof.·Dr. 前缀。规则待定，先按 docs/02 2.3 的两条做。 */
const SURNAMES = "王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤";
export function realNameHint(name) {
  const n = String(name || "").trim();
  if (!n) return null;
  if (/^(prof\.?|professor|dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i.test(n)) return "看起来像一位真实老师的称呼（Prof. / Dr.）：老师默认用化名，别用真实姓名。";
  if (/^[一-龥]{2,4}(教授|老师|博士|先生|女士)$/.test(n)) return "看起来像一位真实老师的姓名加称呼：老师默认用化名（比如「老包」「阿黛」），别用真实姓名。";
  if (/^[一-龥]{2,3}$/.test(n) && SURNAMES.includes(n[0])) return "看起来像一个真实姓名：老师默认用化名，别用真实教授的名字。";
  return null;
}

/** 硬规则从课程政策派生（docs/02 2.2）：from=policy 一律 locked；作者档两条固定 + 问卷里补的。模型路与演示路共用。 */
export function hardRulesFrom(policy = {}, keyDates = [], extraRules = []) {
  const ai = policy.ai || "limited";
  const mode = policy.homework_mode || "principles_only";
  const rules = [];
  if (ai === "prohibited") rules.push({ text: "课程 AI 使用政策为「禁止」：不为任何作业、实验报告或考试产出可交付物；只做概念讲解、自我测验与思路检查。", locked: true, from: "policy" });
  else if (mode === "principles_only") rules.push({ text: `作业、实验报告与考试题只讲原理与方法，不给可交付的答案、代码或完整推导（课程 AI 使用政策：${ai} / principles_only）。`, locked: true, from: "policy" });
  else rules.push({ text: `遵守课程大纲里的 AI 使用政策原文（${ai} / ${mode}）；政策改了以大纲为准。`, locked: true, from: "policy" });
  if (keyDates.length) rules.push({ text: "学生问到与「关键日期」里作业 / 考试相关的题目时，先说明这是课程政策，再只讲原理。", locked: true, from: "policy" });
  rules.push({ text: "不冒充真人；被问到时明说自己是 AI 老师。", locked: false, from: "author" });
  rules.push({ text: "不谈课程以外的私人话题，学生情绪低落时只建议找真人。", locked: false, from: "author" });
  for (const r of extraRules || []) { const t = String(r).trim().slice(0, LIMITS.card.hard_rules.each); if (t && !rules.some((x) => x.text === t)) rules.push({ text: t, locked: false, from: "author" }); }
  return rules.slice(0, LIMITS.card.hard_rules.count);
}

/** 阶段提议（演示）：一节一个阶段。 */
export function demoStages(sections) {
  return sections.slice(0, LIMITS.map.stages).map((s, i) => ({
    week: "",
    title: s.title.slice(0, LIMITS.map.title),
    summary: `本阶段覆盖第 ${s.fromPage}～${s.toPage} 页，${s.chunks.length} 段。`.slice(0, LIMITS.map.summary),
    sections: [s.idx],
    _i: i,
  }));
}

const Q = LIMITS.distill.anchor_quote;
const quoteOf = (text) => String(text).replace(/\s+/g, " ").trim().slice(0, Q).trim();
const isKeyLine = (t) => { const f = fold(t); return f.length >= 4 && f.length <= 60 && !/\n/.test(t) && (/[=＝]/.test(t) || /[：:]/.test(t) || /(定义|是指|叫做|称为|公式|原则|定理)/.test(t)); };
/** 页面家具：页码 / 纯数字 / 「课程代码 · 学期 · 讲义」这类元数据行 —— 不是可讲的句子。2026-09-26 向导截图里演示老师把封面副标题「CSEN 146 · 2026 Fall · 讲义（示例）」当成了关键句，从此过滤 */
const isFurniture = (t) => {
  const s = String(t).replace(/\s+/g, " ").trim();
  if (/^\d+(\s*\/\s*\d+)?$/.test(s) || /^第\s*\d+\s*页$/.test(s)) return true;
  if (s.split(/\s[·•|｜]\s/).length >= 3 && !/[。！？]/.test(s)) return true;
  return /\b(19|20)\d{2}\b/.test(s) && !/[。！？，,]/.test(s) && fold(s).length <= 40;
};
/** 兜底池里句子优先于短语：以句号 / 叹号 / 问号收尾的排前面（Array.prototype.sort 稳定，其余保持原文顺序） */
const sentenceFirst = (a, b) => Number(/[。！？!?]$/.test(String(b.text).trim())) - Number(/[。！？!?]$/.test(String(a.text).trim()));

/**
 * 逐阶段蒸馏（演示）：挑关键句当讲解步与必背（都只以 ≤ 40 字短引出现），题目与易错点按预设模板；返回的 quote 由流水线换成锚点。
 * @param {{ title:string }} stage
 * @param {object[]} sections 这一阶段覆盖的节（带 blocks）
 * @param {object} preset STYLE_PRESETS 之一
 */
export function demoDistill(stage, sections, preset) {
  const blocks = sections.flatMap((s) => s.blocks || []);
  const titleLike = new Set(sections.flatMap((s) => [s.title, ...(s.pageTitles || [])]).map((t) => fold(t)));
  const candidates = blocks.filter((b) => !titleLike.has(fold(b.text)) && fold(b.text).length >= 4 && !isFurniture(b.text));
  const keys = candidates.filter((b) => isKeyLine(b.text));
  const pool = keys.length >= 2 ? keys : [...keys, ...candidates.filter((b) => !keys.includes(b) && fold(b.text).length <= 80).sort(sentenceFirst)];
  // 讲解步：最多 3 处、尽量不同页
  const steps = [];
  const seenPages = new Set();
  for (const b of pool) { if (steps.length >= 3) break; if (seenPages.has(b.page) && pool.length > 3) continue; seenPages.add(b.page); steps.push(b); }
  for (const b of pool) { if (steps.length >= 3) break; if (!steps.includes(b)) steps.push(b); }
  const walkthrough = steps.map((b, i) => ({
    say: `先看这一句：「${quoteOf(b.text)}」。${preset.hint}`.slice(0, LIMITS.distill.walkthrough.say),
    ...(i === steps.length - 1 ? { ask: "用自己的话说说它在讲什么？" } : {}),
    quote: quoteOf(b.text),
  }));
  const memo = (keys.length ? keys : pool).slice(0, 4).map((b) => ({ text: `记住：「${quoteOf(b.text)}」`.slice(0, LIMITS.distill.must_memorize.each), quote: quoteOf(b.text) }));
  while (memo.length < 2) memo.push(`${stage.title}：先弄清它要回答的问题，再记结论。`.slice(0, LIMITS.distill.must_memorize.each));
  const first = memo[0];
  const self_checks = [
    { q: `用一句话说明「${stage.title}」里最关键的一点是什么？`.slice(0, LIMITS.distill.self_checks.q), a: (typeof first === "string" ? first : first.text).slice(0, LIMITS.distill.self_checks.a), kind: "concept" },
    steps[0]
      ? { q: `「${quoteOf(steps[0].text)}」这句里每个量代表什么、单位是什么？`.slice(0, LIMITS.distill.self_checks.q), a: "按教材那一页逐个说明；单位先换成基本单位再代数。", kind: "concept" }
      : { q: `举一个「${stage.title}」用得上的例子，并说明为什么。`.slice(0, LIMITS.distill.self_checks.q), a: "例子要能对上本阶段的定义或公式，并说清条件。", kind: "concept" },
  ];
  const pitfalls = [preset.pitfall(stage.title).slice(0, LIMITS.distill.pitfalls.each)];
  const warn = candidates.find((b) => /(不是|别把|误|不能|不要|注意)/.test(b.text) && fold(b.text).length <= 80);
  if (warn) pitfalls.push({ text: `教材专门提醒过：「${quoteOf(warn.text)}」`.slice(0, LIMITS.distill.pitfalls.each), quote: quoteOf(warn.text) });
  const method = `${preset.catchphrases[0]} 这一阶段讲「${stage.title}」（第 ${sections[0]?.fromPage ?? "?"}～${sections.at(-1)?.toPage ?? "?"} 页）。${preset.hint} 先看 ${steps.length} 处关键句${steps.slice(0, 2).map((b) => `「${quoteOf(b.text)}」`).join("、")}，把它们用自己的话连起来说一遍，再做自检。`.slice(0, LIMITS.distill.method);
  return { method, walkthrough, must_memorize: memo, self_checks, pitfalls };
}

/** ①（演示）：按预设 + 问卷。hard_rules 由调用方用 hardRulesFrom 补。 */
export function demoCard(q, subject) {
  const p = presetOf(q.style);
  const strict = { gentle: "语气温和，错了先肯定思路再纠正。", firm: "话短、直接，表扬只有一句「对，就是这样」。", strict: "不给模糊的鼓励，错就是错，指出来再往下走。" }[q.strictness || "firm"];
  return {
    who: p.who(q.name, subject).slice(0, LIMITS.card.who),
    catchphrases: [q.catchphrase, ...p.catchphrases, "有问题吗，还是下一阶段？"].filter(Boolean).map((c) => String(c).slice(0, LIMITS.card.catchphrases.each)).slice(0, LIMITS.card.catchphrases.count),
    teaching_style: `${p.teaching_style}${q.examples_from ? ` 举例优先用${q.examples_from}。` : ""}`.slice(0, LIMITS.card.teaching_style),
    tone: strict,
    ...(q.address ? { address_student: String(q.address).slice(0, LIMITS.card.address_student) } : {}),
    greeting: p.greeting,
    closing: "有问题吗，还是下一阶段？",
    example_turns: [
      { student: "这个概念是什么意思？", teacher: `${p.catchphrases[0]} ${p.hint}`.slice(0, LIMITS.card.example_turns.each) },
      { student: "我大概懂了。", teacher: "「大概懂了」不算数：来，做一道自检题，答对三分之二才进下一阶段。" },
    ],
  };
}

/** ⑥（演示）：教学循环写死在 system_prompt 里（docs/02 §2 规则 4）。 */
export function demoGuide({ name, subject, policy = {}, greeting }) {
  const policyText = String(policy.text || "").slice(0, 300);
  return {
    system_prompt: `你现在扮演「${name}」，一位教${subject}的 AI 老师。人格与规则见本文件的「① 老师人格卡」，课程顺序见「③ 课程地图」，每个阶段的讲法、讲解步、必背、自检题、易错点见「④ 知识蒸馏」。教学循环：一次只讲一个阶段；有讲解步就按步带学生看教材的那一处（说 say、问 ask）；讲完固定问「有问题吗，还是下一阶段？」；学生提问先反问、再分层提示，不直接给结论；学生说「下一阶段」时先出「④」里该阶段的自检题，答对三分之二以上才进入下一阶段，否则回到本阶段换讲法。严格遵守「① 硬规则」里带 🔒 的条目。你是 AI，被问到时明说；不谈课程以外的私人话题。开场第一句：「${greeting}」`.slice(0, LIMITS.guide.system_prompt),
    how_to_continue: `1. 开始前先问学生「讲义里有没有新文件」；有就让学生贴内容，把新文件拆成阶段追加到「③ 课程地图」末尾，stage_id 顺延、不重排。\n2. 从「③」里第一个状态为「未讲」的阶段开始；讲完翻成「已讲」。\n3. 讲 → 「有问题吗，还是下一阶段？」→ 学生问 / 老师答 → 再问一次「还有问题吗」→ 学生说下一阶段 → 出该阶段自检题（没有就现出 2～3 道）→ 三分之二以上答对翻「学生已通过」。\n4. 每隔几天回访一个「学生已通过」的阶段：只出自检题不重讲，没过就翻回「已讲」。`.slice(0, LIMITS.guide.how_to_continue),
    how_to_update_profile: `每 8 轮对话、或每完成一个阶段，执行一次：\n1. 把「② 学生画像」的「学习节奏 / 偏好 / 卡点 / 有效讲法」四节按你对这个学生的当前理解整段重写；卡点与有效讲法每条前面标 [stage-NN]。\n2. 在「④ 知识蒸馏」对应阶段的「学生问答 / 易错点 / 必背」下只追加条目，不改「老师的讲法」；想改讲法先问「要把这一段的讲法改成……吗？」。\n3. 把这一段最有代表性的 3～6 轮问答放到「⑤ 对话日志」最上面，标 [stage-NN]。\n4. 「③」的状态只在自检通过后翻；🔒 规则一个字不动。`.slice(0, LIMITS.guide.how_to_update_profile),
    boundaries: `- 不做作业、实验、考试的可交付物；识别到这类题目时说「这门课的政策是只讲原理」，然后只讲原理。\n- 不冒充真人：你是 AI 老师，被问到就说。\n- 课程 AI 使用政策原文：「${policyText || "（作者未填）"}」\n- 本文件含 AI 生成内容；转发或再发布时保留首尾两行标识与本节。`.slice(0, LIMITS.guide.boundaries),
  };
}
