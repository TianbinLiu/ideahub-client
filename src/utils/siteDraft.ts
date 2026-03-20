export type SiteDraftNodeStyle = {
  x: number;
  y: number;
  width: number;
  height: number;
  css: string;
};

export type SiteDraftWidget = {
  id: string;
  type: "text" | "button" | "badge" | "image" | "card" | "link-list" | "form";
  text: string;
  href?: string;
  imageUrl?: string;
  items?: string[];
  fields?: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  css: string;
};

export type SiteDraftPage = {
  backgroundType: "none" | "image" | "video" | "gradient";
  backgroundUrl?: string;
  nodes: Record<string, SiteDraftNodeStyle>;
  widgets?: SiteDraftWidget[];
};

export type SiteDraft = {
  pages: Record<string, SiteDraftPage>;
};

const SAFE_CSS_PROPERTIES = new Set([
  "color",
  "background-color",
  "border-color",
  "border-radius",
  "font-size",
  "font-weight",
  "letter-spacing",
  "line-height",
  "padding",
  "margin",
  "box-shadow",
  "opacity",
  "text-transform",
  "text-decoration",
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function nodeTagIndex(el: Element) {
  const tag = el.tagName;
  let idx = 1;
  let cur = el.previousElementSibling;
  while (cur) {
    if (cur.tagName === tag) idx += 1;
    cur = cur.previousElementSibling;
  }
  return idx;
}

export function domPathSelector(el: Element, root: Element) {
  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== root) {
    parts.push(`${cur.tagName.toLowerCase()}:nth-of-type(${nodeTagIndex(cur)})`);
    cur = cur.parentElement;
  }
  if (cur === root) parts.push(root.tagName.toLowerCase());
  return parts.reverse().join(">");
}

export function sanitizeCssBlock(input?: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";

  const lowered = raw.toLowerCase();
  if (/(^|\s)@import|url\s*\(|expression\s*\(|javascript:|behavior\s*:|<\/?style/i.test(lowered)) return "";

  const declarations = raw
    .split(";")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx <= 0) return null;
      const prop = line.slice(0, idx).trim().toLowerCase();
      const value = line.slice(idx + 1).trim();
      if (!SAFE_CSS_PROPERTIES.has(prop) || !value) return null;
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .slice(0, 60);

  return declarations.join("; ");
}

export function normalizeSiteDraft(input: unknown): SiteDraft {
  const src = input && typeof input === "object" ? (input as any) : {};
  const pagesIn = src.pages && typeof src.pages === "object" ? src.pages : {};
  const pages: Record<string, SiteDraftPage> = {};

  Object.entries(pagesIn).slice(0, 40).forEach(([key, value]) => {
    const pageKey = String(key || "").trim().slice(0, 120);
    if (!pageKey) return;
    const page = value && typeof value === "object" ? (value as any) : {};
    const bt = ["none", "image", "video", "gradient"].includes(String(page.backgroundType || ""))
      ? (String(page.backgroundType) as SiteDraftPage["backgroundType"])
      : "none";
    const nodesIn = page.nodes && typeof page.nodes === "object" ? page.nodes : {};
    const nodes: Record<string, SiteDraftNodeStyle> = {};
    const widgetsIn = Array.isArray(page.widgets) ? page.widgets : [];
    const widgets: SiteDraftWidget[] = [];

    Object.entries(nodesIn).slice(0, 500).forEach(([nodeId, nodeValue]) => {
      const id = String(nodeId || "").trim().slice(0, 200);
      if (!id) return;
      const nv = nodeValue && typeof nodeValue === "object" ? (nodeValue as any) : {};
      nodes[id] = {
        x: clamp(Number(nv.x) || 0, -4000, 4000),
        y: clamp(Number(nv.y) || 0, -4000, 4000),
        width: clamp(Number(nv.width) || 0, 0, 8000),
        height: clamp(Number(nv.height) || 0, 0, 8000),
        css: sanitizeCssBlock(nv.css || ""),
      };
    });

    widgetsIn.slice(0, 80).forEach((item: any, index: number) => {
      const id = String(item?.id || `widget_${index + 1}`).trim().slice(0, 120);
      if (!id) return;
      const typeRaw = String(item?.type || "text").toLowerCase();
      const type: SiteDraftWidget["type"] =
        typeRaw === "button" ? "button"
          : typeRaw === "badge" ? "badge"
            : typeRaw === "image" ? "image"
              : typeRaw === "card" ? "card"
                : typeRaw === "link-list" ? "link-list"
                  : typeRaw === "form" ? "form"
                    : "text";
      widgets.push({
        id,
        type,
        text: String(item?.text || "New widget").trim().slice(0, 200),
        href: String(item?.href || "").trim().slice(0, 600),
        imageUrl: String(item?.imageUrl || "").trim().slice(0, 1000),
        items: Array.isArray(item?.items)
          ? item.items.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 20)
          : [],
        fields: Array.isArray(item?.fields)
          ? item.fields.map((x: any) => String(x || "").trim()).filter(Boolean).slice(0, 12)
          : [],
        x: clamp(Number(item?.x) || 0, -4000, 4000),
        y: clamp(Number(item?.y) || 0, -4000, 4000),
        width: clamp(Number(item?.width) || 180, 40, 2000),
        height: clamp(Number(item?.height) || 44, 20, 1200),
        css: sanitizeCssBlock(item?.css || ""),
      });
    });

    pages[pageKey] = {
      backgroundType: bt,
      backgroundUrl: String(page.backgroundUrl || "").trim().slice(0, 1000),
      nodes,
      widgets,
    };
  });

  return { pages };
}

export function getPageDraftKey(pathname: string) {
  const value = String(pathname || "/").trim() || "/";
  return value.startsWith("/") ? value : `/${value}`;
}

export function extractStyleSnippet(el: HTMLElement) {
  const cs = getComputedStyle(el);
  return [
    `color: ${cs.color}`,
    `background-color: ${cs.backgroundColor}`,
    `border-color: ${cs.borderColor}`,
    `border-radius: ${cs.borderRadius}`,
    `font-size: ${cs.fontSize}`,
    `font-weight: ${cs.fontWeight}`,
    `line-height: ${cs.lineHeight}`,
    `padding: ${cs.padding}`,
    `margin: ${cs.margin}`,
    `box-shadow: ${cs.boxShadow}`,
    `opacity: ${cs.opacity}`,
  ].join("; ");
}
