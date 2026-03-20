import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { apiUploadMedia } from "../api";
import {
  domPathSelector,
  extractStyleSnippet,
  getPageDraftKey,
  normalizeSiteDraft,
  sanitizeCssBlock,
  type SiteDraft,
  type SiteDraftNodeStyle,
} from "../utils/siteDraft";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";
import SiteGlobalAiAssistant, { applyOpsToDraft } from "./SiteGlobalAiAssistant";

// ── Constants ────────────────────────────────────────────────────────────────

const EDIT_STATE_KEY = "siteTemplateEditState";
const EDIT_DRAFT_KEY = "siteTemplateEditDraft";
const PENDING_TEMPLATE_DRAFT_KEY = "pendingWorkshopTemplateDraft";

// ── Types ────────────────────────────────────────────────────────────────────

type DragState =
  | { mode: "move"; nodeId: string; startX: number; startY: number; originX: number; originY: number }
  | { mode: "resize"; nodeId: string; startX: number; startY: number; originW: number; originH: number };

type CssFormValues = {
  color: string;
  backgroundColor: string;
  borderRadius: string;
  borderColor: string;
  fontSize: string;
  fontWeight: string;
  letterSpacing: string;
  lineHeight: string;
  padding: string;
  margin: string;
  boxShadow: string;
  opacity: string;
  textTransform: string;
  textDecoration: string;
};

const EMPTY_FORM: CssFormValues = {
  color: "",
  backgroundColor: "",
  borderRadius: "",
  borderColor: "",
  fontSize: "",
  fontWeight: "",
  letterSpacing: "",
  lineHeight: "",
  padding: "",
  margin: "",
  boxShadow: "",
  opacity: "",
  textTransform: "",
  textDecoration: "",
};

// ── CSS form utilities ───────────────────────────────────────────────────────

function extractProp(css: string, prop: string): string {
  const escaped = prop.replace(/-/g, "\\-");
  const m = new RegExp(
    `(?:^|;)\\s*${escaped}\\s*:\\s*([^;!]+?)\\s*(?:!important)?\\s*(?:;|$)`,
    "i"
  ).exec(css);
  return m ? m[1].trim() : "";
}

function parseCssToForm(css: string): CssFormValues {
  return {
    color: extractProp(css, "color"),
    backgroundColor: extractProp(css, "background-color"),
    borderRadius: extractProp(css, "border-radius"),
    borderColor: extractProp(css, "border-color"),
    fontSize: extractProp(css, "font-size"),
    fontWeight: extractProp(css, "font-weight"),
    letterSpacing: extractProp(css, "letter-spacing"),
    lineHeight: extractProp(css, "line-height"),
    padding: extractProp(css, "padding"),
    margin: extractProp(css, "margin"),
    boxShadow: extractProp(css, "box-shadow"),
    opacity: extractProp(css, "opacity"),
    textTransform: extractProp(css, "text-transform"),
    textDecoration: extractProp(css, "text-decoration"),
  };
}

function formToCss(form: CssFormValues): string {
  const parts: string[] = [];
  if (form.color) parts.push(`color: ${form.color}`);
  if (form.backgroundColor) parts.push(`background-color: ${form.backgroundColor}`);
  if (form.borderRadius) parts.push(`border-radius: ${form.borderRadius}`);
  if (form.borderColor) parts.push(`border-color: ${form.borderColor}`);
  if (form.fontSize) parts.push(`font-size: ${form.fontSize}`);
  if (form.fontWeight) parts.push(`font-weight: ${form.fontWeight}`);
  if (form.letterSpacing) parts.push(`letter-spacing: ${form.letterSpacing}`);
  if (form.lineHeight) parts.push(`line-height: ${form.lineHeight}`);
  if (form.padding) parts.push(`padding: ${form.padding}`);
  if (form.margin) parts.push(`margin: ${form.margin}`);
  if (form.boxShadow) parts.push(`box-shadow: ${form.boxShadow}`);
  if (form.opacity) parts.push(`opacity: ${form.opacity}`);
  if (form.textTransform) parts.push(`text-transform: ${form.textTransform}`);
  if (form.textDecoration) parts.push(`text-decoration: ${form.textDecoration}`);
  return parts.join("; ");
}

/** Return value only if it looks like a CSS hex color (for color-picker binding). */
function toHexColor(value: string): string {
  return /^#[0-9a-f]{3,8}$/i.test(value.trim()) ? value.trim() : "";
}

// ── Dom utilities ────────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function collectEditableNodes(root: HTMLElement) {
  const nodes = Array.from(root.querySelectorAll<HTMLElement>("div,section,article,nav,main,header,footer,aside"));
  return nodes.filter((node) => {
    if (!node.isConnected) return false;
    if (node.closest("[data-ws-editor-ui='1']")) return false;
    if (node.dataset.wsIgnore === "1") return false;
    const rect = node.getBoundingClientRect();
    if (rect.width < 24 || rect.height < 18) return false;
    const style = getComputedStyle(node);
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  });
}

function ensureNodeIds() {
  const root = document.getElementById("root");
  if (!root) return;
  collectEditableNodes(root).forEach((node) => {
    if (!node.dataset.wsNodeId) node.dataset.wsNodeId = domPathSelector(node, root);
  });
}

function readDraft(): SiteDraft {
  try {
    return normalizeSiteDraft(JSON.parse(localStorage.getItem(EDIT_DRAFT_KEY) || "{}"));
  } catch {
    return { pages: {} };
  }
}

function readEnabled() {
  try {
    return localStorage.getItem(EDIT_STATE_KEY) === "on";
  } catch {
    return false;
  }
}

function writeDraft(next: SiteDraft) {
  localStorage.setItem(EDIT_DRAFT_KEY, JSON.stringify(next));
}

function writeEnabled(next: boolean) {
  localStorage.setItem(EDIT_STATE_KEY, next ? "on" : "off");
}

function getOrInitNodeStyle(
  draft: SiteDraft,
  pageKey: string,
  nodeId: string,
  el: HTMLElement
): SiteDraftNodeStyle {
  const page = draft.pages[pageKey] || { backgroundType: "none", backgroundUrl: "", nodes: {} };
  const node = page.nodes[nodeId];
  if (node) return node;
  const rect = el.getBoundingClientRect();
  return { x: 0, y: 0, width: Math.round(rect.width), height: Math.round(rect.height), css: "" };
}

function cloneDraft(draft: SiteDraft): SiteDraft {
  return normalizeSiteDraft(JSON.parse(JSON.stringify(draft || { pages: {} })));
}

function cssTextToReactStyle(cssText?: string): React.CSSProperties {
  const style: React.CSSProperties = {};
  const raw = String(cssText || "").trim();
  if (!raw) return style;
  raw.split(";").map((x) => x.trim()).filter(Boolean).forEach((item) => {
    const idx = item.indexOf(":");
    if (idx <= 0) return;
    const prop = item.slice(0, idx).trim();
    const value = item.slice(idx + 1).trim();
    const key = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    (style as any)[key] = value;
  });
  return style;
}

export default function SiteTemplateEditOverlay() {
  const navigate = useNavigate();
  const location = useLocation();

  const [enabled, setEnabled] = useState(readEnabled());
  const [draft, setDraft] = useState<SiteDraft>(readDraft());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // CSS panel state
  const [showCssPanel, setShowCssPanel] = useState(false);
  const [formMode, setFormMode] = useState(true);
  const [cssInput, setCssInput] = useState("");
  const [formValues, setFormValues] = useState<CssFormValues>(EMPTY_FORM);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [uploadingBg, setUploadingBg] = useState(false);
  const [pastDrafts, setPastDrafts] = useState<SiteDraft[]>([]);
  const [futureDrafts, setFutureDrafts] = useState<SiteDraft[]>([]);

  // Refs for imperative overlay boxes (bypasses React re-renders on every RAF tick)
  const styleElRef = useRef<HTMLStyleElement | null>(null);
  const hoverBoxRef = useRef<HTMLDivElement | null>(null);
  const selectionBoxRef = useRef<HTMLDivElement | null>(null);
  const selectionLabelRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number>(0);
  const draftRef = useRef<SiteDraft>(draft);
  const pastDraftsRef = useRef<SiteDraft[]>(pastDrafts);
  const futureDraftsRef = useRef<SiteDraft[]>(futureDrafts);

  // Keep refs in sync with state so the RAF can read them without stale closures
  const selectedNodeIdRef = useRef<string | null>(null);
  const hoveredNodeIdRef = useRef<string | null>(null);
  useEffect(() => { selectedNodeIdRef.current = selectedNodeId; }, [selectedNodeId]);
  useEffect(() => { hoveredNodeIdRef.current = hoveredNodeId; }, [hoveredNodeId]);
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { pastDraftsRef.current = pastDrafts; }, [pastDrafts]);
  useEffect(() => { futureDraftsRef.current = futureDrafts; }, [futureDrafts]);

  const pageKey = useMemo(() => getPageDraftKey(location.pathname), [location.pathname]);
  const pageDraft = draft.pages[pageKey] || { backgroundType: "none" as const, backgroundUrl: "", nodes: {} };

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    if (query.get("siteEdit") === "1") {
      setEnabled(true);
      query.delete("siteEdit");
      navigate({ pathname: location.pathname, search: query.toString() ? `?${query.toString()}` : "" }, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!enabled) return;
    ensureNodeIds();
  }, [enabled, location.pathname]);

  useEffect(() => { writeEnabled(enabled); }, [enabled]);
  useEffect(() => { writeDraft(draft); }, [draft]);

  function pushHistorySnapshot(snapshot: SiteDraft) {
    setPastDrafts((prev) => [...prev.slice(-59), cloneDraft(snapshot)]);
    setFutureDrafts([]);
  }

  function commitDraftChange(updater: (base: SiteDraft) => SiteDraft) {
    setDraft((prev) => {
      const base = cloneDraft(prev);
      const next = cloneDraft(updater(base));
      const changed = JSON.stringify(base) !== JSON.stringify(next);
      if (changed) {
        setPastDrafts((history) => [...history.slice(-59), base]);
        setFutureDrafts([]);
      }
      return next;
    });
  }

  function undoDraftChange() {
    const history = pastDraftsRef.current;
    if (!history.length) return;
    const current = cloneDraft(draftRef.current);
    const previous = cloneDraft(history[history.length - 1]);
    const nextHistory = history.slice(0, -1);
    setPastDrafts(nextHistory);
    setFutureDrafts((future) => [current, ...future].slice(0, 60));
    setDraft(previous);
  }

  function redoDraftChange() {
    const future = futureDraftsRef.current;
    if (!future.length) return;
    const current = cloneDraft(draftRef.current);
    const next = cloneDraft(future[0]);
    const remain = future.slice(1);
    setFutureDrafts(remain);
    setPastDrafts((history) => [...history.slice(-59), current]);
    setDraft(next);
  }

  function resetEditSession() {
    setEnabled(false);
    setShowCssPanel(false);
    setSelectedNodeId(null);
    setHoveredNodeId(null);
    setDragState(null);
    setPastDrafts([]);
    setFutureDrafts([]);
    const empty = { pages: {} } as SiteDraft;
    setDraft(empty);
    localStorage.removeItem(EDIT_DRAFT_KEY);
    localStorage.removeItem(EDIT_STATE_KEY);
  }

  useEffect(() => {
    if (!enabled) return;
    function onKeyDown(event: KeyboardEvent) {
      const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
      const isRedo = (event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "y" || (event.shiftKey && event.key.toLowerCase() === "z"));
      if (isUndo) {
        event.preventDefault();
        undoDraftChange();
      } else if (isRedo) {
        event.preventDefault();
        redoDraftChange();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      if (styleElRef.current) styleElRef.current.textContent = "";
      return;
    }

    if (!styleElRef.current) {
      const style = document.createElement("style");
      style.id = "site-template-edit-overlay-style";
      document.head.appendChild(style);
      styleElRef.current = style;
    }

    const baseEditCss = `
  body.ws-site-edit-video #root > .min-h-screen > *:not([data-ws-editor-ui='1']){position:relative;z-index:2;}
  `;

    const css = Object.entries(pageDraft.nodes)
      .map(([nodeId, item]) => {
        const width = Number(item.width) > 0 ? `width:${Number(item.width)}px!important;` : "";
        const height = Number(item.height) > 0 ? `height:${Number(item.height)}px!important;` : "";
        return `body [data-ws-node-id="${nodeId}"]{transform:translate(${item.x}px,${item.y}px)!important;${width}${height}${item.css || ""}}`;
      })
      .join("\n");

    styleElRef.current.textContent = `${baseEditCss}\n${css}`;
  }, [enabled, pageDraft]);

  useEffect(() => {
    const isVideo = enabled && pageDraft.backgroundType === "video" && !!pageDraft.backgroundUrl;
    if (isVideo) document.body.classList.add("ws-site-edit-video");
    else document.body.classList.remove("ws-site-edit-video");
    return () => {
      document.body.classList.remove("ws-site-edit-video");
    };
  }, [enabled, pageDraft.backgroundType, pageDraft.backgroundUrl]);

  useEffect(() => {
    const shell = document.querySelector<HTMLElement>("#root > .min-h-screen");
    if (!shell) return;

    if (enabled && pageDraft.backgroundType === "image" && pageDraft.backgroundUrl) {
      shell.style.backgroundImage = `url(${pageDraft.backgroundUrl})`;
      shell.style.backgroundSize = "cover";
      shell.style.backgroundPosition = "center";
      shell.style.backgroundAttachment = "fixed";
    } else {
      shell.style.removeProperty("background-image");
      shell.style.removeProperty("background-size");
      shell.style.removeProperty("background-position");
      shell.style.removeProperty("background-attachment");
    }

    return () => {
      shell.style.removeProperty("background-image");
      shell.style.removeProperty("background-size");
      shell.style.removeProperty("background-position");
      shell.style.removeProperty("background-attachment");
    };
  }, [enabled, pageDraft.backgroundType, pageDraft.backgroundUrl]);

  // RAF loop: imperatively position hover + selection boxes without causing React re-renders
  useEffect(() => {
    function hide(el: HTMLDivElement | null) {
      if (el) el.style.display = "none";
    }
    if (!enabled) {
      hide(hoverBoxRef.current);
      hide(selectionBoxRef.current);
      hide(selectionLabelRef.current);
      return;
    }

    function applyRect(box: HTMLDivElement | null, rect: DOMRect | null) {
      if (!box) return;
      if (!rect || rect.width < 1 || rect.height < 1) { box.style.display = "none"; return; }
      box.style.display = "block";
      box.style.top = `${rect.top}px`;
      box.style.left = `${rect.left}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
    }

    function tick() {
      const sId = selectedNodeIdRef.current;
      const hId = hoveredNodeIdRef.current;

      const sEl = sId
        ? document.querySelector<HTMLElement>(`[data-ws-node-id="${CSS.escape(sId)}"]`)
        : null;
      applyRect(selectionBoxRef.current, sEl ? sEl.getBoundingClientRect() : null);

      if (selectionLabelRef.current) {
        if (sEl) {
          const r = sEl.getBoundingClientRect();
          const tag = sEl.tagName.toLowerCase();
          const cls = sEl.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".");
          selectionLabelRef.current.textContent = cls ? `${tag}.${cls.slice(0, 30)}` : tag;
          selectionLabelRef.current.style.display = "block";
          selectionLabelRef.current.style.top = `${Math.max(0, r.top - 20)}px`;
          selectionLabelRef.current.style.left = `${r.left}px`;
        } else {
          selectionLabelRef.current.style.display = "none";
        }
      }

      const hEl =
        hId && hId !== sId
          ? document.querySelector<HTMLElement>(`[data-ws-node-id="${CSS.escape(hId)}"]`)
          : null;
      applyRect(hoverBoxRef.current, hEl ? hEl.getBoundingClientRect() : null);

      rafIdRef.current = requestAnimationFrame(tick);
    }

    rafIdRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafIdRef.current);
  }, [enabled]);

  // Track hovered node via mousemove
  useEffect(() => {
    if (!enabled) return;
    function onMouseMove(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-ws-editor-ui='1']")) { setHoveredNodeId(null); return; }
      const el = target.closest<HTMLElement>("[data-ws-node-id]");
      setHoveredNodeId(el?.dataset.wsNodeId ?? null);
    }
    document.addEventListener("mousemove", onMouseMove);
    return () => document.removeEventListener("mousemove", onMouseMove);
  }, [enabled]);

  // Right-click → open CSS / form panel
  useEffect(() => {
    if (!enabled) return;

    function onContextMenu(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-ws-editor-ui='1']")) return;

      const el = target.closest<HTMLElement>("[data-ws-node-id]");
      if (!el) return;

      event.preventDefault();
      const nodeId = el.dataset.wsNodeId || null;
      if (!nodeId) return;
      setSelectedNodeId(nodeId);

      const existingCss = pageDraft.nodes[nodeId]?.css || extractStyleSnippet(el);
      setCssInput(existingCss);
      setFormValues(parseCssToForm(existingCss));
      setShowCssPanel(true);
    }

    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, [enabled, pageDraft]);

  useEffect(() => {
    if (!enabled) return;

    function onMouseDown(event: MouseEvent) {
      if (!event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("[data-ws-editor-ui='1']")) return;

      const el = target.closest<HTMLElement>("[data-ws-node-id]");
      if (!el) return;
      const nodeId = el.dataset.wsNodeId || "";
      if (!nodeId) return;

      const existing = getOrInitNodeStyle(draft, pageKey, nodeId, el);
      pushHistorySnapshot(draftRef.current);
      setSelectedNodeId(nodeId);
      if (event.shiftKey) {
        setDragState({ mode: "resize", nodeId, startX: event.clientX, startY: event.clientY, originW: existing.width, originH: existing.height });
      } else {
        setDragState({ mode: "move", nodeId, startX: event.clientX, startY: event.clientY, originX: existing.x, originY: existing.y });
      }
      event.preventDefault();
    }

    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [enabled, draft, pageKey]);

  useEffect(() => {
    if (!dragState) return;
    const state = dragState;

    function onMouseMove(event: MouseEvent) {
      setDraft((prev) => {
        const next = normalizeSiteDraft(prev);
        const page = next.pages[pageKey] || { backgroundType: "none", backgroundUrl: "", nodes: {} };
        const current = page.nodes[state.nodeId] || { x: 0, y: 0, width: 300, height: 180, css: "" };
        if (state.mode === "move") {
          const dx = event.clientX - state.startX;
          const dy = event.clientY - state.startY;
          page.nodes[state.nodeId] = {
            ...current,
            x: clamp(Math.round(state.originX + dx), -4000, 4000),
            y: clamp(Math.round(state.originY + dy), -4000, 4000),
          };
        } else {
          const dw = event.clientX - state.startX;
          const dh = event.clientY - state.startY;
          page.nodes[state.nodeId] = {
            ...current,
            width: clamp(Math.round(state.originW + dw), 20, 8000),
            height: clamp(Math.round(state.originH + dh), 16, 8000),
          };
        }
        next.pages[pageKey] = page;
        return next;
      });
    }

    function onMouseUp() {
      setDragState(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragState, pageKey]);

  async function uploadPageBackground(file: File | null) {
    if (!file) return;
    try {
      setUploadingBg(true);
      const res = await apiUploadMedia(file);
      commitDraftChange((prev) => {
        const next = normalizeSiteDraft(prev);
        const page = next.pages[pageKey] || { backgroundType: "none", backgroundUrl: "", nodes: {} };
        page.backgroundType = res.resourceType === "video" ? "video" : "image";
        page.backgroundUrl = res.mediaUrl;
        next.pages[pageKey] = page;
        return next;
      });
      toast.success("页面背景已更新");
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setUploadingBg(false);
    }
  }

  function onBackgroundFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] || null;
    uploadPageBackground(file);
    // Allow selecting the same file again to retrigger onChange.
    event.target.value = "";
  }

  function applyCss() {
    if (!selectedNodeId) return;
    const rawCss = formMode ? formToCss(formValues) : cssInput;
    const safeCss = sanitizeCssBlock(rawCss);
    commitDraftChange((prev) => {
      const next = normalizeSiteDraft(prev);
      const page = next.pages[pageKey] || { backgroundType: "none", backgroundUrl: "", nodes: {} };
      const node = page.nodes[selectedNodeId] || { x: 0, y: 0, width: 0, height: 0, css: "" };
      page.nodes[selectedNodeId] = { ...node, css: safeCss };
      next.pages[pageKey] = page;
      return next;
    });
    setShowCssPanel(false);
  }

  function switchToForm() {
    setFormValues(parseCssToForm(cssInput));
    setFormMode(true);
  }

  function switchToRaw() {
    setCssInput(formToCss(formValues));
    setFormMode(false);
  }

  function clearNodeOverrides() {
    if (!selectedNodeId) return;
    commitDraftChange((prev) => {
      const next = normalizeSiteDraft(prev);
      const page = next.pages[pageKey];
      if (page) delete page.nodes[selectedNodeId];
      return next;
    });
    setShowCssPanel(false);
  }

  function handleSaveAsTemplate() {
    localStorage.setItem(
      PENDING_TEMPLATE_DRAFT_KEY,
      JSON.stringify({ siteDraft: draft, mode: "global-site-edit", createdAt: new Date().toISOString() })
    );
    setEnabled(false);
    navigate("/workshop/new?fromSiteEdit=1");
  }

  function collectNodeCatalog() {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-ws-node-id]"));
    return nodes.slice(0, 300).map((el) => ({
      nodeId: el.dataset.wsNodeId || "",
      hint: `${el.tagName.toLowerCase()} ${(el.className || "").split(/\s+/).slice(0, 3).join(".")}`,
    })).filter((item) => item.nodeId);
  }

  if (!enabled) return null;

  return (
    <>
      {/* Hover highlight — imperatively positioned by RAF loop */}
      <div
        ref={hoverBoxRef}
        data-ws-editor-ui="1"
        className="pointer-events-none fixed z-[1100] rounded-sm outline outline-2 outline-offset-[3px] outline-cyan-400/55"
        style={{ display: "none" }}
      />
      {/* Selection box */}
      <div
        ref={selectionBoxRef}
        data-ws-editor-ui="1"
        className="pointer-events-none fixed z-[1101] rounded-sm outline outline-2 outline-offset-[3px] outline-cyan-400"
        style={{ display: "none" }}
      />
      {/* Selection label (tag.className badge above box) */}
      <div
        ref={selectionLabelRef}
        data-ws-editor-ui="1"
        className="pointer-events-none fixed z-[1102] rounded bg-cyan-500/90 px-1.5 py-0.5 font-mono text-[10px] text-black"
        style={{ display: "none" }}
      />

      {/* Page background preview: image is applied on shell element via effect; video uses overlay layer. */}
      {pageDraft.backgroundType === "video" && pageDraft.backgroundUrl ? (
        <video
          data-ws-editor-ui="1"
          className="pointer-events-none fixed inset-0 z-[1] h-full w-full object-cover opacity-45"
          src={pageDraft.backgroundUrl}
          autoPlay
          loop
          muted
          playsInline
        />
      ) : null}

      {/* Control panel */}
      <div
        data-ws-editor-ui="1"
        className="fixed bottom-4 right-4 z-[1200] w-[320px] rounded-2xl border border-cyan-700/70 bg-slate-950/95 p-3 text-xs text-gray-200 shadow-2xl"
      >
        <div className="font-semibold text-cyan-200">全站编辑模式</div>
        <p className="mt-1 text-gray-400">
          右键组件打开样式面板 · <kbd className="rounded bg-gray-700 px-1">Alt</kbd> 拖移 ·{" "}
          <kbd className="rounded bg-gray-700 px-1">Alt+Shift</kbd> 缩放
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer rounded-lg border border-gray-700 px-2 py-1">
            {uploadingBg ? "上传中…" : "上传页面背景"}
            <input
              type="file"
              accept="image/*,video/mp4,video/webm,video/ogg,video/quicktime"
              className="hidden"
              onChange={onBackgroundFileChange}
              disabled={uploadingBg}
            />
          </label>
          <button
            type="button"
            className="rounded-lg border border-gray-700 px-2 py-1"
            onClick={() =>
              commitDraftChange((prev) => {
                const next = normalizeSiteDraft(prev);
                const page = next.pages[pageKey] || { backgroundType: "none", backgroundUrl: "", nodes: {} };
                page.backgroundType = "none";
                page.backgroundUrl = "";
                next.pages[pageKey] = page;
                return next;
              })
            }
          >
            清除背景
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-700 px-3 py-1"
            onClick={undoDraftChange}
            disabled={pastDrafts.length === 0}
            title="Ctrl/Cmd+Z"
          >
            返回上一步
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-700 px-3 py-1"
            onClick={redoDraftChange}
            disabled={futureDrafts.length === 0}
            title="Ctrl/Cmd+Y"
          >
            取消返回
          </button>
          <button
            type="button"
            className="rounded-lg bg-cyan-500 px-3 py-1 text-black font-semibold"
            onClick={handleSaveAsTemplate}
          >
            保存为模板
          </button>
          <button
            type="button"
            className="rounded-lg border border-gray-700 px-3 py-1"
            onClick={resetEditSession}
          >
            退出编辑模式
          </button>
        </div>

        <div className="mt-2 text-[11px] text-gray-500">当前页面: {pageKey}</div>
      </div>

      {/* CSS / form panel */}
      {showCssPanel && (
        <div
          data-ws-editor-ui="1"
          className="fixed top-16 right-4 z-[1250] w-[390px] rounded-2xl border border-gray-700 bg-slate-950/97 p-3 shadow-2xl"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-white">组件样式编辑</div>
            <div className="flex overflow-hidden rounded-lg border border-gray-700 text-xs">
              <button
                type="button"
                className={`px-3 py-1 transition ${formMode ? "bg-cyan-600 text-white" : "text-gray-400 hover:bg-gray-800"}`}
                onClick={switchToForm}
              >
                属性表单
              </button>
              <button
                type="button"
                className={`px-3 py-1 transition ${!formMode ? "bg-cyan-600 text-white" : "text-gray-400 hover:bg-gray-800"}`}
                onClick={switchToRaw}
              >
                原始 CSS
              </button>
            </div>
          </div>

          {formMode ? (
            <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
              <PropGroupLabel>文字</PropGroupLabel>
              <ColorRow label="文字颜色" prop="color" values={formValues} onChange={setFormValues} />
              <TextRow label="字号" prop="fontSize" placeholder="16px" values={formValues} onChange={setFormValues} />
              <SelectRow
                label="字重"
                prop="fontWeight"
                values={formValues}
                onChange={setFormValues}
                options={[["", "默认"], ["300", "300 Light"], ["400", "400 Normal"], ["500", "500 Medium"], ["600", "600 Semi"], ["700", "700 Bold"], ["800", "800 Extra"], ["900", "900 Black"]]}
              />
              <TextRow label="字间距" prop="letterSpacing" placeholder="0.05em" values={formValues} onChange={setFormValues} />
              <TextRow label="行高" prop="lineHeight" placeholder="1.5" values={formValues} onChange={setFormValues} />
              <SelectRow
                label="大小写"
                prop="textTransform"
                values={formValues}
                onChange={setFormValues}
                options={[["", "默认"], ["none", "无"], ["uppercase", "全大写"], ["lowercase", "全小写"], ["capitalize", "首字母大写"]]}
              />
              <SelectRow
                label="文字装饰"
                prop="textDecoration"
                values={formValues}
                onChange={setFormValues}
                options={[["", "默认"], ["none", "无"], ["underline", "下划线"], ["line-through", "删除线"]]}
              />

              <PropGroupLabel>背景与边框</PropGroupLabel>
              <ColorRow label="背景颜色" prop="backgroundColor" values={formValues} onChange={setFormValues} />
              <TextRow label="圆角" prop="borderRadius" placeholder="8px" values={formValues} onChange={setFormValues} />
              <ColorRow label="边框颜色" prop="borderColor" values={formValues} onChange={setFormValues} />
              <TextRow label="阴影" prop="boxShadow" placeholder="0 2px 8px rgba(0,0,0,.3)" values={formValues} onChange={setFormValues} />

              <PropGroupLabel>间距与透明度</PropGroupLabel>
              <TextRow label="内边距" prop="padding" placeholder="8px 16px" values={formValues} onChange={setFormValues} />
              <TextRow label="外边距" prop="margin" placeholder="0 auto" values={formValues} onChange={setFormValues} />
              <OpacityRow values={formValues} onChange={setFormValues} />
            </div>
          ) : (
            <>
              <textarea
                rows={9}
                value={cssInput}
                onChange={(e) => setCssInput(e.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-700 bg-black/40 px-3 py-2 font-mono text-xs text-gray-100"
              />
              <p className="mt-1 text-[10px] text-gray-500">
                允许属性: color · background-color · border-radius · border-color · font-size · font-weight ·
                letter-spacing · line-height · padding · margin · box-shadow · opacity · text-transform · text-decoration
              </p>
            </>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-emerald-500 px-3 py-1 text-sm font-semibold text-black"
              onClick={applyCss}
            >
              应用
            </button>
            <button
              type="button"
              className="rounded-lg border border-rose-800/70 px-3 py-1 text-sm text-rose-300"
              onClick={clearNodeOverrides}
            >
              清除覆盖
            </button>
            <button
              type="button"
              className="ml-auto rounded-lg border border-gray-700 px-3 py-1 text-sm"
              onClick={() => setShowCssPanel(false)}
            >
              关闭
            </button>
          </div>

        </div>
      )}

      {/* AI global assistant: standalone panel, not tied to CSS panel */}
      <SiteGlobalAiAssistant
        enabled={enabled}
        pageKey={pageKey}
        draft={draft}
        selectedNodeId={selectedNodeId}
        collectNodeCatalog={collectNodeCatalog}
        onApplyOperations={(operations) => {
          commitDraftChange((prev) => applyOpsToDraft(prev, pageKey, operations));
        }}
      />

      {/* Render draft widgets in edit mode for immediate preview and drag selection */}
      {(pageDraft.widgets || []).slice(0, 80).map((widget) => {
        const style: React.CSSProperties = {
          position: "fixed",
          left: widget.x,
          top: widget.y,
          width: widget.width,
          height: widget.height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "auto",
          ...cssTextToReactStyle(widget.css),
        };
        const nodeId = `widget:${widget.id}`;
        const className = widget.type === "badge"
          ? "rounded-full border border-emerald-600/80 bg-emerald-900/40 px-3 py-1 text-xs text-emerald-100"
          : widget.type === "button"
            ? "rounded-lg border border-cyan-600/80 bg-cyan-900/30 px-3 py-2 text-sm text-cyan-100"
            : widget.type === "image"
              ? "overflow-hidden rounded-lg border border-gray-700/80 bg-gray-900/40"
              : widget.type === "card"
                ? "rounded-2xl border border-gray-700/80 bg-gray-900/65 p-3 text-sm text-gray-100"
                : widget.type === "link-list"
                  ? "rounded-xl border border-gray-700/80 bg-gray-900/60 p-2 text-sm text-cyan-100"
                  : widget.type === "form"
                    ? "rounded-xl border border-gray-700/80 bg-gray-900/60 p-3 text-sm text-gray-100"
                    : "rounded-lg border border-gray-700/80 bg-gray-900/55 px-3 py-2 text-sm text-gray-100";

        const body = widget.type === "image"
          ? <img src={widget.imageUrl || ""} alt={widget.text || "widget-image"} className="h-full w-full object-cover" />
          : widget.type === "card"
            ? (
              <div className="w-full">
                <div className="font-semibold">{widget.text || "Card"}</div>
                <div className="mt-1 text-xs text-gray-300">{(widget.items || []).slice(0, 3).join(" · ") || "Card content"}</div>
              </div>
            )
            : widget.type === "link-list"
              ? (
                <div className="w-full space-y-1">
                  <div className="text-xs text-gray-400">{widget.text || "Links"}</div>
                  {(widget.items || []).slice(0, 4).map((item, idx) => <div key={`${widget.id}-link-${idx}`}>• {item}</div>)}
                </div>
              )
              : widget.type === "form"
                ? (
                  <div className="w-full space-y-1">
                    <div className="text-xs text-gray-300">{widget.text || "Form"}</div>
                    {(widget.fields || ["Name", "Email"]).slice(0, 3).map((field, idx) => (
                      <div key={`${widget.id}-field-${idx}`} className="rounded border border-gray-700/60 px-2 py-1 text-[11px] text-gray-400">{field}</div>
                    ))}
                  </div>
                )
                : <>{widget.text}</>;

        return widget.type === "button" && widget.href ? (
          <a
            key={widget.id}
            data-ws-node-id={nodeId}
            data-ws-widget-id={widget.id}
            href={widget.href}
            className={className}
            style={style}
            onClick={(e) => e.preventDefault()}
          >
            {body}
          </a>
        ) : (
          <div
            key={widget.id}
            data-ws-node-id={nodeId}
            data-ws-widget-id={widget.id}
            className={className}
            style={style}
          >
            {body}
          </div>
        );
      })}
    </>
  );
}

// ── Shared form row components ───────────────────────────────────────────────

function PropGroupLabel({ children }: { children: React.ReactNode }) {
  return <div className="pt-2 text-[10px] uppercase tracking-widest text-gray-500">{children}</div>;
}

function TextRow({
  label, prop, placeholder, values, onChange,
}: {
  label: string; prop: keyof CssFormValues; placeholder?: string;
  values: CssFormValues; onChange: (v: CssFormValues) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-gray-400">{label}</span>
      <input
        type="text"
        value={values[prop]}
        onChange={(e) => onChange({ ...values, [prop]: e.target.value })}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black/30 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
      />
    </div>
  );
}

function ColorRow({
  label, prop, values, onChange,
}: {
  label: string; prop: keyof CssFormValues;
  values: CssFormValues; onChange: (v: CssFormValues) => void;
}) {
  const hex = toHexColor(values[prop]);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-gray-400">{label}</span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <input
          type="color"
          value={hex || "#000000"}
          onChange={(e) => onChange({ ...values, [prop]: e.target.value })}
          title="颜色选择器"
          className="h-6 w-7 shrink-0 cursor-pointer rounded border border-gray-700 bg-transparent p-0"
        />
        <input
          type="text"
          value={values[prop]}
          onChange={(e) => onChange({ ...values, [prop]: e.target.value })}
          placeholder="#rrggbb / rgba(…)"
          className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black/30 px-2 py-1 text-xs text-gray-100 placeholder:text-gray-600"
        />
      </div>
    </div>
  );
}

function SelectRow({
  label, prop, options, values, onChange,
}: {
  label: string; prop: keyof CssFormValues; options: [string, string][];
  values: CssFormValues; onChange: (v: CssFormValues) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-gray-400">{label}</span>
      <select
        value={values[prop]}
        onChange={(e) => onChange({ ...values, [prop]: e.target.value })}
        className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-100"
      >
        {options.map(([val, lbl]) => (
          <option key={val} value={val}>{lbl}</option>
        ))}
      </select>
    </div>
  );
}

function OpacityRow({ values, onChange }: { values: CssFormValues; onChange: (v: CssFormValues) => void }) {
  const num = parseFloat(values.opacity);
  const safe = isNaN(num) ? 1 : num;
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-gray-400">透明度</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={safe}
          onChange={(e) => onChange({ ...values, opacity: e.target.value })}
          className="flex-1"
        />
        <span className="w-8 shrink-0 text-right text-[11px] text-gray-300">{values.opacity || "1"}</span>
      </div>
    </div>
  );
}
