/**
 * @file api.ts - TODO: 添加功能描述
 * @category Utility
 * 
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 相关章节
 * 
 * 职责:
 * - TODO: 描述主要职责
 * 
 */

/**
 * api.ts - 统一HTTP请求封装
 * 
 * 📖 AI开发规范：修改前必读 /.ai-instructions.md 和 PROJECT_STRUCTURE.md
 * 🔄 修改后同步更新：PROJECT_STRUCTURE.md 相关章节
 * 
 * 重要：
 * - 所有API调用必须使用 apiFetch() 而非原生 fetch()
 * - 自动携带JWT token
 * - 统一错误处理
 * - 不要绕过此封装
 */

import { API_BASE } from "./config";
import { getToken } from "./auth";

export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err: any = new Error(json?.message || `HTTP ${res.status}`);
    err.code = json?.code;
    err.details = json?.details;
    err.status = res.status;
    throw err;
  }

  return json as T;
}

export type NotificationType = "LIKE" | "COMMENT" | "BOOKMARK" | "INTEREST" | "MENTION" | "INVITE" | "LIKE_COMMENT" | "LIKE_POST";

export type NotificationItem = {
  _id: string;
  type: NotificationType;
  readAt: string | null;
  createdAt: string;
  actorId?: { username?: string; role?: string };
  ideaId?: { _id: string; title?: string; visibility?: string };
  payload?: any;
};

export function getUnreadCount() {
  return apiFetch<{ ok: true; count: number }>(`/api/notifications/unread-count`);
}

export function listNotifications(params?: { page?: number; limit?: number; unread?: 0 | 1 }) {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.limit) q.set("limit", String(params.limit));
  if (params?.unread) q.set("unread", String(params.unread));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiFetch<{ ok: true; items: NotificationItem[]; total: number; page: number; limit: number }>(
    `/api/notifications${suffix}`
  );
}

export function markNotificationRead(id: string) {
  return apiFetch<{ ok: true }>(`/api/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiFetch<{ ok: true }>(`/api/notifications/read-all`, { method: "POST" });
}

export function searchUsers(query: string, limit: number = 8) {
  const q = new URLSearchParams();
  if (query) q.set("q", query);
  if (limit) q.set("limit", String(limit));
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiFetch<{ users: { _id: string; username: string }[] }>(`/api/users/search${suffix}`);
}

// User Reputation API
export type ReputationStats = {
  likes: number;
  dislikes: number;
  badge: "popular" | "malicious" | null;
};

export function voteUser(userId: string, vote: 1 | -1) {
  return apiFetch<{ ok: true; action: "voted" | "removed" | "updated"; stats: ReputationStats }>(
    `/api/users/${userId}/reputation`,
    {
      method: "POST",
      body: JSON.stringify({ vote }),
    }
  );
}

export function getUserReputation(userId: string) {
  return apiFetch<{ ok: true; stats: ReputationStats; myVote: 1 | -1 | null }>(
    `/api/users/${userId}/reputation`
  );
}

// Messages API
export function sendMessageRequest(toUserId: string, initialMessage: string) {
  return apiFetch<{ ok: true; request: any }>(
    `/api/messages/request`,
    {
      method: "POST",
      body: JSON.stringify({ toUserId, initialMessage }),
    }
  );
}

export function listMessageRequests(status?: string) {
  const params = status ? `?status=${status}` : "";
  return apiFetch<{ ok: true; requests: any[] }>(`/api/messages/request${params}`);
}

export function viewMessageRequest(requestId: string) {
  return apiFetch<{ ok: true }>(`/api/messages/request/${requestId}/view`, {
    method: "PATCH",
  });
}

export function acceptMessageRequest(requestId: string) {
  return apiFetch<{ ok: true; conversationId: string }>(
    `/api/messages/request/${requestId}/accept`,
    { method: "PATCH" }
  );
}

export function rejectMessageRequest(requestId: string) {
  return apiFetch<{ ok: true }>(`/api/messages/request/${requestId}/reject`, {
    method: "PATCH",
  });
}

export function listConversations() {
  return apiFetch<{ ok: true; conversations: any[] }>(`/api/messages/conversations`);
}

export function getConversationMessages(conversationId: string, page = 1, limit = 50) {
  return apiFetch<{ ok: true; messages: any[]; total: number; page: number; limit: number }>(
    `/api/messages/conversations/${conversationId}?page=${page}&limit=${limit}`
  );
}

export function deleteConversation(conversationId: string) {
  return apiFetch<{ ok: true }>(`/api/messages/conversations/${conversationId}`, {
    method: "DELETE",
  });
}

export function listDmBlacklist() {
  return apiFetch<{ ok: true; items: any[] }>(`/api/messages/blacklist`);
}

export function getDmBlockStatus(userId: string) {
  return apiFetch<{ ok: true; blocked: boolean }>(`/api/messages/blacklist/${userId}/status`);
}

export function blockDmUser(userId: string) {
  return apiFetch<{ ok: true }>(`/api/messages/blacklist/${userId}`, {
    method: "POST",
  });
}

export function unblockDmUser(userId: string) {
  return apiFetch<{ ok: true }>(`/api/messages/blacklist/${userId}`, {
    method: "DELETE",
  });
}

export function sendDirectMessage(conversationId: string, toUserId: string, content: string) {
  return apiFetch<{ ok: true; message: any }>(
    `/api/messages/send`,
    {
      method: "POST",
      body: JSON.stringify({ conversationId, toUserId, content }),
    }
  );
}


