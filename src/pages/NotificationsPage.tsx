import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  blockDmUser,
  deleteConversation,
  getConversationMessages,
  listConversations,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  sendDirectMessage,
  type NotificationItem,
} from "../api";
import { useTranslation } from "react-i18next";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { humanizeError } from "../utils/humanizeError";

type TabType = "all" | "system" | "mentions" | "reactions" | "likes" | "dislikes" | "replies" | "messages";

// 通知列表单页上限：分类 tab 仅在已加载的这一页里做客户端过滤，
// 常量化避免拉取上限与「历史被截断」提示的数值不一致。
const NOTIFICATIONS_PAGE_LIMIT = 50;

type Conversation = {
  conversationId: string;
  otherUser: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  lastMessage: {
    content: string;
    fromUser: "me" | "them";
    createdAt: string;
  };
  unreadCount: number;
  requestStatus?: "pending" | "accepted" | "rejected" | null;
  isRequestInitiator?: boolean;
};

type DirectMessage = {
  _id: string;
  conversationId: string;
  fromUserId: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  toUserId: string;
  content: string;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [pendingActionConversation, setPendingActionConversation] = useState<Conversation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeTab = (searchParams.get("tab") as TabType) || "all";

  const tabs: { key: TabType; label: string }[] = [
    { key: "all", label: t("notifications.tabAll") },
    { key: "system", label: t("notifications.tabSystem") },
    { key: "mentions", label: t("notifications.tabMentions") },
    { key: "reactions", label: t("notifications.tabReactionsOverview") },
    { key: "likes", label: t("notifications.tabLikes") },
    { key: "dislikes", label: t("notifications.tabDislikes") },
    { key: "replies", label: t("notifications.tabReplies") },
    { key: "messages", label: t("notifications.myMessages") },
  ];

  function filterByTab(item: NotificationItem, tab: TabType): boolean {
    switch (tab) {
      case "system":
        // 顶级评论（参与系统，但不包括回复）
        return ["BOOKMARK", "INTEREST", "INVITE"].includes(item.type) || 
               (item.type === "COMMENT" && !item.payload?.parentCommentId);
      case "mentions":
        return item.type === "MENTION";
      case "reactions":
        return ["LIKE", "LIKE_COMMENT", "LIKE_POST", "DISLIKE_COMMENT"].includes(item.type);
      case "likes":
        return ["LIKE", "LIKE_COMMENT", "LIKE_POST"].includes(item.type);
      case "dislikes":
        return item.type === "DISLIKE_COMMENT";
      case "replies":
        // 只显示回复通知（COMMENT 类型且有 parentCommentId）
        return item.type === "COMMENT" && !!item.payload?.parentCommentId;
      case "messages":
        return false;
      case "all":
      default:
        return true;
    }
  }

  const filteredItems = items.filter((item) => filterByTab(item, activeTab));

  function renderText(n: NotificationItem) {
    const actor = n.actorId?.username || t("notifications.actorUnknown");
    const title = n.ideaId?.title || t("notifications.ideaUnknown");

    switch (n.type) {
      case "LIKE":
        return t("notifications.like", { actor, title });
      case "COMMENT":
        // 区分顶级评论和回复
        if (n.payload?.parentCommentId) {
          return t("notifications.reply", { actor, title });
        }
        return t("notifications.comment", { actor, title });
      case "BOOKMARK":
        return t("notifications.bookmark", { actor, title });
      case "INTEREST":
        return t("notifications.interest", { actor, title });
      case "MENTION":
        return t("notifications.mention", { actor, title });
      case "INVITE":
        return t("notifications.invite", { actor, title });
      case "LIKE_COMMENT":
        return t("notifications.likeComment", { actor, title });
      case "DISLIKE_COMMENT":
        return t("notifications.dislikeComment", { actor, title });
      case "LIKE_POST":
        return t("notifications.likePost", { actor, title: n.payload?.postTitle || t("notifications.postUnknown") });
      case "MESSAGE_REQUEST_ACCEPTED":
        return t("notifications.messageRequestAccepted", { actor });
      case "MESSAGE_REQUEST_REJECTED":
        return t("notifications.messageRequestRejected", { actor });
      default:
        return t("notifications.typeFallback", { actor, type: n.type });
    }
  }

  async function loadNotifications() {
    setLoading(true);
    setError("");
    try {
      const r = await listNotifications({ page: 1, limit: NOTIFICATIONS_PAGE_LIMIT });
      setItems(r.items || []);
      // 记录服务端总数：分类 tab 只在这一页里做客户端过滤，若总数超过本页上限，
      // 更早的同类通知不会出现，这里留痕并驱动下方提示，避免用户误以为“没有更多”。
      setTotal(r.total || 0);
      if ((r.total || 0) > (r.items?.length || 0)) {
        console.warn(
          `[NotificationsPage] Loaded ${r.items?.length || 0}/${r.total} notifications; category tabs filter only this page and may omit older items.`
        );
      }
    } catch (e: any) {
      console.error("[NotificationsPage] Error loading notifications:", e);
      setError(t("notifications.errorLoad"));
    } finally {
      setLoading(false);
    }
  }

  async function loadConversations() {
    if (!user) return;
    try {
      const r = await listConversations();
      const list = r.conversations || [];
      setConversations(list);
      if (selectedConversation && !list.some((c: Conversation) => c.conversationId === selectedConversation.conversationId)) {
        setSelectedConversation(null);
        setMessages([]);
      }
    } catch (e) {
      console.error("[NotificationsPage] Error loading conversations", e);
    }
  }

  async function loadConversationMessages(conversationId: string) {
    setLoadingMessages(true);
    try {
      const res = await getConversationMessages(conversationId, 1, 50);
      setMessages(res.messages || []);
      window.dispatchEvent(new Event("notificationsUpdated"));
      await loadConversations();
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setLoadingMessages(false);
    }
  }

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab !== "messages" || !user) return;
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, [activeTab, user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function markOne(id: string) {
    await markNotificationRead(id);
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n)));
  }

  async function markAll() {
    await markAllNotificationsRead();
    setItems((prev) => prev.map((n) => ({ ...n, readAt: new Date().toISOString() })));
    window.dispatchEvent(new Event("notificationsUpdated"));
  }

  async function handleSendMessage() {
    if (!selectedConversation || !messageInput.trim()) return;
    setSendingMessage(true);
    try {
      const res = await sendDirectMessage(
        selectedConversation.conversationId,
        selectedConversation.otherUser._id,
        messageInput.trim()
      );
      setMessages((prev) => [...prev, res.message]);
      setMessageInput("");
      await loadConversations();
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleConversationClick(conv: Conversation) {
    setPendingActionConversation(conv);
  }

  async function openConversation(conv: Conversation) {
    setSelectedConversation(conv);
    await loadConversationMessages(conv.conversationId);
  }

  async function handleDeleteOnly() {
    if (!pendingActionConversation) return;
    try {
      await deleteConversation(pendingActionConversation.conversationId);
      if (selectedConversation?.conversationId === pendingActionConversation.conversationId) {
        setSelectedConversation(null);
        setMessages([]);
      }
      await loadConversations();
      window.dispatchEvent(new Event("notificationsUpdated"));
      toast.success(t("messages.conversationDeleted"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setPendingActionConversation(null);
    }
  }

  async function handleDeleteAndBlock() {
    if (!pendingActionConversation) return;
    try {
      await deleteConversation(pendingActionConversation.conversationId);
      await blockDmUser(pendingActionConversation.otherUser._id);
      if (selectedConversation?.conversationId === pendingActionConversation.conversationId) {
        setSelectedConversation(null);
        setMessages([]);
      }
      await loadConversations();
      window.dispatchEvent(new Event("notificationsUpdated"));
      toast.success(t("messages.conversationDeletedAndBlocked"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setPendingActionConversation(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-white">{t("notifications.title")}</h1>
        <div className="flex gap-2">
          <button onClick={loadNotifications} className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200 text-sm">
            ↻ {t("notifications.refresh")}
          </button>
          <button onClick={markAll} className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900 text-gray-200">
            {t("notifications.markAllRead")}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-gray-800 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSearchParams({ tab: tab.key })}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.key
                ? "bg-gray-800 text-white border-b-2 border-blue-500"
                : "text-gray-400 hover:text-white hover:bg-gray-900"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 分类 tab 只在已加载的一页里过滤，服务端总数超过上限时提示历史可能被截断 */}
      {activeTab !== "all" && activeTab !== "messages" && total > items.length && (
        <div className="text-amber-400/80 text-xs mb-3">
          {t("notifications.categoryTruncatedHint", { limit: NOTIFICATIONS_PAGE_LIMIT })}
        </div>
      )}

      {loading && <div className="text-gray-400 text-sm">{t("common.loading")}</div>}
      {error && <div className="text-red-400 text-sm mb-4">{t("common.error")}: {error}</div>}

      <div className="space-y-2">
        {activeTab === "messages" ? (
          <>
            <div className="text-gray-400 text-sm p-4 rounded-lg bg-gray-900 border border-gray-800">
              {t("notifications.messagesTab")} → <Link to="/message-requests" className="text-blue-400 hover:underline">{t("messages.messageRequests")}</Link>
            </div>

            <div className="rounded-lg border border-gray-800 bg-gray-900 overflow-hidden min-h-[560px] flex">
              <div className="w-72 border-r border-gray-800 p-3 overflow-y-auto">
                <div className="space-y-2">
                  {conversations.length === 0 ? (
                    <p className="text-sm text-gray-400 p-2">{t("messages.noConversations")}</p>
                  ) : (
                    conversations.map((conv) => (
                      <div
                        key={conv.conversationId}
                        onClick={() => handleConversationClick(conv)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedConversation?.conversationId === conv.conversationId
                            ? "bg-gray-800"
                            : "hover:bg-gray-800"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {conv.otherUser.avatarUrl ? (
                            <img
                              src={conv.otherUser.avatarUrl}
                              alt={conv.otherUser.username}
                              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold flex-shrink-0">
                              {conv.otherUser.username[0].toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{conv.otherUser.displayName || conv.otherUser.username}</p>
                            <p className="text-xs text-gray-400 truncate">{conv.lastMessage.content}</p>
                          </div>
                          {conv.unreadCount > 0 && (
                            <span className="inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] min-w-5 h-5 px-1">
                              {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col">
                {selectedConversation ? (
                  <>
                    <div className="border-b border-gray-800 px-4 py-3">
                      <div className="font-semibold text-white">{selectedConversation.otherUser.displayName || selectedConversation.otherUser.username}</div>
                      <div className="text-xs text-gray-400">@{selectedConversation.otherUser.username}</div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3">
                      {loadingMessages ? (
                        <div className="text-sm text-gray-400">{t("common.loading")}</div>
                      ) : messages.length === 0 ? (
                        <div className="text-sm text-gray-400">{t("messages.noMessages")}</div>
                      ) : (
                        messages.map((msg) => {
                          const isMine = msg.fromUserId?._id === (user as any)?._id;
                          return (
                            <div key={msg._id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                              <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${isMine ? "bg-blue-600 text-white" : "bg-gray-800 text-gray-100"}`}>
                                <div>{msg.content}</div>
                                <div className="text-[10px] opacity-70 mt-1">
                                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className="border-t border-gray-800 p-3">
                      {selectedConversation.requestStatus === "rejected" && selectedConversation.isRequestInitiator ? (
                        <div className="text-sm text-red-400 text-center py-2">
                          {t("messages.requestRejectedCannotMessage")}
                        </div>
                      ) : selectedConversation.requestStatus === "pending" && selectedConversation.isRequestInitiator ? (
                        <div className="text-sm text-yellow-400 text-center py-2">
                          {t("messages.requestPendingCannotMessage")}
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={messageInput}
                            onChange={(e) => setMessageInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSendMessage();
                              }
                            }}
                            placeholder={t("messages.typeMessage")}
                            className="flex-1 rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                          />
                          <button
                            onClick={handleSendMessage}
                            disabled={sendingMessage || !messageInput.trim()}
                            className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed"
                          >
                            {sendingMessage ? t("common.loading") : t("messages.send")}
                          </button>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 grid place-items-center text-sm text-gray-400">{t("messages.selectConversation")}</div>
                )}
              </div>
            </div>

            {pendingActionConversation && (
              <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-4">
                  <h3 className="text-white text-lg font-semibold mb-2">{t("messages.conversationActionTitle")}</h3>
                  <p className="text-sm text-gray-300 mb-4">
                    {t("messages.conversationActionDesc", {
                      name: pendingActionConversation.otherUser.displayName || pendingActionConversation.otherUser.username,
                    })}
                  </p>
                  <div className="grid gap-2">
                    <button
                      onClick={handleDeleteOnly}
                      className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-100 hover:bg-gray-800"
                    >
                      {t("messages.deleteOnly")}
                    </button>
                    <button
                      onClick={handleDeleteAndBlock}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm text-white hover:bg-red-700"
                    >
                      {t("messages.deleteAndBlock")}
                    </button>
                    <button
                      onClick={() => openConversation(pendingActionConversation).finally(() => setPendingActionConversation(null))}
                      className="rounded-lg border border-blue-600 px-4 py-2 text-sm text-blue-300 hover:bg-blue-900/20"
                    >
                      {t("messages.openOnly")}
                    </button>
                    <button
                      onClick={() => setPendingActionConversation(null)}
                      className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:bg-gray-800"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {filteredItems.length === 0 && !loading && <p className="text-gray-400 text-sm">{t("notifications.empty")}</p>}
            {filteredItems.map((n) => (
              <div key={n._id} className={`rounded-lg border border-gray-800 p-3 flex items-center justify-between ${n.readAt ? "bg-gray-950" : "bg-gray-900"}`}>
                <div className="pr-4">
                  <div className="text-sm text-gray-100">{renderText(n)}</div>
                  {n.ideaId?._id && (
                    <Link to={`/ideas/${n.ideaId._id}`} className="text-xs text-blue-400 hover:underline">
                      {t("notifications.openIdea")}
                    </Link>
                  )}
                </div>

                {!n.readAt && (
                  <button onClick={() => markOne(n._id)} className="text-xs rounded-lg border border-gray-700 px-2 py-1 hover:bg-gray-950 text-gray-200">
                    {t("notifications.read")}
                  </button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
