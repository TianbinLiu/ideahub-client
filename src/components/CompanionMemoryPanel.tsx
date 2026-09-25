/**
 * @file CompanionMemoryPanel.tsx - 首页对话框「记忆」面板：上下文用量、整理记忆、新对话、删对话、「小梦记得的事」
 * @category Component
 * @requires_auth true（CompanionChat 只给登录用户显示入口）
 * @i18n_module companion
 *
 * 类 Claude 的上下文管理（设计见 app 仓 docs/character-art-privacy-context.md §C，契约见 docs/api-contract.md「对话记忆」）：
 *   · 上下文用量 = 上一轮 prompt + completion tokens ÷ 产品预算；≥75% 服务端在回复后自动整理，这里也能手动「整理记忆」
 *     （可以写一句想让她重点记住的事）；
 *   · 「记得的事」= 整理时从旧对话里提炼出的事实卡：逐条改 / 置顶 / 回到上一版 / 删，或一键清空；
 *   · 删对话 = 消息、摘要以及从这段对话整理出的记忆卡立即彻底删除（服务端硬删）。
 * ★ 删除类操作都是「点一次变成确认、再点一次才删」，不用 window.confirm（首页全屏舞台上弹原生框很突兀）。
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { Brain, Check, MessageSquarePlus, Pencil, Pin, PinOff, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import {
  clearChatMemories,
  compactChatThread,
  deleteChatMemory,
  deleteChatThread,
  getChatMessages,
  listChatMemories,
  revertChatMemory,
  updateChatMemory,
  type ChatContext,
  type ChatMemoryItem,
} from "../api";
import { contextPercent, contextTone, formatTokens } from "../companion/chatContext";
import { humanizeError } from "../utils/humanizeError";

type Props = {
  open: boolean;
  onClose: () => void;
  name: string;
  threadId: string | null;
  context: ChatContext | null;
  onContextChange: (context: ChatContext) => void;
  /** 开新对话 / 当前对话被删了：CompanionChat 清掉 threadId 与用量 */
  onResetThread: () => void;
};

const MEMORY_MAX_CHARS = 60;

export default function CompanionMemoryPanel({ open, onClose, name, threadId, context, onContextChange, onResetThread }: Props) {
  const { t } = useTranslation();
  const [memories, setMemories] = useState<ChatMemoryItem[] | null>(null);
  const [focus, setFocus] = useState("");
  const [busy, setBusy] = useState<"" | "compact" | "deleteThread" | "clear">("");
  const [confirming, setConfirming] = useState<"" | "deleteThread" | "clear">("");
  const [editingId, setEditingId] = useState("");
  const [editText, setEditText] = useState("");
  const [rowBusy, setRowBusy] = useState("");

  const loadMemories = useCallback(() => {
    listChatMemories("companion")
      .then((r) => setMemories(r.memories))
      .catch(() => setMemories([]));
  }, []);

  // 打开时：拉记忆卡；有会话就顺手刷新一次用量（自动整理可能刚在后台做完）
  useEffect(() => {
    if (!open) return;
    setConfirming("");
    setEditingId("");
    loadMemories();
    if (threadId) {
      getChatMessages(threadId, { limit: 1 })
        .then((r) => onContextChange(r.thread.context))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onContextChange 是父组件每次渲染新建的 setter 包装，只在打开时刷新
  }, [open, threadId, loadMemories]);

  if (!open) return null;

  const percent = contextPercent(context);
  const tone = contextTone(context?.level);

  async function handleCompact() {
    if (!threadId) return;
    setBusy("compact");
    try {
      const r = await compactChatThread(threadId, focus.trim() || undefined);
      onContextChange(r.context);
      setFocus("");
      toast.success(r.compacted ? t("companion.memory.compacted", { count: r.compacted }) : t("companion.memory.compactNothing"));
      loadMemories();
    } catch (error) {
      const e = error as { status?: number };
      if (e?.status === 409) toast(t("companion.memory.compactBusy"));
      else if (e?.status === 404) {
        onResetThread();
        toast(t("companion.memory.threadGone"));
      } else if (e?.status === 502) toast.error(t("companion.memory.compactFailed"));
      else toast.error(humanizeError(error));
    } finally {
      setBusy("");
    }
  }

  function handleNewChat() {
    onResetThread();
    toast.success(t("companion.memory.newChatDone", { name }));
    onClose();
  }

  async function handleDeleteThread() {
    if (!threadId) return;
    if (confirming !== "deleteThread") {
      setConfirming("deleteThread");
      return;
    }
    setBusy("deleteThread");
    try {
      const r = await deleteChatThread(threadId);
      onResetThread();
      toast.success(t("companion.memory.threadDeleted", { count: r.deletedMemories }));
      loadMemories();
    } catch (error) {
      if ((error as { status?: number })?.status === 404) onResetThread();
      else toast.error(humanizeError(error));
    } finally {
      setBusy("");
      setConfirming("");
    }
  }

  async function handleClearAll() {
    if (confirming !== "clear") {
      setConfirming("clear");
      return;
    }
    setBusy("clear");
    try {
      await clearChatMemories("companion");
      setMemories([]);
      toast.success(t("companion.memory.cleared"));
    } catch (error) {
      toast.error(humanizeError(error));
    } finally {
      setBusy("");
      setConfirming("");
    }
  }

  // 置顶的排最前（与服务端的排序一致：pinned 优先，其余保持原顺序）
  function replaceMemory(next: ChatMemoryItem) {
    setMemories((prev) => {
      const list = (prev || []).map((m) => (m.id === next.id ? next : m));
      return [...list.filter((m) => m.pinned), ...list.filter((m) => !m.pinned)];
    });
  }

  async function runRow(id: string, job: () => Promise<void>) {
    setRowBusy(id);
    try {
      await job();
    } catch (error) {
      if ((error as { status?: number })?.status === 404) loadMemories();
      else toast.error(humanizeError(error));
    } finally {
      setRowBusy("");
    }
  }

  function saveEdit(m: ChatMemoryItem) {
    const text = editText.trim();
    if (!text || text === m.text) {
      setEditingId("");
      return;
    }
    void runRow(m.id, async () => {
      const r = await updateChatMemory(m.id, { text });
      replaceMemory(r.memory);
      setEditingId("");
    });
  }

  const levelHint = context ? t(`companion.memory.level.${context.level}`, { name }) : t("companion.memory.noThread", { name });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t("companion.memory.title")}
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-gray-700 bg-gray-900 p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-white">
            <Brain className="h-4 w-4 text-cyan-300" /> {t("companion.memory.title")}
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:text-white" aria-label={t("companion.close")}>
            <X size={18} />
          </button>
        </div>

        {/* 上下文用量 */}
        <div className="mt-3 rounded-xl border border-gray-800 bg-gray-950/50 px-3 py-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{t("companion.memory.contextLabel")}</span>
            <span className={tone.text}>
              {context
                ? t("companion.memory.contextValue", { used: formatTokens(context.used), budget: formatTokens(context.budget), percent })
                : "—"}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-gray-800">
            <div className={`h-full rounded-full ${tone.bar} transition-all`} style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-1.5 text-[11px] leading-5 text-gray-500">{levelHint}</p>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              maxLength={200}
              disabled={!threadId || busy !== ""}
              placeholder={t("companion.memory.focusPlaceholder", { name })}
              className="min-w-0 flex-1 rounded-lg border border-gray-800 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 outline-none placeholder:text-gray-600 focus:border-cyan-800 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleCompact()}
              disabled={!threadId || busy !== ""}
              className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-cyan-500/20 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {busy === "compact" ? t("companion.memory.compacting") : t("companion.memory.compact")}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              disabled={busy !== ""}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-200 transition hover:border-gray-500 disabled:opacity-40"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> {t("companion.memory.newChat")}
            </button>
            {threadId ? (
              <button
                type="button"
                onClick={() => void handleDeleteThread()}
                onBlur={() => confirming === "deleteThread" && setConfirming("")}
                disabled={busy !== ""}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition disabled:opacity-40 ${
                  confirming === "deleteThread" ? "border-rose-500 bg-rose-500/20 text-rose-100" : "border-gray-700 text-gray-300 hover:border-rose-700 hover:text-rose-200"
                }`}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirming === "deleteThread" ? t("companion.memory.deleteThreadConfirm") : t("companion.memory.deleteThread")}
              </button>
            ) : null}
          </div>
        </div>

        {/* 记得的事 */}
        <div className="mt-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-100">{t("companion.memory.memoriesTitle", { name })}</h3>
          {memories && memories.length ? (
            <button
              type="button"
              onClick={() => void handleClearAll()}
              onBlur={() => confirming === "clear" && setConfirming("")}
              disabled={busy !== ""}
              className={`rounded-lg px-2 py-0.5 text-[11px] transition disabled:opacity-40 ${
                confirming === "clear" ? "bg-rose-500/20 text-rose-100" : "text-gray-500 hover:text-rose-200"
              }`}
            >
              {confirming === "clear" ? t("companion.memory.clearConfirm") : t("companion.memory.clearAll")}
            </button>
          ) : null}
        </div>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
          {memories === null ? (
            <p className="py-4 text-center text-xs text-gray-500">{t("companion.memory.loading")}</p>
          ) : memories.length === 0 ? (
            <p className="py-4 text-center text-xs leading-5 text-gray-500">{t("companion.memory.memoriesEmpty", { name })}</p>
          ) : (
            <ul className="space-y-1.5">
              {memories.map((m) => (
                <li key={m.id} className="group flex items-start gap-2 rounded-lg border border-gray-800 bg-gray-950/40 px-2.5 py-1.5">
                  {m.pinned ? <Pin className="mt-0.5 h-3 w-3 shrink-0 text-cyan-300" aria-label={t("companion.memory.pinned")} /> : null}
                  {editingId === m.id ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveEdit(m);
                      }}
                    >
                      <input
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        maxLength={MEMORY_MAX_CHARS}
                        className="min-w-0 flex-1 rounded border border-cyan-900 bg-gray-900 px-1.5 py-0.5 text-xs text-gray-100 outline-none"
                      />
                      <button type="submit" disabled={rowBusy === m.id} className="rounded p-1 text-cyan-200 hover:bg-gray-800" aria-label={t("companion.memory.save")}>
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => setEditingId("")} className="rounded p-1 text-gray-400 hover:bg-gray-800" aria-label={t("companion.memory.cancel")}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 break-words text-xs leading-5 text-gray-200">{m.text}</span>
                      <span className="flex shrink-0 items-center gap-0.5 opacity-70 group-hover:opacity-100">
                        <button
                          type="button"
                          disabled={rowBusy === m.id}
                          onClick={() => {
                            setEditingId(m.id);
                            setEditText(m.text);
                          }}
                          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                          title={t("companion.memory.edit")}
                          aria-label={t("companion.memory.edit")}
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          disabled={rowBusy === m.id}
                          onClick={() => void runRow(m.id, async () => replaceMemory((await updateChatMemory(m.id, { pinned: !m.pinned })).memory))}
                          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                          title={m.pinned ? t("companion.memory.unpin") : t("companion.memory.pin")}
                          aria-label={m.pinned ? t("companion.memory.unpin") : t("companion.memory.pin")}
                        >
                          {m.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                        </button>
                        {m.canRevert ? (
                          <button
                            type="button"
                            disabled={rowBusy === m.id}
                            onClick={() => void runRow(m.id, async () => replaceMemory((await revertChatMemory(m.id)).memory))}
                            className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                            title={t("companion.memory.revert")}
                            aria-label={t("companion.memory.revert")}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={rowBusy === m.id}
                          onClick={() =>
                            void runRow(m.id, async () => {
                              await deleteChatMemory(m.id);
                              setMemories((prev) => (prev || []).filter((x) => x.id !== m.id));
                            })
                          }
                          className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-rose-300"
                          title={t("companion.memory.delete")}
                          aria-label={t("companion.memory.delete")}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="mt-3 border-t border-gray-800 pt-2 text-[11px] leading-5 text-gray-500">{t("companion.memory.retention", { name })}</p>
      </div>
    </div>
  );
}
