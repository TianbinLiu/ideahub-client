import { useEffect, useState, useRef } from "react";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  listConversations,
  getConversationMessages,
  sendDirectMessage,
} from "../api";
import { humanizeError } from "../utils/humanizeError";
import { UserHoverCard } from "../components/UserHoverCard";

type DirectMessage = {
  _id: string;
  conversationId: string;
  fromUserId: string | { _id: string; username?: string; displayName?: string; avatarUrl?: string };
  toUserId: string | { _id: string; username?: string; displayName?: string; avatarUrl?: string };
  content: string;
  createdAt: string;
  readAt?: string;
};

type Conversation = {
  conversationId: string;
  otherUser?: UserProfile;
  participants: Array<{
    _id: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }>;
  lastMessage: {
    content: string;
    fromUserId?: string;
    fromUser?: "me" | "them";
    createdAt: string;
  };
  unreadCount?: number;
};

type UserProfile = {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
};

export default function MessagesPage() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [otherUser, setOtherUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageContent, setMessageContent] = useState("");
  const [conversationLoading, setConversationLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  function toId(value: DirectMessage["fromUserId"] | DirectMessage["toUserId"] | undefined) {
    if (!value) return "";
    if (typeof value === "string") return value;
    return value._id || "";
  }

  function getOtherUserFromConversation(conversation: Conversation | undefined) {
    if (!conversation || !currentUser) return null;
    if (conversation.otherUser) return conversation.otherUser;
    return conversation.participants?.find((p) => p._id !== currentUser._id && p._id !== (currentUser as any).id) || null;
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (currentUser) {
      loadConversations();
      // Refresh conversations every 5 seconds
      const interval = setInterval(loadConversations, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  async function loadConversations() {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await listConversations();
      const nextConversations = res.conversations || [];
      setConversations(nextConversations);

      // Auto-select first conversation if none selected
      if (!selectedConversationId && nextConversations.length > 0) {
        setSelectedConversationId(nextConversations[0].conversationId);
      }
    } catch (e: any) {
      console.error("[MessagesPage] Error loading conversations:", e);
      // Only show error if not a network issue
      if (e.message && !e.message.includes("fetch")) {
        toast.error(humanizeError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(conversationId: string) {
    if (!currentUser) return;
    setConversationLoading(true);
    try {
      const res = await getConversationMessages(conversationId);
      setMessages(res.messages || []);

      // Find the other user
      const conversation = conversations.find((c) => c.conversationId === conversationId);
      if (conversation) {
        const other = getOtherUserFromConversation(conversation);
        if (other) {
          setOtherUser(other);
        }
      }
    } catch (e: any) {
      console.error("[MessagesPage] Error loading messages:", e);
      toast.error(humanizeError(e));
    } finally {
      setConversationLoading(false);
    }
  }

  useEffect(() => {
    if (selectedConversationId) {
      loadMessages(selectedConversationId);
      // Refresh messages every 3 seconds
      const interval = setInterval(() => loadMessages(selectedConversationId), 3000);
      return () => clearInterval(interval);
    }
  }, [selectedConversationId]);

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConversationId || !messageContent.trim() || !otherUser) return;

    setSendingMessage(true);
    try {
      await sendDirectMessage(selectedConversationId, otherUser._id, messageContent);
      setMessageContent("");
      // Reload messages
      await loadMessages(selectedConversationId);
      toast.success(t("messages.messageSent"));
    } catch (e: any) {
      console.error("[MessagesPage] Error sending message:", e);
      toast.error(humanizeError(e));
    } finally {
      setSendingMessage(false);
    }
  }

  const selectedConversation = conversations.find((c) => c.conversationId === selectedConversationId);

  return (
    <div className="h-screen flex bg-gray-950">
      {/* Sidebar - Conversations List */}
      <div className="w-80 border-r border-gray-700 bg-gray-900 flex flex-col">
        <div className="p-4 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white">{t("messages.conversations")}</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && conversations.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">{t("common.loading")}</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-gray-400 text-center">{t("messages.noConversations")}</div>
          ) : (
            <div className="space-y-1 p-2">
              {conversations.map((conv) => {
                const other = getOtherUserFromConversation(conv);
                const isSelected = conv.conversationId === selectedConversationId;
                const lastMsg = conv.lastMessage?.content || t("messages.noMessages");
                const sender = conv.lastMessage?.fromUser === "me" || conv.lastMessage?.fromUserId === currentUser?._id ? t("messages.you") : (other?.displayName || other?.username);

                return (
                  <button
                    key={conv.conversationId}
                    onClick={() => setSelectedConversationId(conv.conversationId)}
                    className={`w-full text-left px-3 py-3 rounded-lg transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white"
                        : "text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    <div className="font-semibold truncate">
                      {other?.displayName || other?.username}
                    </div>
                    <div className="text-sm text-gray-400 truncate">
                      {sender}: {lastMsg}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-950">
        {selectedConversation && otherUser ? (
          <>
            {/* Header */}
            <div className="border-b border-gray-700 bg-gray-900 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {otherUser.avatarUrl ? (
                  <img
                    src={otherUser.avatarUrl}
                    alt={otherUser.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold">
                    {otherUser.username[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <UserHoverCard userId={otherUser._id} username={otherUser.username}>
                    <h1 className="text-lg font-bold text-white hover:underline cursor-pointer">
                      {otherUser.displayName || otherUser.username}
                    </h1>
                  </UserHoverCard>
                  <p className="text-sm text-gray-400">@{otherUser.username}</p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {conversationLoading && messages.length === 0 ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  {t("common.loading")}
                </div>
              ) : messages.length === 0 ? (
                <div className="flex justify-center items-center h-full text-gray-400">
                  {t("messages.noMessages")}
                </div>
              ) : (
                messages.map((msg) => {
                  const senderId = toId(msg.fromUserId);
                  const isOwn = senderId === currentUser?._id || senderId === (currentUser as any)?.id;
                  return (
                    <div key={msg._id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-xs px-4 py-2 rounded-lg ${
                          isOwn
                            ? "bg-blue-600 text-white"
                            : "bg-gray-800 text-gray-100"
                        }`}
                      >
                        <p className="text-sm">{msg.content}</p>
                        <p className={`text-xs mt-1 ${isOwn ? "text-blue-200" : "text-gray-500"}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input */}
            <div className="border-t border-gray-700 bg-gray-900 p-4">
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input
                  type="text"
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder={t("messages.enterMessage")}
                  className="flex-1 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 focus:outline-none focus:border-blue-500"
                  disabled={sendingMessage}
                />
                <button
                  type="submit"
                  disabled={sendingMessage || messageContent.trim().length === 0}
                  className="rounded-lg bg-blue-600 text-white px-6 py-2 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed font-semibold"
                >
                  {sendingMessage ? t("common.sending") : t("messages.sendMessage")}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400">
            {loading ? t("common.loading") : t("messages.selectConversation")}
          </div>
        )}
      </div>
    </div>
  );
}
