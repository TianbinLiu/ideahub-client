/**
 * @file skins/__tests__/skins.contract.test.tsx - 平台皮肤的【三级剥离证明】常驻回归测试。
 * @category Test
 *
 * ★★ 这个文件存在的理由 ★★
 * 上一版的平台皮肤【从独立皮肤退化成了配色变体】（一张 SKINS 配置表 + zhihu 别名复用 bilibili），
 * 是靠一次人工审计才发现的。skins/types.ts 里那句「一旦出现 xxxClass 就是在退回配色变体」
 * 是【给人看的、机器不检查】—— 本文件就是把那句话变成机器检查。
 *
 * 证明思路：把 8 个皮肤【真实渲染】出来，然后【三级递进剥离】，每剥一层就消灭一类「假差异」，
 * 每级都要求「8 个平台 → 8 种唯一结构」：
 *   L1  剥掉 class / style / data-*          → 消灭「换配色」（也剥掉了 data-skin 这个作弊标记）
 *   L2  在 L1 上把 <svg>…</svg> 塌缩成 <svg/> → 消灭「换图标」
 *   L3  在 L2 上把文本节点换成 ·             → 消灭「换文案」
 * ★ L3 之后剩下的是【纯标签骨架】：唯一可能的差异就是【布局】。这就是本测试的核心价值 ——
 *   一个皮肤只有真正长得不一样，才可能在 L3 活下来。
 *
 * ⚠️ 改动本文件前先读懂：把断言放宽 = 把上一版的退化重新放进来。
 *   一个永远绿的回归测试比没有更糟 —— 它给人虚假的安全感。故本文件的断言都做过【变异测试】，
 *   实测记录（想放宽任何一条之前，先把对应变异重做一遍，确认它仍然能红）：
 *
 *   变异①「ZhihuSkin 的 JSX 换成 BilibiliSkin 的结构，只改颜色与文案」
 *     → L1 绿、L2 绿、【L3 红】：bilibili == zhihu；(b) 28 组里 bilibili↔zhihu 相同。
 *     ★ L1/L2 抓不到它（文案还不一样），【只有 L3 抓得到】—— 这就是三级剥离的意义所在。
 *   变异②「skins/index.ts 里 zhihu 指回 BilibiliSkin」（复现上一版的别名复用）
 *     → (d) 红 + L1/L2/L3 全红（同一个组件 ⇒ 每一级的产物都一模一样）。
 *   变异③「DouyinSkin 换成 XiaohongshuSkin 的配色变体」（两者都【没有】(c) 点名项护着）
 *     → 恰好 2 红，且【全在 L3】：douyin == xiaohongshu。证明 L3 不靠 (c) 的人工点名也能独立拦截。
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ScenarioComment } from "../../../api";
import PlatformCommentView from "../../PlatformCommentView";
import { resolveSkin, SKIN_COMPONENTS } from "../index";
import type { SkinPlatform } from "../index";

// ──────────────────────────────────────────────────────────────────────────────
// 平台清单
// ──────────────────────────────────────────────────────────────────────────────

/** 从【真注册表】派生，而不是在测试里另抄一份 —— 新增平台会自动被纳入所有唯一性断言。 */
const PLATFORMS = Object.keys(SKIN_COMPONENTS) as SkinPlatform[];

/**
 * 冗余的显式清单：唯一性断言都是「N 个平台 → N 种结构」的形式，
 * 光靠派生的话，【删掉一个撞车的皮肤】也能把测试弄绿。这条守住「不许靠删平台来过测试」。
 */
const EXPECTED_PLATFORMS = [
  "bilibili",
  "weibo",
  "tieba",
  "zhihu",
  "instagram",
  "douyin",
  "xiaohongshu",
  "generic",
];

// ──────────────────────────────────────────────────────────────────────────────
// 夹具
// ──────────────────────────────────────────────────────────────────────────────

const TOPIC = "TOPICSENTINEL";

/**
 * 结构夹具。用【哨兵字符串】而不是像人话的文案，是为了让「这段文字出现在哪个元素里」
 * 可以被精确断言（契约点名项要区分「顶楼作者名」和「顶楼正文」到底同不同一个 <p>）。
 *
 * ★ 故意【不给 authorAvatar】：Avatar 有 url 时会渲染 <img src>，那是【用户数据】。
 *   不给头像，渲染结果里就【不该存在任何外链 <img>】—— 于是「无平台 logo」那条断言
 *   才是干净的：出现外链图片 = 皮肤自己塞了 logo。
 *
 * ★ t1 下挂 4 条回复：故意超过所有皮肤的楼中楼折叠阈值
 *   （B站 3 / 抖音 2 / 小红书 1 / IG 0），把各家的折叠行也纳入结构对比。
 */
const TOP_LEVEL_IDS = ["t1", "t2"];
const FIXTURE: ScenarioComment[] = [
  { id: "t1", authorName: "TOPAUTHORONE", text: "TOPBODYONE", likeCount: 12, isOP: true },
  { id: "t2", authorName: "TOPAUTHORTWO", text: "TOPBODYTWO", likeCount: 3 },
  { id: "r1", parentId: "t1", authorName: "REPLYAUTHORONE", text: "REPLYBODYONE", likeCount: 1 },
  { id: "r2", parentId: "r1", authorName: "REPLYAUTHORTWO", text: "REPLYBODYTWO" },
  { id: "r3", parentId: "t1", authorName: "REPLYAUTHORTHREE", text: "REPLYBODYTHREE" },
  { id: "r4", parentId: "t1", authorName: "REPLYAUTHORFOUR", text: "REPLYBODYFOUR" },
];

/** 顶楼 t1 的作者名/正文，(c) 里用来判「用户名与正文同不同一个 <p>」。 */
const TOP1_AUTHOR = "TOPAUTHORONE";
const TOP1_BODY = "TOPBODYONE";

/**
 * 脏数据夹具：喂给【真的】PlatformCommentView 防环建树。
 * ★ 这里每一条【最终都会被降级成顶楼】（环上的、指向环的、自指的、孤儿的全部降级），
 *   所以「每条评论都出现」是个对 8 个皮肤都成立的【无条件】断言 ——
 *   不受任何皮肤楼中楼折叠阈值的干扰（见下面 it 里的说明）。
 */
const DIRTY: ScenarioComment[] = [
  // 互为父子的 2 元环
  { id: "A", parentId: "B", authorName: "CYCA", text: "DIRTYBODYA" },
  { id: "B", parentId: "A", authorName: "CYCB", text: "DIRTYBODYB" },
  // 自指
  { id: "C", parentId: "C", authorName: "SELFC", text: "DIRTYBODYC" },
  // parentId 指向不存在的 id
  { id: "D", parentId: "NO_SUCH_ID", authorName: "ORPHAND", text: "DIRTYBODYD" },
  // 父亲在环上（自己不在环上，但父链会走进环）
  { id: "E", parentId: "A", authorName: "CHILDOFCYCLEE", text: "DIRTYBODYE" },
  // 3 元环 G → H → I → G
  { id: "G", parentId: "H", authorName: "CYCG", text: "DIRTYBODYG" },
  { id: "H", parentId: "I", authorName: "CYCH", text: "DIRTYBODYH" },
  { id: "I", parentId: "G", authorName: "CYCI", text: "DIRTYBODYI" },
  // 一条干净的顶楼，确保脏数据不会把正常评论一起带走
  { id: "F", authorName: "CLEANF", text: "DIRTYBODYF" },
];

// ──────────────────────────────────────────────────────────────────────────────
// 渲染 / 剥离
// ──────────────────────────────────────────────────────────────────────────────

/**
 * 走【真的】PlatformCommentView：它同时提供 ① 防环建树 ② resolveSkin 分发。
 * 测试里不复刻建树逻辑 —— 复刻一份就等于测了个假的。
 * 传 onReplyTo ⇒ 交互态（只读态下各皮肤会省掉回复入口，结构表面更小）。
 */
function renderPlatform(platform: string, comments: ScenarioComment[]): string {
  return renderToStaticMarkup(
    <PlatformCommentView platform={platform} comments={comments} topic={TOPIC} onReplyTo={() => {}} />
  );
}

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

/** 每个平台渲染一次（夹具固定、渲染是纯函数），后面所有断言复用。 */
const MARKUP: Record<string, string> = Object.fromEntries(
  PLATFORMS.map((p) => [p, renderPlatform(p, FIXTURE)])
);

type StripLevel = 1 | 2 | 3;

/**
 * L3 会把这些【承载文案的属性】的值也换成 ·。
 *
 * ★ 这是对「L3 = 消灭换文案」的忠实实现，不是加戏：
 *   B站 的点踩是 <span title="点踩">，文案藏在属性里。若 L3 只换文本节点，
 *   一个「照抄 B站 结构、只把 title 改成别的字」的配色变体就能在 L3 活下来 ——
 *   那 L3「剩下的纯标签骨架里唯一可能的差异就是布局」这句话就不成立了。
 *   属性【是否存在】仍然保留（有没有 tooltip 是结构），只把【值】归一。
 */
const TEXTY_ATTRS = new Set(["title", "alt", "aria-label", "placeholder"]);

/** L1 起就丢掉的属性：配色（class/style）与作弊标记（data-skin 这类 data-*）。 */
function isStrippedAttr(name: string): boolean {
  return name === "class" || name === "style" || name.startsWith("data-");
}

function serialize(node: Node, level: StripLevel, out: string[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = (node.nodeValue ?? "").replace(/\s+/g, " ").trim();
    // 纯空白不计入结构。注意这是【收紧】不是放宽：少了一批可被随手改动的差异来源。
    if (!t) return;
    out.push(level === 3 ? "·" : `#${t}`);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;

  const el = node as Element;
  const tag = el.tagName.toLowerCase();

  // L2：整棵 svg 子树塌缩成 <svg/> —— 连 svg 自己的 width/stroke/viewBox 一起消失，
  // 于是「换个 lucide 图标」不再制造结构差异。
  if (level >= 2 && tag === "svg") {
    out.push("<svg/>");
    return;
  }

  const attrs = Array.from(el.attributes)
    .filter((a) => !isStrippedAttr(a.name))
    .map((a) => `${a.name}=${JSON.stringify(level === 3 && TEXTY_ATTRS.has(a.name) ? "·" : a.value)}`)
    .sort(); // 属性顺序不是结构，排序后比较

  out.push(`<${tag}${attrs.length > 0 ? ` ${attrs.join(" ")}` : ""}>`);
  for (const child of Array.from(el.childNodes)) serialize(child, level, out);
  out.push(`</${tag}>`);
}

/** 把渲染结果剥离成某一级的结构指纹。 */
function skeleton(html: string, level: StripLevel): string {
  const out: string[] = [];
  for (const child of Array.from(parse(html).body.childNodes)) serialize(child, level, out);
  return out.join("");
}

/**
 * 逐个文本节点取文本（不是 textContent）。
 * textContent 会把相邻元素的文字【拼起来】，能拼出「作者名尾部的数字」+「楼主」= "1楼"
 * 这种假命中；按节点取就不会。
 */
function textNodes(html: string): string[] {
  const doc = parse(html);
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  for (let n = walker.nextNode(); n != null; n = walker.nextNode()) {
    const t = (n.nodeValue ?? "").trim();
    if (t) out.push(t);
  }
  return out;
}

/** 哪些平台的渲染结果里，有【单个文本节点】命中 re。 */
function platformsWithText(re: RegExp): SkinPlatform[] {
  return PLATFORMS.filter((p) => textNodes(MARKUP[p]).some((t) => re.test(t)));
}

function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

// ──────────────────────────────────────────────────────────────────────────────

describe("平台皮肤 · 注册表", () => {
  it("就是这 8 个平台（不许靠删平台来过唯一性断言）", () => {
    expect([...PLATFORMS].sort()).toEqual([...EXPECTED_PLATFORMS].sort());
  });

  // (d) 无别名复用
  it("(d) 8 个平台 → 8 个【不同的组件函数引用】，没有别名复用", () => {
    const comps = PLATFORMS.map((p) => resolveSkin(p));

    const byComp = new Map<unknown, SkinPlatform[]>();
    PLATFORMS.forEach((p, i) => {
      const g = byComp.get(comps[i]);
      if (g) g.push(p);
      else byComp.set(comps[i], [p]);
    });
    const aliased = [...byComp.values()].filter((g) => g.length > 1);
    expect(aliased, `别名复用（多个 platform 指向同一个皮肤）：${JSON.stringify(aliased)}`).toEqual([]);
    expect(new Set(comps).size).toBe(PLATFORMS.length);

    // 上一版真实踩过的两处别名，显式钉死
    expect(resolveSkin("zhihu"), "zhihu 又指回 bilibili 皮肤了").not.toBe(resolveSkin("bilibili"));
    expect(resolveSkin("instagram"), "instagram 又指回 weibo 皮肤了").not.toBe(resolveSkin("weibo"));
  });
});

// (a) 三级剥离，每级 8/8 唯一
describe("平台皮肤 · 三级剥离证明", () => {
  const LEVEL_MEANING: Record<StripLevel, string> = {
    1: "剥掉 class/style/data-* 后（换配色不算差异）",
    2: "再把 svg 塌缩后（换图标不算差异）",
    3: "再把文本换成 · 后（换文案不算差异）—— 剩下的只有布局",
  };

  for (const level of [1, 2, 3] as StripLevel[]) {
    it(`(a) L${level}：${LEVEL_MEANING[level]}，8 个平台仍是 8 种唯一结构`, () => {
      const byShape = new Map<string, SkinPlatform[]>();
      for (const p of PLATFORMS) {
        const key = skeleton(MARKUP[p], level);
        const g = byShape.get(key);
        if (g) g.push(p);
        else byShape.set(key, [p]);
      }

      const collisions = [...byShape.values()].filter((g) => g.length > 1);
      expect(
        collisions,
        `L${level} 结构撞车 —— 这些平台剥离后长得一模一样，说明它们只差配色/图标/文案，` +
          `不是独立皮肤：${collisions.map((g) => g.join(" == ")).join(" | ")}`
      ).toEqual([]);
      expect(byShape.size).toBe(PLATFORMS.length);
    });
  }

  // (b) L3 下 28 组两两对比
  it("(b) L3：C(8,2)=28 组两两对比全部不同", () => {
    const shapes = new Map<SkinPlatform, string>(PLATFORMS.map((p) => [p, skeleton(MARKUP[p], 3)]));

    const pairs: [SkinPlatform, SkinPlatform][] = [];
    for (let i = 0; i < PLATFORMS.length; i++) {
      for (let j = i + 1; j < PLATFORMS.length; j++) pairs.push([PLATFORMS[i], PLATFORMS[j]]);
    }
    expect(pairs.length).toBe(28);

    const identical = pairs.filter(([a, b]) => shapes.get(a) === shapes.get(b));
    expect(
      identical,
      `L3 骨架相同的平台对（= 布局完全一样，只是配色/图标/文案不同）：` +
        `${identical.map(([a, b]) => `${a}↔${b}`).join(", ")}`
    ).toEqual([]);
  });
});

// (c) 契约点名项 + 唯一性
describe("平台皮肤 · 契约点名的布局特征（且只有该平台有）", () => {
  it("(c1) IG：顶楼用户名与正文在同一个 <p> 内，且只有 IG 如此", () => {
    const hits = PLATFORMS.filter((p) =>
      Array.from(parse(MARKUP[p]).querySelectorAll("p")).some((el) => {
        const t = el.textContent ?? "";
        return t.includes(TOP1_AUTHOR) && t.includes(TOP1_BODY);
      })
    );
    expect(hits, "「顶楼用户名与正文同一个 <p>」是 IG 的招牌结构，应当【有且仅有】它").toEqual([
      "instagram",
    ]);
  });

  it("(c2) 贴吧：有「N楼」文本，且只有贴吧有", () => {
    expect(platformsWithText(/\d+楼/)).toEqual(["tieba"]);
  });

  it("(c3) 微博：操作条恰 3 个子元素，且只有微博有「转发」", () => {
    expect(platformsWithText(/转发/)).toEqual(["weibo"]);

    // 不靠 class 定位：找「包着『转发』且子元素里再没有『转发』」的那个元素 = 三键条的第一格，
    // 它的父节点就是操作条本身。
    const doc = parse(MARKUP.weibo);
    const cells = Array.from(doc.querySelectorAll("*")).filter(
      (el) =>
        (el.textContent ?? "").includes("转发") &&
        !Array.from(el.children).some((c) => (c.textContent ?? "").includes("转发"))
    );
    expect(cells.length, "每个顶楼应有且仅有一条三键条").toBe(TOP_LEVEL_IDS.length);
    for (const cell of cells) {
      expect(cell.parentElement?.children.length, "微博操作条必须恰好是「转发/评论/赞」三格").toBe(3);
    }
  });

  it("(c4) 知乎：有「赞同」「反对」，且只有知乎有", () => {
    expect(platformsWithText(/赞同/)).toEqual(["zhihu"]);
    expect(platformsWithText(/反对/)).toEqual(["zhihu"]);
  });
});

// (e) 无平台 logo
describe("平台皮肤 · 不搬运平台 logo", () => {
  it.each(PLATFORMS)("(e) %s 皮肤：不引任何图片、无 <use>、svg 只能是 lucide 线稿", (platform) => {
    const doc = parse(MARKUP[platform]);

    // 夹具【故意不给 authorAvatar】（Avatar 有 url 才渲染 <img>）⇒ 这里出现的任何 <img>
    // 都只可能是皮肤自己塞的。
    // ★ 断言的是「一个 <img> 都不许有」而不是「不许有 http 图片」：
    //   只拦 /^https?:/ 的话，`<img src="data:image/svg+xml;base64,…">` 内嵌 logo 直接放行 ——
    //   而那正是最省事的搬 logo 方式。（这条是审查实测出来的漏，不是假想。）
    const imgs = Array.from(doc.querySelectorAll("img")).map((img) => (img.getAttribute("src") ?? "").slice(0, 60));
    expect(imgs, `${platform} 皮肤引了图片（夹具没给头像，所以只可能是皮肤自己塞的 logo）：${imgs.join(", ")}`).toEqual([]);

    expect(doc.querySelectorAll("use").length, `${platform} 皮肤用了 <use>（多半在引 logo sprite）`).toBe(0);

    // ★ 内联 SVG 也能搬 logo：从品牌套件复制一条 path 进来就是
    //   `<svg viewBox="0 0 24 24"><path d="…"/></svg>` —— 上面两条全拦不住，
    //   而 L2 会把每个 <svg> 子树塌缩成 <svg/>，结构断言对 svg 内容同样是瞎的。
    //   故要求：皮肤里的每个 svg 都必须带 lucide 的签名（fill="none" + stroke="currentColor" 线稿）。
    //   品牌 logo 几乎都是 fill 实心图形，会当场撞上这条。
    // ⚠️ 这是【启发式，不是证明】：手工描一个纯 stroke 的 logo 仍能混过去。
    //   它抬高成本、堵住现实中最省事的那条路，但不等于「不可能搬 logo」。
    const badSvgs = Array.from(doc.querySelectorAll("svg")).filter(
      (svg) => svg.getAttribute("fill") !== "none" || svg.getAttribute("stroke") !== "currentColor"
    );
    expect(
      badSvgs.map((s) => `fill=${s.getAttribute("fill")} stroke=${s.getAttribute("stroke")}`),
      `${platform} 皮肤里有非 lucide 线稿的内联 svg（实心图形多半是品牌 logo）`
    ).toEqual([]);
  });
});

// (f) 防环建树
describe("平台皮肤 · 防环建树（既有已修复两次的 bug）", () => {
  it.each(PLATFORMS)(
    "(f) %s 皮肤：喂环/自指/孤儿 parentId 仍渲染完成，且每条评论恰好出现一次",
    (platform) => {
      // 渲染本身就是断言：栈溢出会抛异常，无限递归会撞下面的超时。
      const html = renderPlatform(platform, DIRTY);

      // DIRTY 里每条都会被降级为顶楼 ⇒ 没有任何皮肤会把它们折叠起来
      // （IG 的楼中楼阈值是 0，只要成了楼中楼就会被折进「View replies (N)」，
      //   所以「每条都出现」这条断言只有在【全员顶楼】的夹具上才是无条件成立的）。
      for (const c of DIRTY) {
        const n = countOccurrences(html, c.text);
        expect(
          n,
          `${platform} 皮肤把 ${c.id} 渲染了 ${n} 次（应为 1）：` +
            `0 = 防环建树把它静默丢了；>1 = 环导致重复渲染`
        ).toBe(1);
      }
    },
    5_000
  );
});
