import type { WorkshopTemplate } from "../api";
import { getPageDraftKey, normalizeSiteDraft } from "./siteDraft";

export const ACTIVE_WORKSHOP_TEMPLATE_KEY = "activeWorkshopTemplate";

function safeNumber(value: unknown, fallback: number, min: number, max: number) {
  const num = Number(value);
  if (Number.isNaN(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function sanitizeCssBlock(input?: string) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const lowered = raw.toLowerCase();
  if (/(^|\s)@import|url\s*\(|expression\s*\(|javascript:|behavior\s*:|<\/?style/i.test(lowered)) return "";
  return raw.slice(0, 2000);
}

export function saveActiveWorkshopTemplate(template: WorkshopTemplate | null) {
  try {
    if (!template) {
      localStorage.removeItem(ACTIVE_WORKSHOP_TEMPLATE_KEY);
      return;
    }
    localStorage.setItem(ACTIVE_WORKSHOP_TEMPLATE_KEY, JSON.stringify(template));
  } catch {
    // ignore
  }
}

export function readActiveWorkshopTemplate(): WorkshopTemplate | null {
  try {
    const raw = localStorage.getItem(ACTIVE_WORKSHOP_TEMPLATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed._id) return null;
    return parsed as WorkshopTemplate;
  } catch {
    return null;
  }
}

export function applyWorkshopTemplateToDocument(template: WorkshopTemplate | null) {
  const root = document.documentElement;
  const body = document.body;

  const styleId = "workshop-template-inline-style";
  let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }

  if (!template || template.isDefault) {
    body.classList.remove("workshop-template-active");
    root.style.removeProperty("--ws-accent");
    root.style.removeProperty("--ws-text");
    root.style.removeProperty("--ws-card-radius");
    root.style.removeProperty("--ws-card-opacity");
    styleEl.textContent = "";
    return;
  }

  const theme = template.theme || ({} as any);
  body.classList.add("workshop-template-active");
  root.style.setProperty("--ws-accent", String(theme.accentColor || "#22d3ee"));
  root.style.setProperty("--ws-text", String(theme.textColor || "#f3f4f6"));
  root.style.setProperty("--ws-card-radius", `${safeNumber(theme.cardRadius, 16, 0, 48)}px`);
  root.style.setProperty("--ws-card-opacity", String(safeNumber(theme.cardOpacity, 0.92, 0.25, 1)));

  const cardCss = sanitizeCssBlock(theme?.componentCss?.card);
  const buttonCss = sanitizeCssBlock(theme?.componentCss?.button);
  const titleCss = sanitizeCssBlock(theme?.componentCss?.title);
  const customCss = sanitizeCssBlock(theme?.customCss);

  const siteDraft = normalizeSiteDraft(template.siteDraft);
  const pageKey = getPageDraftKey(window.location.pathname);
  const pageDraft = siteDraft.pages[pageKey];

  let nodeCss = "";
  if (pageDraft?.nodes && typeof pageDraft.nodes === "object") {
    nodeCss = Object.entries(pageDraft.nodes)
      .slice(0, 500)
      .map(([nodeId, item]) => {
        const width = Number(item.width) > 0 ? `width:${Number(item.width)}px!important;` : "";
        const height = Number(item.height) > 0 ? `height:${Number(item.height)}px!important;` : "";
        const transform = `transform:translate(${Number(item.x) || 0}px,${Number(item.y) || 0}px)!important;`;
        const css = String(item.css || "");
        return `body.workshop-template-active [data-ws-node-id="${nodeId}"]{${transform}${width}${height}${css}}`;
      })
      .join("\n");
  }

  styleEl.textContent = `
body.workshop-template-active .rounded-2xl { border-radius: var(--ws-card-radius); }
body.workshop-template-active .bg-gray-900 { background-color: rgba(17,24,39,var(--ws-card-opacity)); }
body.workshop-template-active .text-white { color: var(--ws-text); }
body.workshop-template-active .text-cyan-300,
body.workshop-template-active .text-purple-300,
body.workshop-template-active .border-cyan-500,
body.workshop-template-active .bg-cyan-900\/30 { color: var(--ws-accent); border-color: var(--ws-accent); }
body.workshop-template-active .ws-card { ${cardCss} }
body.workshop-template-active .ws-button { ${buttonCss} }
body.workshop-template-active .ws-title { ${titleCss} }
body.workshop-template-active .ws-custom { ${customCss} }
${nodeCss}
`;

  const bgLayerId = "workshop-template-page-bg";
  let bgLayer = document.getElementById(bgLayerId) as HTMLDivElement | null;
  if (!bgLayer) {
    bgLayer = document.createElement("div");
    bgLayer.id = bgLayerId;
    bgLayer.style.position = "fixed";
    bgLayer.style.inset = "0";
    bgLayer.style.pointerEvents = "none";
    bgLayer.style.zIndex = "-2";
    document.body.appendChild(bgLayer);
  }

  if (!pageDraft || pageDraft.backgroundType === "none" || !pageDraft.backgroundUrl) {
    bgLayer.innerHTML = "";
    return;
  }

  if (pageDraft.backgroundType === "video") {
    bgLayer.innerHTML = `<video src="${pageDraft.backgroundUrl}" autoplay loop muted playsinline style="width:100%;height:100%;object-fit:cover;opacity:.45"></video>`;
  } else {
    bgLayer.innerHTML = "";
    bgLayer.style.backgroundImage = `url(${pageDraft.backgroundUrl})`;
    bgLayer.style.backgroundSize = "cover";
    bgLayer.style.backgroundPosition = "center";
    bgLayer.style.opacity = "0.45";
  }
}
