// PPTX 幻灯片 XML → 块（纯函数，Node 的 extract.js 与浏览器的 web/src/extract/pptx.ts 共用；JSZip 解包各自做）。
// 每个 <p:sp> 是一个形状；标题占位符（<p:ph type="title|ctrTitle">）当页标题。每个 <a:p> 是一段，段内 <a:t> 直接拼；
// 只认正文 runs，不碰备注（备注可能是讲师私货，且不是学生看到的教材）。
export function slideFileOrder(names) {
  return names
    .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml$/)[1]) - Number(b.match(/slide(\d+)\.xml$/)[1]));
}

/** @returns {{ title?: string, blocks: { text: string }[] }} */
export function slideBlocksFromXml(xml) {
  const blocks = [];
  let title;
  for (const sp of String(xml).split(/<p:sp[ >]/).slice(1)) {
    const isTitle = /<p:ph[^>]*type="(?:title|ctrTitle)"/.test(sp.split("</p:nvSpPr>")[0] || "");
    const paras = [];
    for (const p of sp.split(/<a:p[ >]/).slice(1)) {
      const runs = [...p.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g)].map((m) => decodeXml(m[1]));
      const text = runs.join("").trim();
      if (text) paras.push(text);
    }
    if (!paras.length) continue;
    if (isTitle && !title) { title = paras.join(" "); blocks.push({ text: title }); }
    else for (const t of paras) blocks.push({ text: t });
  }
  return title ? { title, blocks } : { blocks };
}

export function decodeXml(s) {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d))).replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
}
