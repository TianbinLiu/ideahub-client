import { useEffect, useState } from "react";
import { useAuth } from "../authContext";
import toast from "react-hot-toast";
import { useTranslation } from "react-i18next";
import {
  listMessageRequests,
  viewMessageRequest,
  acceptMessageRequest,
  rejectMessageRequest,
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
  responseMessage?: string;
  status: "pending" | "accepted" | "rejected";
  viewedAt?: string;
  respondedAt?: string;
  createdAt: string;
};

export default function MessageRequestsPage() {
  const { user: currentUser } = useAuth();
  const { t } = useTranslation();

  const [receivedRequests, setReceivedRequests] = useState<MessageRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<MessageRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectWithMessage, setRejectWithMessage] = useState<{ [key: string]: string }>({});
  const [showRejectInput, setShowRejectInput] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentUser) {
      loadRequests();
      const interval = setInterval(loadRequests, 5000);
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  async function loadRequests() {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await listMessageRequests();
      setReceivedRequests(res.receivedRequests || []);
      setSentRequests(res.sentRequests || []);
    } catch (e: any) {
      console.error("[MessageRequestsPage] Error loading requests:", e);
      if (e.message && !e.message.includes("fetch")) {
        toast.error(humanizeError(e));
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleViewMessage(requestId: string) {
    try {
      await viewMessageRequest(requestId);
      setExpandedIds((prev) => new Set([...prev, requestId]));
      await loadRequests();
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    }
  }

  async function handleAccept(requestId: string) {
    setActionLoading(requestId);
    try {
      await acceptMessageRequest(requestId);
      toast.success(t("messages.acceptedRequest"));
      await loadRequests();
      window.dispatchEvent(new Event("notificationsUpdated"));
    } catch (e: any) {
      toast.error(humanizeError(e));
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(requestId: string) {
    setActionLoading(requestId);
    try {
      const message = rejectWithMessage[requestId] || "";
      await rejectMessageRequest(requestId, message);
      toast.success(t("messages.rejectedRequest"));
      setRejectWithMessage((prev) => {
        const newState = { ...prev };
        delete newState[requestId];
        return newState;
      });
      setShowRejectInput((prev) => {
        const newSet = new Set(prev);
        newSet.delete(requestId);
        return newSet;
      });
      await loadRequests();
      window.dispatchEvent(new Event("notificationsUpdated"));
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

  const pendingReceivedRequests = receivedRequests.filter((r) => r.status === "pending");
  const respondedReceivedRequests = receivedRequests.filter((r) => r.status !== "pending");
  const allRequests = [...receivedRequests, ...sentRequests];

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">{t("messages.messageRequests")}</h1>

        {loading && allRequests.length === 0 ? (
          <div className="text-center text-gray-400 py-8">{t("common.loading")}</div>
        ) : allRequests.length === 0 ? (
          <div className="text-center text-gray-400 py-8">{t("messages.noRequests")}</div>
        ) : (
          <div className="space-y-6">
            {/* RECEIVED REQUESTS SECTION */}
            {pendingReceivedRequests.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-white">{t("messages.pendingRequests")}</h2>
                <div className="space-y-4">
                  {pendingReceivedRequests.map((req) => {
                    const isExpanded = expandedIds.has(req._id);
                    const isViewed = !!req.viewedAt;

                    return (
                      <div key={req._id} className="border border-gray-700 rounded-lg bg-gray-900 p-4 hover:bg-gray-800 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 flex-1">
                            {req.fromUserId.avatarUrl ? (
                              <img src={req.fromUserId.avatarUrl} alt={req.fromUserId.username} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                                {req.fromUserId.username[0].toUpperCase()}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <UserHoverCard userId={req.fromUserId._id} username={req.fromUserId.username}>
                                <p className="font-semibold hover:underline cursor-pointer truncate">
                                  {t("messages.requestFrom", { name: req.fromUserId.displayName || req.fromUserId.username })}
                                </p>
                              </UserHoverCard>
                              <p className="text-sm text-gray-400">
                                {new Date(req.createdAt).toLocaleDateString()} at{" "}
                                {new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>

                          <span className={`text-sm font-semibold ml-4 ${statusColor.pending}`}>{statusLabel.pending}</span>
                        </div>

                        <div className="mb-4">
                          {!isViewed && !isExpanded ? (
                            <div className="bg-gray-800 border border-gray-700 rounded p-3 text-gray-300 italic">
                              {t("messages.messageHidden")}
                            </div>
                          ) : (
                            <div className="bg-gray-800 border border-gray-700 rounded p-3 text-gray-200">{req.initialMessage}</div>
                          )}
                        </div>

                        {showRejectInput.has(req._id) && (
                          <div className="mb-4">
                            <textarea
                              placeholder={t("messages.rejectMessagePlaceholder")}
                              value={rejectWithMessage[req._id] || ""}
                              onChange={(e) =>
                                setRejectWithMessage((prev) => ({
                                  ...prev,
                                  [req._id]: e.target.value,
                                }))
                              }
                              maxLength={500}
                              className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500 focus:outline-none focus:border-red-500 resize-none text-sm"
                              rows={3}
                            />
                            <p className="text-xs text-gray-400 mt-1">
                              {(rejectWithMessage[req._id] || "").length}/500
                            </p>
                          </div>
                        )}

                        <div className="flex gap-3">
                          {!isViewed && !isExpanded ? (
                            <button onClick={() => handleViewMessage(req._id)} className="flex-1 rounded-lg bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 font-semibold text-sm">
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
                            onClick={() => {
                              if (!showRejectInput.has(req._id)) {
                                setShowRejectInput((prev) => new Set([...prev, req._id]));
                              } else {
                                handleReject(req._id);
                              }
                            }}
                            disabled={actionLoading === req._id}
                            className="flex-1 rounded-lg bg-red-600 text-white px-4 py-2 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed font-semibold text-sm"
                          >
                            {actionLoading === req._id
                              ? t("common.loading")
                              : showRejectInput.has(req._id)
                              ? t("messages.send")
                              : t("messages.reject")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {respondedReceivedRequests.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-gray-400">{t("messages.respondedRequests")}</h2>
                <div className="space-y-3">
                  {respondedReceivedRequests.map((req) => (
                    <div key={req._id} className="border border-gray-700 rounded-lg bg-gray-900/50 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        {req.fromUserId.avatarUrl ? (
                          <img src={req.fromUserId.avatarUrl} alt={req.fromUserId.username} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                            {req.fromUserId.username[0].toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <UserHoverCard userId={req.fromUserId._id} username={req.fromUserId.username}>
                            <p className="font-semibold hover:underline cursor-pointer truncate">
                              {req.fromUserId.displayName || req.fromUserId.username}
                            </p>
                          </UserHoverCard>
                          <p className="text-sm text-gray-500">
                            {req.status === "accepted" ? t("messages.youAcceptedThis") : t("messages.youRejectedThis")}
                          </p>
                          {req.status === "rejected" && req.responseMessage && (
                            <p className="text-sm text-gray-400 mt-1 italic">"{req.responseMessage}"</p>
                          )}
                        </div>
                      </div>

                      <span className={`text-sm font-semibold ml-4 ${statusColor[req.status]}`}>{statusLabel[req.status]}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SENT REQUESTS SECTION */}
            {sentRequests.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 text-blue-400">{t("messages.sentMessageRequests")}</h2>
                <div className="space-y-4">
                  {sentRequests.map((req) => {
                    const isExpanded = expandedIds.has(req._id);
                    const toUser = (req.toUserId as any);

                    return (
                      <div key={req._id} className={`border rounded-lg p-4 transition-colors ${
                        req.status === "pending" 
                          ? "border-gray-700 bg-gray-900 hover:bg-gray-800" 
                          : "border-gray-700 bg-gray-900/50"
                      }`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 flex-1">
                            {toUser?.avatarUrl ? (
                              <img src={toUser.avatarUrl} alt={toUser.username} className="w-10 h-10 rounded-full object-cover" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                                {toUser?.username?.[0]?.toUpperCase() || "?"}
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              <UserHoverCard userId={toUser?._id} username={toUser?.username || "Unknown"}>
                                <p className="font-semibold hover:underline cursor-pointer truncate">
                                  {t("messages.requestTo", { name: toUser?.displayName || toUser?.username || "Unknown" })}
                                </p>
                              </UserHoverCard>
                              <p className="text-sm text-gray-400">
                                {new Date(req.createdAt).toLocaleDateString()} at{" "}
                                {new Date(req.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                              </p>
                            </div>
                          </div>

                          <span className={`text-sm font-semibold ml-4 ${statusColor[req.status]}`}>{statusLabel[req.status]}</span>
                        </div>

                        <div className="mb-3">
                          {!isExpanded ? (
                            <div className="bg-gray-800 border border-gray-700 rounded p-3 text-gray-300 text-sm max-h-20 overflow-y-auto">
                              {req.initialMessage}
                            </div>
                          ) : (
                            <div className="bg-gray-800 border border-gray-700 rounded p-3 text-gray-200">{req.initialMessage}</div>
                          )}
                        </div>

                        {req.status === "rejected" && req.responseMessage && (
                          <div className="mb-3 p-3 bg-red-900/30 border border-red-700/50 rounded text-sm">
                            <p className="text-red-300 font-semibold mb-1">{t("messages.rejectionReason")}:</p>
                            <p className="text-red-200">{req.responseMessage}</p>
                          </div>
                        )}

                        {req.status === "pending" && (
                          <div className="text-xs text-yellow-400">
                            {t("messages.waitingForResponse")}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
