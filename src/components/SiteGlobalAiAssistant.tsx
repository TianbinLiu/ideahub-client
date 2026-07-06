import { useMemo, useState } from "react";
import { previewWorkshopAiSiteEdit, type SiteEditAiOperations } from "../api";
import { normalizeSafeUrl, normalizeSiteDraft, sanitizeCssBlock, type SiteDraft, type SiteDraftWidget } from "../utils/siteDraft";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type ChatMessage = { role: "user" | "assistant"; content: string };

type Props = {
  enabled: boolean;
  pageKey: string;
  draft: SiteDraft;
  selectedNodeId: string | null;
  collectNodeCatalog: () => Array<{ nodeId: string; hint?: string }>;
  onApplyOperations: (operations: SiteEditAiOperations) => void;
};

function applyOpsToDraft(base: SiteDraft, pageKey: string, operations: SiteEditAiOperations): SiteDraft {
  const next = normalizeSiteDraft(base);
  const page = next.pages[pageKey] || { backgroundType: "none" as const, backgroundUrl: "", nodes: {}, widgets: [] as SiteDraftWidget[] };

  for (const item of operations.updateNodes || []) {
    if (!item?.nodeId) continue;
    const node = page.nodes[item.nodeId] || { x: 0, y: 0, width: 0, height: 0, css: "" };
    page.nodes[item.nodeId] = {
      x: item.x === undefined ? node.x : Number(item.x) || 0,
      y: item.y === undefined ? node.y : Number(item.y) || 0,
      width: item.width === undefined ? node.width : Number(item.width) || 0,
      height: item.height === undefined ? node.height : Number(item.height) || 0,
      css: item.css === undefined ? node.css : sanitizeCssBlock(item.css),
    };
  }

  const currentWidgets = Array.isArray(page.widgets) ? [...page.widgets] : [];
  const removed = new Set((operations.removeWidgetIds || []).map((id) => String(id || "")));
  const widgets = currentWidgets.filter((w) => !removed.has(String(w.id)));

  for (const item of operations.createWidgets || []) {
    const id = String(item?.id || `widget_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const rawType = String(item?.type || "text").toLowerCase();
    const widget: SiteDraftWidget = {
      id,
      type: rawType === "button"
        ? "button"
        : rawType === "badge"
          ? "badge"
          : rawType === "image"
            ? "image"
            : rawType === "card"
              ? "card"
              : rawType === "link-list"
                ? "link-list"
                : rawType === "form"
                  ? "form"
                  : "text",
      text: String(item?.text || "New widget"),
      href: normalizeSafeUrl(item?.href),
      imageUrl: normalizeSafeUrl(item?.imageUrl),
      items: Array.isArray(item?.items) ? item.items.map((x) => String(x || "")).filter(Boolean).slice(0, 20) : [],
      fields: Array.isArray(item?.fields) ? item.fields.map((x) => String(x || "")).filter(Boolean).slice(0, 12) : [],
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0,
      width: Number(item?.width) || 180,
      height: Number(item?.height) || 44,
      css: sanitizeCssBlock(item?.css || ""),
    };
    const idx = widgets.findIndex((w) => w.id === widget.id);
    if (idx >= 0) widgets[idx] = widget;
    else widgets.push(widget);
  }

  page.widgets = widgets;

  if (operations.pageBackground) {
    if (operations.pageBackground.backgroundType) page.backgroundType = operations.pageBackground.backgroundType;
    if (operations.pageBackground.backgroundUrl !== undefined) page.backgroundUrl = normalizeSafeUrl(operations.pageBackground.backgroundUrl);
  }

  next.pages[pageKey] = page;
  return next;
}

export default function SiteGlobalAiAssistant({ enabled, pageKey, draft, selectedNodeId, collectNodeCatalog, onApplyOperations }: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [open, setOpen] = useState(true);
  const [pendingOps, setPendingOps] = useState<SiteEditAiOperations | null>(null);
  const [pendingMessage, setPendingMessage] = useState("");

  const pageDraft = useMemo(() => normalizeSiteDraft(draft).pages[pageKey] || { nodes: {}, widgets: [] }, [draft, pageKey]);

  if (!enabled) return null;

  async function handleApply() {
    if (!prompt.trim()) {
      toast.error("请输入 AI 指令");
      return;
    }

    setBusy(true);
    try {
      const nextHistory = [...messages, { role: "user" as const, content: prompt.trim() }];
      const nodeCatalog = collectNodeCatalog();
      const res = await previewWorkshopAiSiteEdit({
        instruction: prompt.trim(),
        pageKey,
        siteDraft: draft,
        history: messages,
        nodeCatalog,
      });

      const operations = res.operations || {};
      setPendingOps(operations);
      setPendingMessage(res.assistantMessage || "已生成改版草案，请确认后应用。");
      setMessages([...nextHistory, { role: "assistant", content: "已生成改版预览，请确认应用。" }]);
      setPrompt("");
      toast.success("已生成改版预览");
    } catch (e: unknown) {
      toast.error(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  function summarizeOps(operations: SiteEditAiOperations | null) {
    if (!operations) return "无待应用变更";
    const nodes = operations.updateNodes?.length || 0;
    const create = operations.createWidgets?.length || 0;
    const remove = operations.removeWidgetIds?.length || 0;
    const bg = operations.pageBackground ? 1 : 0;
    return `组件改动 ${nodes} · 新增组件 ${create} · 删除组件 ${remove} · 背景变更 ${bg}`;
  }

  function previewDraftDiff(operations: SiteEditAiOperations | null) {
    if (!operations) return null;
    const after = applyOpsToDraft(draft, pageKey, operations);
    const beforePage = normalizeSiteDraft(draft).pages[pageKey] || { nodes: {}, widgets: [] as SiteDraftWidget[] };
    const afterPage = after.pages[pageKey] || { nodes: {}, widgets: [] as SiteDraftWidget[] };
    return {
      beforeNodes: Object.keys(beforePage.nodes || {}).length,
      afterNodes: Object.keys(afterPage.nodes || {}).length,
      beforeWidgets: Array.isArray(beforePage.widgets) ? beforePage.widgets.length : 0,
      afterWidgets: Array.isArray(afterPage.widgets) ? afterPage.widgets.length : 0,
    };
  }

  function confirmApply() {
    if (!pendingOps) return;
    onApplyOperations(pendingOps);
    setPendingOps(null);
    setPendingMessage("");
    toast.success("AI 改版已应用");
  }

  function cancelPreview() {
    setPendingOps(null);
    setPendingMessage("");
  }

  return (
    <div data-ws-editor-ui="1" className="fixed left-4 bottom-4 z-[1220] w-[360px] rounded-2xl border border-emerald-700/70 bg-slate-950/95 p-3 text-xs text-gray-200 shadow-2xl">
      <div className="flex items-center justify-between">
        <div className="font-semibold text-emerald-300">AI 全局改版助手</div>
        <button type="button" className="rounded border border-gray-700 px-2 py-0.5" onClick={() => setOpen((v) => !v)}>
          {open ? "收起" : "展开"}
        </button>
      </div>

      <div className="mt-1 text-gray-400">可同时修改多个组件，并支持新增组件（image/card/link-list/form 等）。当前页：{pageKey}</div>
      <div className="mt-1 text-gray-500">已识别组件 {Object.keys(pageDraft.nodes || {}).length}，新增组件 {Array.isArray(pageDraft.widgets) ? pageDraft.widgets.length : 0}，当前选中 {selectedNodeId || "无"}</div>

      {open && (
        <>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="例如：把顶部导航和筛选条改成更轻玻璃风；在右下新增一个‘联系我们’按钮组件，跳转 /company"
            className="mt-2 w-full rounded-xl border border-gray-700 bg-black/40 px-3 py-2 text-xs text-gray-100"
          />
          <button
            type="button"
            disabled={busy}
            onClick={handleApply}
            className="mt-2 rounded-lg border border-emerald-700 bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-100 disabled:opacity-50"
          >
            {busy ? "AI 处理中..." : "执行全局改版"}
          </button>

          {pendingOps && (
            <div className="mt-2 rounded-lg border border-emerald-700/60 bg-emerald-900/10 p-2 text-[11px]">
              <div className="font-semibold text-emerald-200">差异预览（未应用）</div>
              <div className="mt-1 text-gray-300">{summarizeOps(pendingOps)}</div>
              {pendingMessage && <div className="mt-1 text-gray-400">{pendingMessage}</div>}
              {(() => {
                const diff = previewDraftDiff(pendingOps);
                if (!diff) return null;
                return (
                  <div className="mt-1 text-gray-400">
                    节点数 {diff.beforeNodes} → {diff.afterNodes}，组件数 {diff.beforeWidgets} → {diff.afterWidgets}
                  </div>
                );
              })()}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={confirmApply} className="rounded border border-emerald-700 px-2 py-1 text-emerald-100">确认应用</button>
                <button type="button" onClick={cancelPreview} className="rounded border border-gray-700 px-2 py-1 text-gray-300">取消</button>
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-gray-800 bg-black/20 p-2 text-[11px]">
              {messages.slice(-6).map((message, index) => (
                <div key={`${message.role}-${index}`} className={message.role === "assistant" ? "text-emerald-200" : "text-cyan-200"}>
                  <span className="mr-1 uppercase text-[10px] text-gray-500">{message.role}</span>
                  <span>{message.content}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { applyOpsToDraft };
