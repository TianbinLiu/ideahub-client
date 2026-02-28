import { useEffect, useState, useRef } from "react";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  listMessageRequests,
  viewMessageRequest,
  acceptMessageRequest,
  rejectMessageRequest,
  listConversations,
  getConversationMessages,
  sendDirectMessage,
} from "../api";
import { humanizeError } from "../utils/humanizeError";
import { UserHoverCard } from "../components/UserHoverCard";

type MessageRequest = {
  _id: string;
  fromUserId: {
    _id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  };
  toUserId: string;
  initialMessage: string;
  status: "pending" | "accepted" | "rejected";
  viewedAt?: string;
  respondedAt?: string;
  createdAt: string;
};

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

export default function MessageRequestsPage() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [requests, setRequests] = useState<MessageRequest[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentUser) {
      loadAll();
      // Refresh every 5 seconds
      const interval = setInterval(loadAll, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadAll() {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [reqRes, convRes] = await Promise.all([
        listMessageRequests(),
        listConversations(),
      ]);
      setRequests(reqRes.requests || []);
      setConversations(convRes.conversations || []);
    } catch (e: any) {
      console.error("[MessageRequestsPage] Error loading:", e);
      if (e.message && !e.message.includes("fetch")) {
        toast.error(humanizeError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    setLoadingMessages(true);
    try {
      const res = await getConversationMessages(conversationId, 1, 50);
      setMessages((res.messages || []).reverse());
    } catch (e: any) {
      console.error("[MessageRequestsPage] Error loading messages:", e);
      toast.error(humanizeError(e));
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSendMessage() {
    if (!messageInput.trim() || !selectedConversation) return;
    setSendingMessage(true);
    try {
      const res = await sendDirectMessage(
        selectedConversation.conversationId,
        selectedConversation.otherUser._id,
        messageInput
      );
      setMessages((prev) => [...prev, res.message]);
      setMessageInput("");
      // Refresh conversations to update last message
      await loadAll();
    } catch (e: any) {
      console.error("[MessageRequestsPage] Error sending message:", e);
      toast.error(humanizeError(e));
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleViewMessage(requestId: string) {
    try {
      await viewMessageRequest(requestId);
      // Mark as expanded
      setExpandedIds((prev) => new Set([...prev, requestId]));
      // Reload to get updated viewedAt
      await loadAll();
      // Trigger navbar update to refresh notification badge
      window.dispatchEvent(new Event('notificationsUpdated'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }
  async function handleSelectConversation(conversation: Conversation) {
    setSelectedConversation(conversation);
    await loadMessages(conversation.conversationId);
  }
  async function handleAccept(requestId: string) {
    setActionLoading(requestId);
    try {
      await acceptMessageRequest(requestId);
      toast.success(t("messages.acceptedRequest"));
      await loadAll();
      // Trigger navbar update to refresh notification badge
      window.dispatchEvent(new Event('notificationsUpdated'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(requestId: string) {
    setActionLoading(requestId);
    try {
      await rejectMessageRequest(requestId);
      toast.success(t("messages.rejectedRequest"));
      await loadAll();
      // Trigger navbar update to refresh notification badge
      window.dispatchEvent(new Event('notificationsUpdated'));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setActionLoading(null);
    }
  }

  const statusColor = {
    pending: "text-yellow-400",
    accepted: "text-green-400",
    rejected: "text-red-400",
  };

  const statusLabel = {
    pending: t("messages.statusPending"),
    accepted: t("messages.statusAccepted"),
    rejected: t("messages.statusRejected"),
  };

    const pendingRequests = requests.filter((r) => r.status === "pending");
    const respondedRequests = requests.filter((r) => r.status !== "pending");

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold">{t("messages.messageRequests")}</h1>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Conversations */}
        <div className="w-64 border-r border-gray-800 flex flex-col bg-gray-900 overflow-y-auto">
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold text-white mb-3">{t("messages.myConversations") || "最近消息"}</h2>
            {conversations.length === 0 && !loading ? (
              <p className="text-sm text-gray-400">{t("messages.noConversations") || "暂无对话"}</p>
            ) : (
              <div className="space-y-2">
                {conversations.map((conv) => (
                  <div
                    key={conv.conversationId}
                    onClick={() => handleSelectConversation(conv)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedConversation?.conversationId === conv.conversationId
                        ? "bg-blue-600"
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
                        <p className="font-semibold text-sm truncate">
                          {conv.otherUser.displayName || conv.otherUser.username}
                        </p>
                        <p className="text-xs text-gray-400 truncate">{conv.lastMessage.content}</p>
                      </div>
                      {conv.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center rounded-full bg-red-600 text-white text-xs min-w-5 h-5 px-1 flex-shrink-0">
                          {conv.unreadCount > 99 ? "99+" : conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Main Content or Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Chat Header */}
              <div className="border-b border-gray-800 p-4 bg-gray-900">
                <div className="flex items-center gap-3">
                  {selectedConversation.otherUser.avatarUrl ? (
                    <img
                      src={selectedConversation.otherUser.avatarUrl}
                      alt={selectedConversation.otherUser.username}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                      {selectedConversation.otherUser.username[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="font-semibold">
                      {selectedConversation.otherUser.displayName || selectedConversation.otherUser.username}
                    </h3>
                    <p className="text-xs text-gray-400">@{selectedConversation.otherUser.username}</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loadingMessages ? (
                  <div className="text-center text-gray-400">{t("common.loading")}</div>
                ) : messages.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">{t("messages.noMessages") || "尚无消息"}</div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg._id}
                      className={`flex ${msg.fromUserId._id === currentUser?._id ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          msg.fromUserId._id === currentUser?._id
                            ? "bg-blue-600 text-white"
                            : "bg-gray-800 text-gray-100"
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className="text-xs mt-1 opacity-70">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="border-t border-gray-800 p-4 bg-gray-900">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={messageInput}
                    onChange={(e) => setMessageInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    placeholder={t("messages.typeMessage") || "输入消息..."}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={sendingMessage || !messageInput.trim()}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed font-semibold text-sm"
                  >
                    {sendingMessage ? t("common.loading") : t("messages.send") || "发送"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* No Conversation Selected - Show Requests */
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-4xl mx-auto p-6">
                {loading && requests.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">{t("common.loading")}</div>
                ) : requests.length === 0 ? (
                  <div className="text-center text-gray-400 py-8">{t("messages.noRequests")}</div>
                ) : (
                  <div className="space-y-6">
                    {/* Pending Requests */}
                    {pendingRequests.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4 text-white">
                          {t("messages.pendingRequests")}
                        </h2>
                        <div className="space-y-4">
                          {pendingRequests.map((req) => {
                            const isExpanded = expandedIds.has(req._id);
                            const isViewed = !!req.viewedAt;

                            return (
                              <div
                                key={req._id}
                                className="border border-gray-700 rounded-lg bg-gray-900 p-4 hover:bg-gray-800 transition-colors"
                              >
                                {/* Request Header */}
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3 flex-1">
                                    {req.fromUserId.avatarUrl ? (
                                      <img
                                        src={req.fromUserId.avatarUrl}
                                        alt={req.fromUserId.username}
                                        className="w-10 h-10 rounded-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                                        {req.fromUserId.username[0].toUpperCase()}
                                      </div>
                                    )}

                                    <div className="min-w-0 flex-1">
                                      <UserHoverCard
                                        userId={req.fromUserId._id}
                                        username={req.fromUserId.username}
                                      >
                                        <p className="font-semibold hover:underline cursor-pointer truncate">
                                          {t("messages.requestFrom", {
                                            name: req.fromUserId.displayName || req.fromUserId.username,
                                          })}
                                        </p>
                                      </UserHoverCard>
                                      <p className="text-sm text-gray-400">
                                        {new Date(req.createdAt).toLocaleDateString()} at{" "}
                                        {new Date(req.createdAt).toLocaleTimeString([], {
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </p>
                                    </div>
                                  </div>

                                  <span className={`text-sm font-semibold ml-4 ${statusColor.pending}`}>
                                    {statusLabel.pending}
                                  </span>
                                </div>

                                {/* Initial Message Preview / Full Message */}
                                <div className="mb-4">
                                  {!isViewed && !isExpanded ? (
                                    <div className="bg-gray-800 border border-gray-700 rounded p-3 text-gray-300 italic">
                                      {t("messages.messageHidden")}
                                    </div>
                                  ) : (
                                    <div className="bg-gray-800 border border-gray-700 rounded p-3 text-gray-200">
                                      {req.initialMessage}
                                    </div>
                                  )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-3">
                                  {!isViewed && !isExpanded ? (
                                    <button
                                      onClick={() => handleViewMessage(req._id)}
                                      className="flex-1 rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 font-semibold text-sm"
                                    >
                                      {t("messages.viewMessage")}
                                    </button>
                                  ) : null}

                                  <button
                                    onClick={() => handleAccept(req._id)}
                                    disabled={actionLoading === req._id}
                                    className="flex-1 rounded-lg bg-green-600 text-white px-4 py-2 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed font-semibold text-sm"
                                  >
                                    {actionLoading === req._id ? t("common.loading") : t("messages.accept")}
                                  </button>

                                  <button
                                    onClick={() => handleReject(req._id)}
                                    disabled={actionLoading === req._id}
                                    className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed font-semibold text-sm"
                                  >
                                    {actionLoading === req._id ? t("common.loading") : t("messages.reject")}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Responded Requests */}
                    {respondedRequests.length > 0 && (
                      <div>
                        <h2 className="text-xl font-semibold mb-4 text-gray-400">
                          {t("messages.respondedRequests")}
                        </h2>
                        <div className="space-y-3">
                          {respondedRequests.map((req) => (
                            <div
                              key={req._id}
                              className="border border-gray-700 rounded-lg bg-gray-900/50 p-4 flex items-center justify-between"
                            >
                              <div className="flex items-center gap-3 flex-1">
                                {req.fromUserId.avatarUrl ? (
                                  <img
                                    src={req.fromUserId.avatarUrl}
                                    alt={req.fromUserId.username}
                                    className="w-10 h-10 rounded-full object-cover"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                                    {req.fromUserId.username[0].toUpperCase()}
                                  </div>
                                )}

                                <div className="min-w-0 flex-1">
                                  <UserHoverCard
                                    userId={req.fromUserId._id}
                                    username={req.fromUserId.username}
                                  >
                                    <p className="font-semibold hover:underline cursor-pointer truncate">
                                      {req.fromUserId.displayName || req.fromUserId.username}
                                    </p>
                                  </UserHoverCard>
                                  <p className="text-sm text-gray-500">
                                    {req.status === "accepted"
                                      ? t("messages.youAcceptedThis")
                                      : t("messages.youRejectedThis")}
                                  </p>
                                </div>
                              </div>

                              <span
                                className={`text-sm font-semibold ml-4 ${statusColor[req.status]}`}
                              >
                                {statusLabel[req.status]}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
