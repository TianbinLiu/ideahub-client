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

  if (!res.ok) throw new Error(json?.message || `HTTP ${res.status}`);
  return json as T;
}

export type NotificationType = "LIKE" | "COMMENT" | "BOOKMARK" | "INTEREST";

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
