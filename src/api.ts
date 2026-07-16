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
import { getToken, notifyAuthExpired } from "./auth";
import type { SiteDraft, SiteDraftWidget } from "./utils/siteDraft";

type ApiError = Error & {
  code?: string;
  details?: unknown;
  status?: number;
};

function createApiError(message: string, payload: { code?: string; details?: unknown; status: number }): ApiError {
  const err = new Error(message) as ApiError;
  err.code = payload.code;
  err.details = payload.details;
  err.status = payload.status;
  return err;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiFetch<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const hadToken = Boolean(token);
  const headers = new Headers(init.headers);

  const isFormDataBody = typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers.has("Content-Type") && !isFormDataBody) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  const json = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 401 && hadToken) {
      notifyAuthExpired(json?.code || "UNAUTHORIZED");
    }

    throw createApiError(json?.message || `HTTP ${res.status}`, {
      code: json?.code,
      details: json?.details,
      status: res.status,
    });
  }

  return json as T;
}

export async function apiUploadImage(file: File, scope: "idea" | "comment" | "leaderboard" = "idea") {
  const token = getToken();
  const hadToken = Boolean(token);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${API_BASE}/api/uploads/image?scope=${encodeURIComponent(scope)}`, {
    method: "POST",
    body: formData,
    headers,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && hadToken) {
      notifyAuthExpired(json?.code || "UNAUTHORIZED");
    }

    throw createApiError(json?.message || `HTTP ${res.status}`, {
      code: json?.code,
      details: json?.details,
      status: res.status,
    });
  }

  return json as { ok: true; imageUrl: string; maxSizeBytes: number; mimeType: string; size: number };
}

export async function apiUploadMedia(file: File) {
  const token = getToken();
  const hadToken = Boolean(token);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const formData = new FormData();
  formData.append("media", file);

  const res = await fetch(`${API_BASE}/api/uploads/media`, {
    method: "POST",
    body: formData,
    headers,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && hadToken) {
      notifyAuthExpired(json?.code || "UNAUTHORIZED");
    }

    throw createApiError(json?.message || `HTTP ${res.status}`, {
      code: json?.code,
      details: json?.details,
      status: res.status,
    });
  }

  return json as {
    ok: true;
    mediaUrl: string;
    maxSizeBytes: number;
    mimeType: string;
    size: number;
    resourceType: "image" | "video";
  };
}

export type NotificationType = "LIKE" | "COMMENT" | "BOOKMARK" | "INTEREST" | "MENTION" | "INVITE" | "LIKE_COMMENT" | "DISLIKE_COMMENT" | "LIKE_POST" | "MESSAGE_REQUEST_ACCEPTED" | "MESSAGE_REQUEST_REJECTED";

export type NotificationItem = {
  _id: string;
  type: NotificationType;
  readAt: string | null;
  createdAt: string;
  actorId?: { username?: string; role?: string };
  ideaId?: { _id: string; title?: string; visibility?: string };
  payload?: Record<string, unknown>;
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

export type AuthRegion = "CN" | "GLOBAL" | "UNKNOWN";
export type OauthProvider = "google" | "github";

export type AuthCapabilities = {
  ok: true;
  region: AuthRegion;
  country: string;
  emailPasswordEnabled: boolean;
  oauthEnabled: boolean;
  providers: OauthProvider[];
};

export type OauthLinks = {
  ok: true;
  availableProviders: OauthProvider[];
  hasPassword: boolean;
  linkedProviders: Record<OauthProvider, boolean>;
  canUnlink: Record<OauthProvider, boolean>;
};

export type AuthUser = {
  _id: string;
  username: string;
  email: string;
  role: "user" | "company" | "admin";
  hasPassword: boolean;
};

export type Live2DComponentSettings = {
  enabled: boolean;
  source: "remote" | "uploaded";
  modelJsonUrl: string;
  uploadedModelJsonUrl: string;
  uploadedBundleName: string;
};

export type ToggleComponentSettings = {
  enabled: boolean;
};

export type SiteComponentCatalogItem = {
  key: "live2d" | "tagRank" | "siteTemplateEditor";
  title: string;
  description: string;
  enabled: boolean;
  hasSettings: boolean;
  settingsPath?: string;
};

export type MyComponentsResponse = {
  ok: true;
  components: {
    live2d: Live2DComponentSettings;
    tagRank: ToggleComponentSettings;
    siteTemplateEditor: ToggleComponentSettings;
  };
  catalog: SiteComponentCatalogItem[];
};

export function getAuthCapabilities() {
  return apiFetch<AuthCapabilities>("/api/auth/capabilities");
}

export function getOauthLinks() {
  return apiFetch<OauthLinks>("/api/auth/oauth/links");
}

export function startOauthLink(provider: OauthProvider, next: string = "/me") {
  return apiFetch<{ ok: true; redirectUrl: string }>("/api/auth/oauth/link/start", {
    method: "POST",
    body: JSON.stringify({ provider, next }),
  });
}

export function unlinkOauthProvider(provider: OauthProvider) {
  return apiFetch<OauthLinks>(`/api/auth/oauth/links/${provider}`, {
    method: "DELETE",
  });
}

export function setPassword(newPassword: string) {
  return apiFetch<{ ok: true; token: string; user: AuthUser }>("/api/auth/set-password", {
    method: "POST",
    body: JSON.stringify({ newPassword }),
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return apiFetch<{ ok: true; token: string; user: AuthUser }>("/api/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function getMyComponents() {
  return apiFetch<MyComponentsResponse>("/api/me/components");
}

export function updateMyComponents(payload: {
  live2d?: Partial<Live2DComponentSettings> & { enabled: boolean; source: "remote" | "uploaded" };
  tagRank?: Partial<ToggleComponentSettings> & { enabled: boolean };
  siteTemplateEditor?: Partial<ToggleComponentSettings> & { enabled: boolean };
}) {
  return apiFetch<MyComponentsResponse>("/api/me/components", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function uploadLive2dBundle(file: File) {
  const formData = new FormData();
  formData.append("bundle", file);
  return apiFetch<{
    ok: true;
    uploadedModelJsonUrl: string;
    uploadedBundleName: string;
    maxSizeBytes: number;
    components: MyComponentsResponse["components"];
  }>("/api/me/components/live2d/upload", {
    method: "POST",
    body: formData,
  });
}

export function logoutAllSessions() {
  return apiFetch<{ ok: true }>("/api/auth/logout-all", {
    method: "POST",
  });
}

export function generateIdeaDraft(payload: { content: string; ideaType?: "business" | "feedback" | "daily" | "dynamic" }) {
  return apiFetch<{ ok: true; draft: { title: string; summary: string; tags: string[]; model?: string } }>(
    "/api/ideas/draft",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

// ===== 卢本伟广场 · 浏览器插件：三条发言方案 =====
export type ArenaStyleKey = "rational" | "troll" | "deflect" | "mock" | "deescalate" | "support";

export type ArenaScheme = {
  id: string;
  styleKey: ArenaStyleKey | string;
  styleLabel: string;
  text: string;
  note?: string;
  ratings: {
    /** 破防等级 0-100 */
    breakdown: number;
    /** 叠甲等级 0-100 */
    armor: number;
    /** 被举报吞评风险 0-100 */
    banRisk: number;
  };
};

export function suggestArenaReplies(payload: {
  draft?: string;
  platform?: string;
  context?: string;
  persona?: string;
  styleHints?: string[];
}) {
  return apiFetch<{ ok: true; schemes: ArenaScheme[]; model?: string; fallback?: boolean }>(
    "/api/arena/suggest",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiFetch<{ ok: true; request?: any; direct?: boolean; conversationId?: string; message?: any }>(
    `/api/messages/request`,
    {
      method: "POST",
      body: JSON.stringify({ toUserId, initialMessage }),
    }
  );
}

export function listMessageRequests(status?: string) {
  const params = status ? `?status=${status}` : "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiFetch<{ ok: true; receivedRequests: any[]; sentRequests: any[] }>(`/api/messages/request${params}`);
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

export function rejectMessageRequest(requestId: string, responseMessage?: string) {
  return apiFetch<{ ok: true }>(`/api/messages/request/${requestId}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ responseMessage: responseMessage || "" }),
  });
}

export function listConversations() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiFetch<{ ok: true; conversations: any[] }>(`/api/messages/conversations`);
}

export function getConversationMessages(conversationId: string, page = 1, limit = 50) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return apiFetch<{ ok: true; message: any }>(
    `/api/messages/send`,
    {
      method: "POST",
      body: JSON.stringify({ conversationId, toUserId, content }),
    }
  );
}

// User Account Management
export function deleteAccount(userId: string) {
  return apiFetch<{ ok: true; message: string }>(`/api/users/${userId}`, {
    method: "DELETE",
  });
}

// Ideas and groups API - Type definitions
export type ExternalSource = {
  platform?: string;
  url?: string;
  originalAuthor?: string;
  sourceCreatedAt?: string;
};

export type IdeaStats = {
  likeCount?: number;
  commentCount?: number;
  bookmarkCount?: number;
  viewCount?: number;
};

export type AiReview = {
  feasibilityScore?: number;
  profitPotentialScore?: number;
  analysisText?: string;
  model?: string;
  createdAt?: string;
};

export type Group = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  visibility?: "public" | "private" | "unlisted";
  memberCount?: number | null;
  joined?: boolean;
  isWorld?: boolean;
  canManage?: boolean;
  canCreateInvite?: boolean;
  joinCode?: string;
  createdAt?: string;
  creator?: string | { _id: string; username?: string } | null;
};

export type GroupInvite = {
  _id: string;
  groupSlug: string;
  code: string;
  token: string;
  sharePath: string;
};

export type GroupChat = {
  _id: string;
  groupSlug: string;
  name: string;
  description?: string;
  memberCount?: number;
  creator?: { _id: string; username?: string; role?: string };
  createdAt?: string;
};

export type GroupMember = {
  _id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
  role?: string;
  groupRole: "creator" | "admin" | "member";
};

export type GroupReferral = {
  _id: string;
  groupSlug: string;
  invitee?: { _id: string; username?: string; displayName?: string; avatarUrl?: string };
  referrer: string;
  joinMethod: "invite" | "group_code";
  createdAt?: string;
};

export type Idea = {
  _id: string;
  ideaType?: "business" | "feedback" | "external" | "daily" | "dynamic";
  title: string;
  summary: string;
  content: string;
  imageUrls?: string[];
  coverImageUrl?: string;
  author?: { _id: string; username: string; role: string };
  tags?: string[];
  groupSlug?: string;
  groupName?: string;
  groupVisibility?: "public" | "private" | "unlisted";
  visibility?: "public" | "private" | "unlisted";
  isMonetizable?: boolean;
  licenseType?: string;
  createdAt?: string;
  updatedAt?: string;
  stats?: IdeaStats;
  aiReview?: AiReview;
  isFeedback?: boolean;
  feedbackType?: string;
  feedbackStatus?: string;
  aiSummary?: string;
  externalSource?: ExternalSource;
  recommendationFeedbackReason?: "not_interested" | "already_recommended" | null;
};

export function listGroups(params?: { q?: string }) {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  return apiFetch<{ ok: true; groups: Group[]; joinedGroupSlugs: string[] }>(`/api/groups${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function createGroup(payload: { name: string; slug?: string; description?: string; visibility?: "public" | "private" | "unlisted"; joinCode?: string }) {
  return apiFetch<{ ok: true; group: Group }>("/api/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getGroup(slug: string) {
  return apiFetch<{ ok: true; group: Group }>(`/api/groups/${encodeURIComponent(slug)}`);
}

export function joinGroup(slug: string, payload?: { code?: string; inviteCode?: string; inviteToken?: string }) {
  return apiFetch<{ ok: true; joined: boolean; slug: string }>(`/api/groups/${encodeURIComponent(slug)}/join`, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

export function leaveGroup(slug: string) {
  return apiFetch<{ ok: true; joined: boolean; slug: string }>(`/api/groups/${encodeURIComponent(slug)}/leave`, {
    method: "POST",
  });
}

export function createGroupInvite(slug: string) {
  return apiFetch<{ ok: true; invite: GroupInvite }>(`/api/groups/${encodeURIComponent(slug)}/invites`, {
    method: "POST",
  });
}

export function listGroupChats(slug: string, q?: string) {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  return apiFetch<{ ok: true; chats: GroupChat[] }>(`/api/groups/${encodeURIComponent(slug)}/chats${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function createGroupChat(slug: string, payload: { name: string; description?: string }) {
  return apiFetch<{ ok: true; chat: GroupChat }>(`/api/groups/${encodeURIComponent(slug)}/chats`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listGroupMembers(slug: string) {
  return apiFetch<{ ok: true; members: GroupMember[]; memberCount: number }>(`/api/groups/${encodeURIComponent(slug)}/members`);
}

export function updateGroupMemberRole(slug: string, userId: string, role: "member" | "admin") {
  return apiFetch<{ ok: true }>(`/api/groups/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export function removeGroupMember(slug: string, userId: string) {
  return apiFetch<{ ok: true; removed: boolean }>(`/api/groups/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

export function listUserGroupReferrals(userId: string) {
  return apiFetch<{ ok: true; referrals: GroupReferral[] }>(`/api/users/${encodeURIComponent(userId)}/group-referrals`);
}

export function listUserIdeas(userId: string, params?: { ideaType?: string; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.ideaType) qs.set("ideaType", params.ideaType);
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<{ ok: true; ideas: Idea[] }>(`/api/users/${userId}/ideas${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function submitIdeaRecommendationFeedback(
  ideaId: string,
  reason: "not_interested" | "already_recommended"
) {
  return apiFetch<{ ok: true; feedback: { reason: "not_interested" | "already_recommended" } }>(
    `/api/ideas/${ideaId}/recommendation-feedback`,
    {
      method: "POST",
      body: JSON.stringify({ reason }),
    }
  );
}

export function clearIdeaRecommendationFeedback(ideaId: string) {
  return apiFetch<{ ok: true }>(`/api/ideas/${ideaId}/recommendation-feedback`, {
    method: "DELETE",
  });
}

export type WorkshopTheme = {
  backgroundType: "none" | "image" | "video" | "gradient";
  backgroundUrl?: string;
  accentColor?: string;
  textColor?: string;
  cardRadius?: number;
  cardOpacity?: number;
  customCss?: string;
  componentCss?: {
    card?: string;
    button?: string;
    title?: string;
  };
};

export type WorkshopLayoutItem = {
  id: string;
  kind: "nav" | "hero" | "stats" | "feed" | "sidebar" | "panel" | "footer";
  label: string;
  description?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
  visible: boolean;
};

export type WorkshopLayout = {
  version: number;
  canvas: {
    width: number;
    height: number;
  };
  pages: {
    home: {
      items: WorkshopLayoutItem[];
    };
  };
};

export type WorkshopUpdateLog = {
  _id?: string;
  title: string;
  summary?: string;
  authorName?: string;
  source?: "manual" | "ai" | "system";
  createdAt?: string;
};

export type WorkshopTemplateComment = {
  _id: string;
  templateId: string;
  content: string;
  author?: { _id: string; username: string; role: string };
  createdAt?: string;
  updatedAt?: string;
};

export type WorkshopHotTag = {
  tag: string;
  count: number;
};

export type WorkshopTemplate = {
  _id: string;
  title: string;
  summary: string;
  previewImageUrl?: string;
  tags?: string[];
  templateVersion?: string;
  currentDefaultVersion?: string;
  isCompatible?: boolean;
  isDefault?: boolean;
  shared: boolean;
  theme: WorkshopTheme;
  layout: WorkshopLayout;
  siteDraft?: SiteDraft;
  stats?: {
    viewCount?: number;
    likeCount?: number;
    bookmarkCount?: number;
    commentCount?: number;
  };
  appliedCount?: number;
  updateLogs?: WorkshopUpdateLog[];
  author?: { _id: string; username: string; role: string };
  createdAt?: string;
  updatedAt?: string;
  liked?: boolean;
  bookmarked?: boolean;
};

export type WorkshopDraft = {
  title: string;
  summary: string;
  tags: string[];
  theme: WorkshopTheme;
  layout: WorkshopLayout;
};

export function listWorkshopTemplates(params?: {
  sort?: "for_you" | "new" | "hot";
  q?: string;
  page?: number;
  limit?: number;
  recentTags?: string[];
}) {
  const qs = new URLSearchParams();
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.q) qs.set("q", params.q);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.recentTags && params.recentTags.length > 0) qs.set("recentTags", params.recentTags.join(","));

  return apiFetch<{ ok: true; templates: WorkshopTemplate[]; total: number; page: number; totalPages: number }>(
    `/api/workshop/templates${qs.toString() ? `?${qs.toString()}` : ""}`
  );
}

export function listMyWorkshopTemplates() {
  return apiFetch<{ ok: true; templates: WorkshopTemplate[] }>("/api/workshop/templates/mine");
}

export function getWorkshopTemplateDetail(id: string) {
  return apiFetch<{ ok: true; template: WorkshopTemplate }>(`/api/workshop/templates/${id}`);
}

export function createWorkshopTemplate(payload: {
  title: string;
  summary?: string;
  previewImageUrl?: string;
  tags?: string[] | string;
  shared?: boolean;
  theme?: WorkshopTheme;
  layout?: WorkshopLayout;
  siteDraft?: SiteDraft;
  changeSummary?: string;
}) {
  return apiFetch<{ ok: true; template: WorkshopTemplate }>("/api/workshop/templates", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWorkshopTemplate(id: string, payload: {
  title?: string;
  summary?: string;
  previewImageUrl?: string;
  tags?: string[] | string;
  shared?: boolean;
  theme?: WorkshopTheme;
  layout?: WorkshopLayout;
  siteDraft?: SiteDraft;
  changeSummary?: string;
  changeSource?: "manual" | "ai";
}) {
  return apiFetch<{ ok: true; template: WorkshopTemplate }>(`/api/workshop/templates/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function toggleWorkshopTemplateLike(id: string) {
  return apiFetch<{ ok: true; liked: boolean; likeCount: number }>(`/api/workshop/templates/${id}/like`, {
    method: "POST",
  });
}

export function toggleWorkshopTemplateBookmark(id: string) {
  return apiFetch<{ ok: true; bookmarked: boolean; bookmarkCount: number }>(`/api/workshop/templates/${id}/bookmark`, {
    method: "POST",
  });
}

export function applyWorkshopTemplate(id: string) {
  return apiFetch<{ ok: true; activeTemplate: WorkshopTemplate }>(`/api/workshop/templates/${id}/apply`, {
    method: "POST",
  });
}

export function getActiveWorkshopTemplate() {
  return apiFetch<{ ok: true; activeTemplate: WorkshopTemplate | null }>("/api/workshop/active-template");
}

export function previewWorkshopAiEdit(payload: {
  instruction: string;
  history?: { role: "user" | "assistant"; content: string }[];
  draft: WorkshopDraft;
}) {
  return apiFetch<{ ok: true; assistantMessage: string; draft: WorkshopDraft; model?: string }>("/api/workshop/ai/edit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type SiteEditAiOperations = {
  updateNodes?: Array<{
    nodeId: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    css?: string;
  }>;
  createWidgets?: Array<SiteDraftWidget>;
  removeWidgetIds?: string[];
  pageBackground?: {
    backgroundType?: "none" | "image" | "video" | "gradient";
    backgroundUrl?: string;
  };
};

export function previewWorkshopAiSiteEdit(payload: {
  instruction: string;
  pageKey: string;
  siteDraft: SiteDraft;
  history?: { role: "user" | "assistant"; content: string }[];
  nodeCatalog?: Array<{ nodeId: string; hint?: string }>;
}) {
  return apiFetch<{ ok: true; assistantMessage: string; operations: SiteEditAiOperations; model?: string }>("/api/workshop/ai/site-edit", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listWorkshopTemplateComments(id: string) {
  return apiFetch<{ ok: true; comments: WorkshopTemplateComment[] }>(`/api/workshop/templates/${id}/comments`);
}

export function createWorkshopTemplateComment(id: string, content: string) {
  return apiFetch<{ ok: true; comment: WorkshopTemplateComment }>(`/api/workshop/templates/${id}/comments`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
}

export function getWorkshopTagInsights(limit = 240) {
  return apiFetch<{ ok: true; templates: WorkshopTemplate[]; hotTags: WorkshopHotTag[] }>(`/api/workshop/tag-insights?limit=${limit}`);
}

// ===== 情景模拟（Scenario Simulation）=====
// 平台标识：'bilibili' | 'weibo' | 'tieba' | 'zhihu' | 'instagram' | 'generic'（未知一律 generic）

/** Scenario.comments 的子文档 / 前端共享评论类型 */
export type ScenarioComment = {
  /** scenario 内稳定 id */
  id: string;
  /** 账号名 */
  authorName: string;
  /** 头像 url，可空 */
  authorAvatar?: string;
  text: string;
  /** 该评论的赞数（展示用） */
  likeCount?: number;
  /** null/缺省=顶楼；否则=对某条评论的回复 */
  parentId?: string | null;
  /** 是否楼主 */
  isOP?: boolean;
  /** 该账号的观点/立场提示（供 AI 扮演），可空 */
  stance?: string;
};

/** 详情返回的完整情景 */
export type Scenario = {
  _id: string;
  author: { _id: string; username: string } | string;
  title: string;
  summary: string;
  coverImageUrl: string;
  platform: string;
  tags: string[];
  shared: boolean;
  sourceUrl?: string;
  /** 争论主题/背景 */
  topic?: string;
  comments: ScenarioComment[];
  stats: { viewCount: number; likeCount: number; bookmarkCount: number; playCount: number };
  /** 当前用户是否已赞 */
  liked?: boolean;
  /** 当前用户是否已收藏 */
  bookmarked?: boolean;
  isOwner?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** 列表用：去掉 comments 的 Scenario */
export type ScenarioCard = Omit<Scenario, "comments">;

/** play 端点返回的 AI 回复 */
export type ScenarioPlayReply = {
  id: string;
  authorName: string;
  authorAvatar?: string;
  text: string;
  parentId?: string | null;
  isAi: true;
};

/** create/update 请求体 */
export type ScenarioInput = {
  title: string;
  summary?: string;
  coverImageUrl?: string;
  platform?: string;
  tags?: string[] | string;
  shared?: boolean;
  sourceUrl?: string;
  topic?: string;
  comments?: ScenarioComment[];
};

type ScenarioListResponse = {
  ok: true;
  scenarios: ScenarioCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function listScenarios(params?: { sort?: string; q?: string; tag?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.q) qs.set("q", params.q);
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<ScenarioListResponse>(`/api/scenarios${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function listMyScenarios(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<ScenarioListResponse>(`/api/scenarios/mine${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function getScenario(id: string) {
  return apiFetch<{ ok: true; scenario: Scenario }>(`/api/scenarios/${id}`);
}

export function createScenario(body: ScenarioInput) {
  return apiFetch<{ ok: true; scenario: Scenario }>("/api/scenarios", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateScenario(id: string, body: Partial<ScenarioInput>) {
  return apiFetch<{ ok: true; scenario: Scenario }>(`/api/scenarios/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteScenario(id: string) {
  return apiFetch<{ ok: true }>(`/api/scenarios/${id}`, {
    method: "DELETE",
  });
}

export function toggleScenarioLike(id: string) {
  return apiFetch<{ ok: true; liked: boolean; likeCount: number }>(`/api/scenarios/${id}/like`, {
    method: "POST",
  });
}

export function toggleScenarioBookmark(id: string) {
  return apiFetch<{ ok: true; bookmarked: boolean; bookmarkCount: number }>(`/api/scenarios/${id}/bookmark`, {
    method: "POST",
  });
}

export type ScenarioPlayHistoryItem = {
  authorName: string;
  text: string;
  role: "seed" | "user" | "ai";
  parentId?: string | null;
};

export function playScenario(
  id: string,
  body: { history: ScenarioPlayHistoryItem[]; userMessage: { text: string; parentId?: string | null; id?: string } }
) {
  return apiFetch<{ ok: true; replies: ScenarioPlayReply[]; model?: string }>(`/api/scenarios/${id}/play`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function captureScenario(url: string) {
  return apiFetch<{
    ok: true;
    draft: { platform: string; title: string; coverImageUrl: string; comments: ScenarioComment[] };
  }>("/api/scenarios/capture", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function generateScenarioComments(body: { topic: string; platform?: string; intensity?: string; count?: number }) {
  return apiFetch<{ ok: true; comments: ScenarioComment[]; model?: string }>("/api/scenarios/generate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ===== 立场展开（Standpoint / Stance-Unfold）=====
// 受控/演示环境：账号“绑定”只登记 平台+handle，不存储真实凭证、不真正登录、不真正发帖；
// “发送”只在本系统内标记为已回复（模拟）。自动发送默认关闭。

/** 绑定账号（演示用，仅登记 平台+handle） */
export type StandpointAccount = {
  id: string;
  platform: string;
  handle: string;
  connected: boolean;
};

/** 代理配置：立场 + 人格 + 知识库 + 开关 */
export type StandpointConfig = {
  stance: "aggressive" | "peaceful" | "rational" | "sarcastic";
  personaText: string;
  personalInfo: string;
  autoSendEnabled: boolean;
  replyToMalicious: boolean;
  replyToQuestions: boolean;
};

/** 后台监控代理（每用户一个） */
export type StandpointAgent = {
  _id: string;
  status: "stopped" | "running" | "paused";
  accounts: StandpointAccount[];
  config: StandpointConfig;
  stats: { detected: number; drafted: number; sent: number };
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 一条来消息事件（私信/回复），含分类与生成的回复 */
export type StandpointEvent = {
  _id: string;
  kind: "dm" | "reply";
  platform: string;
  fromHandle: string;
  incomingText: string;
  classification: "malicious" | "question" | "request" | "other";
  reply: { text: string; style: string; model?: string; heuristic?: boolean } | null;
  status: "pending" | "drafted" | "sent" | "dismissed";
  autoSent: boolean;
  /** 原帖 / 私信链接（可空），供“去原帖”外链使用 */
  threadUrl?: string;
  createdAt: string;
};

export function getStandpoint() {
  return apiFetch<{ ok: true; agent: StandpointAgent }>("/api/standpoint");
}

export function updateStandpointConfig(body: Partial<StandpointConfig>) {
  return apiFetch<{ ok: true; agent: StandpointAgent }>("/api/standpoint/config", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function setStandpointStatus(status: "running" | "paused" | "stopped") {
  return apiFetch<{ ok: true; agent: StandpointAgent }>("/api/standpoint/status", {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

export function addStandpointAccount(body: { platform: string; handle: string }) {
  return apiFetch<{ ok: true; agent: StandpointAgent }>("/api/standpoint/accounts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function removeStandpointAccount(accountId: string) {
  return apiFetch<{ ok: true; agent: StandpointAgent }>(`/api/standpoint/accounts/${encodeURIComponent(accountId)}`, {
    method: "DELETE",
  });
}

export function listStandpointEvents(params?: { status?: string; page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<{
    ok: true;
    events: StandpointEvent[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }>(`/api/standpoint/events${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function simulateStandpointEvent(body: { kind: string; platform: string; fromHandle: string; incomingText: string }) {
  return apiFetch<{ ok: true; event: StandpointEvent }>("/api/standpoint/events/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * 真实到消息 → AI 即时草稿（人在环内）：
 * 无论 autoSendEnabled 与否，后端一律只出草稿（status='drafted'、autoSent=false），绝不自动发送。
 */
export function ingestStandpointEvent(body: {
  kind: string;
  platform: string;
  fromHandle: string;
  incomingText: string;
  threadUrl?: string;
}) {
  return apiFetch<{ ok: true; event: StandpointEvent }>("/api/standpoint/ingest", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function regenerateStandpointReply(eventId: string) {
  return apiFetch<{ ok: true; event: StandpointEvent }>(`/api/standpoint/events/${encodeURIComponent(eventId)}/regenerate`, {
    method: "POST",
  });
}

export function sendStandpointReply(eventId: string) {
  return apiFetch<{ ok: true; event: StandpointEvent }>(`/api/standpoint/events/${encodeURIComponent(eventId)}/send`, {
    method: "POST",
  });
}

export function dismissStandpointEvent(eventId: string) {
  return apiFetch<{ ok: true; event: StandpointEvent }>(`/api/standpoint/events/${encodeURIComponent(eventId)}/dismiss`, {
    method: "POST",
  });
}

// ===== 赏金猎人（Bounty Hunter）=====
// 赏金 = 平台虚拟点数（reward:number），不是真钱，不做任何真实支付/转账。
// 平台标识：'weibo' | 'bilibili' | 'tieba' | 'zhihu' | 'douyin' | 'xiaohongshu' | 'instagram' | 'other'。

/** 任务介绍页讨论评论区的一条评论（可带图） */
export type BountyComment = {
  _id: string;
  author: { _id: string; username: string } | string;
  text: string;
  imageUrl?: string;
  createdAt: string;
};

/** 猎人对某个悬赏的一次提交（发言文本 + 截图存证 + 审批状态） */
export type BountySubmission = {
  _id: string;
  bounty: string;
  hunter: { _id: string; username: string } | string;
  speechText: string;
  screenshotUrl?: string;
  note?: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

/** 详情返回的完整悬赏 */
export type Bounty = {
  _id: string;
  author: { _id: string; username: string } | string;
  title: string;
  description: string;
  reward: number;
  platform: string;
  targetUrl: string;
  tags: string[];
  slots: number;
  status: "open" | "closed" | "completed";
  deadline?: string | null;
  stats: { viewCount: number; submissionCount: number; commentCount: number };
  approvedCount: number;
  isOwner?: boolean;
  mySubmission?: BountySubmission | null;
  createdAt: string;
  updatedAt: string;
};

/** 列表用：去掉 description 的 Bounty */
export type BountyCard = Omit<Bounty, "description">;

/** create/update 请求体 */
export type BountyInput = {
  title: string;
  description: string;
  reward: number;
  platform: string;
  targetUrl: string;
  tags: string[] | string;
  slots: number;
  deadline?: string | null;
};

type BountyListResponse = {
  ok: true;
  bounties: BountyCard[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function listBounties(params?: {
  sort?: "new" | "hot";
  q?: string;
  tag?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.q) qs.set("q", params.q);
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.status) qs.set("status", params.status);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<BountyListResponse>(`/api/bounties${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function listMyBounties(params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<BountyListResponse>(`/api/bounties/mine${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function getBounty(id: string) {
  return apiFetch<{ ok: true; bounty: Bounty }>(`/api/bounties/${id}`);
}

export function createBounty(body: BountyInput) {
  return apiFetch<{ ok: true; bounty: Bounty }>("/api/bounties", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateBounty(id: string, body: Partial<BountyInput>) {
  return apiFetch<{ ok: true; bounty: Bounty }>(`/api/bounties/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteBounty(id: string) {
  return apiFetch<{ ok: true }>(`/api/bounties/${id}`, {
    method: "DELETE",
  });
}

export function setBountyStatus(id: string, status: "open" | "closed" | "completed") {
  return apiFetch<{ ok: true; bounty: Bounty }>(`/api/bounties/${id}/status`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

type BountySubmissionListResponse = {
  ok: true;
  submissions: BountySubmission[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function listBountySubmissions(id: string, params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<BountySubmissionListResponse>(
    `/api/bounties/${id}/submissions${qs.toString() ? `?${qs.toString()}` : ""}`
  );
}

export function submitBounty(id: string, body: { speechText: string; screenshotUrl?: string; note?: string }) {
  return apiFetch<{ ok: true; submission: BountySubmission }>(`/api/bounties/${id}/submissions`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function reviewBountySubmission(id: string, sid: string, status: "approved" | "rejected") {
  return apiFetch<{ ok: true; submission: BountySubmission }>(`/api/bounties/${id}/submissions/${sid}/review`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}

type BountyCommentListResponse = {
  ok: true;
  comments: BountyComment[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function listBountyComments(id: string, params?: { page?: number; limit?: number }) {
  const qs = new URLSearchParams();
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<BountyCommentListResponse>(
    `/api/bounties/${id}/comments${qs.toString() ? `?${qs.toString()}` : ""}`
  );
}

export function addBountyComment(id: string, body: { text: string; imageUrl?: string }) {
  return apiFetch<{ ok: true; comment: BountyComment }>(`/api/bounties/${id}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ===== 发言风格面板（Speaking Style Panel）=====
// 平台聚合当前用户自己的发言文本（情景模拟发言 + 赏金提交发言 + 评论区评论），
// 由 AI（或无 key 时的启发式）总结出一张“像 JOJO 替身那样”的能力面板：
// 固定 6 项能力（attack/venom/logic/armor/resilience/humor）+ 中二替身名 + 点评 + 口头禅。
// 数据仅用于生成个人风格分析；纯展示，不做任何真实发帖。

/** 单项能力：中文标签 + 0-100 数值 + 由数值派生的字母评级（S/A/B/C/D/E） */
export type StyleStat = {
  key: string;
  label: string;
  value: number;
  grade: string;
};

/** 一份发言风格档案（替身面板） */
export type SpeakingProfile = {
  standName: string;
  summary: string;
  catchphrases: string[];
  stats: StyleStat[];
  sampleCount: number;
  /** 插件记录的发言风格选择次数（styleKey -> 次数），4c 纳入画像 */
  styleTally?: Record<string, number>;
  model?: string;
  heuristic?: boolean;
  generatedAt: string;
  user?: string;
};

/** 当前用户的发言风格档案（未生成过则 profile 为 null） */
export function getMyStyleProfile() {
  return apiFetch<{ ok: true; profile: SpeakingProfile | null }>("/api/speaking-style");
}

/** 聚合当前用户发言 → 生成/更新风格档案（可叠加插件记录的风格选择次数 styleTally） */
export function generateStyleProfile(styleTally?: Record<string, number>) {
  return apiFetch<{ ok: true; profile: SpeakingProfile; sampleCount: number }>(
    "/api/speaking-style/generate",
    {
      method: "POST",
      body: JSON.stringify(styleTally ? { styleTally } : {}),
    }
  );
}

/** 公开查看某用户的风格档案（供后续人格分享），未生成过则 profile 为 null */
export function getUserStyleProfile(userId: string) {
  return apiFetch<{ ok: true; profile: SpeakingProfile | null }>(
    `/api/speaking-style/user/${encodeURIComponent(userId)}`
  );
}

// ===== 人格下载（Persona）=====
// 用户把自己的发言风格（来自阶段5 SpeakingProfile）发布为可分享的「人格」，
// 其他用户可浏览/下载收藏/点赞/装备。装备后（本人风格 或 某下载的人格）驱动浏览器插件
// 在其它平台生成三条方案。人格的 style.stats 复用阶段5 的 StyleStat（{key,label,value,grade}）。

/** 人格的发言风格（复用阶段5 StyleStat；stanceHint 为立场/倾向提示） */
export type PersonaStyle = {
  summary: string;
  catchphrases: string[];
  stats: StyleStat[];
  stanceHint?: string;
};

/** 一个可分享/下载/装备的发言人格 */
export type Persona = {
  _id: string;
  author: { _id: string; username: string } | string;
  name: string;
  description: string;
  standName: string;
  coverEmoji: string;
  tags: string[];
  style: PersonaStyle;
  /** 后端从 name+style 计算的一段文本，供插件当作 personaText 用（截断到 ~600 字） */
  styleDescriptor: string;
  shared: boolean;
  stats: { viewCount: number; downloadCount: number; likeCount: number };
  installed?: boolean;
  liked?: boolean;
  equipped?: boolean;
  isOwner?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** create/update 请求体 */
export type PersonaInput = {
  name: string;
  description: string;
  standName: string;
  coverEmoji: string;
  tags: string[] | string;
  style: PersonaStyle;
  shared: boolean;
};

type PersonaListResponse = {
  ok: true;
  personas: Persona[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function listPersonas(params?: {
  sort?: "new" | "hot";
  q?: string;
  tag?: string;
  scope?: "all" | "installed" | "mine";
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.q) qs.set("q", params.q);
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<PersonaListResponse>(`/api/personas${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function getPersona(id: string) {
  return apiFetch<{ ok: true; persona: Persona }>(`/api/personas/${id}`);
}

export function createPersona(body: PersonaInput) {
  return apiFetch<{ ok: true; persona: Persona }>("/api/personas", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updatePersona(id: string, body: Partial<PersonaInput>) {
  return apiFetch<{ ok: true; persona: Persona }>(`/api/personas/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deletePersona(id: string) {
  return apiFetch<{ ok: true }>(`/api/personas/${id}`, {
    method: "DELETE",
  });
}

export function installPersona(id: string) {
  return apiFetch<{ ok: true; installed: true; downloadCount: number }>(`/api/personas/${id}/install`, {
    method: "POST",
  });
}

export function uninstallPersona(id: string) {
  return apiFetch<{ ok: true; installed: false; downloadCount: number }>(`/api/personas/${id}/install`, {
    method: "DELETE",
  });
}

export function togglePersonaLike(id: string) {
  return apiFetch<{ ok: true; liked: boolean; likeCount: number }>(`/api/personas/${id}/like`, {
    method: "POST",
  });
}

export function getEquippedPersona() {
  return apiFetch<{ ok: true; equipped: Persona | null }>("/api/personas/equipped");
}

export function equipPersona(personaId: string | null) {
  return apiFetch<{ ok: true; equipped: Persona | null }>("/api/personas/equip", {
    method: "POST",
    body: JSON.stringify({ personaId }),
  });
}

// ===== 表情 / 梗图库（Meme Library）=====
// 用户在不同平台收藏表情/梗图，评论输入框旁的表情按钮打开面板搜索并插入；
// 配套「公开素材库」(shared) 与「创意工坊」(用户上传贡献)。
// type='image' 用 imageUrl；type='text' 用 text（梗/短语）。title 必填，tags 可空。

/** 一条表情/梗图素材 */
export type Meme = {
  _id: string;
  author: { _id: string; username: string } | string | null;
  type: "image" | "text";
  imageUrl: string;
  text: string;
  title: string;
  tags: string[];
  shared: boolean;
  stats: { collectCount: number; useCount: number };
  /** 当前用户是否已收藏 */
  collected?: boolean;
  isOwner?: boolean;
  createdAt: string;
  updatedAt: string;
};

/** create/update 请求体 */
export type MemeInput = {
  type: "image" | "text";
  imageUrl?: string;
  text?: string;
  title: string;
  tags: string[] | string;
  shared: boolean;
};

type MemeListResponse = {
  ok: true;
  memes: Meme[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export function listMemes(params?: {
  scope?: "library" | "mine";
  q?: string;
  tag?: string;
  sort?: "new" | "hot";
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params?.scope) qs.set("scope", params.scope);
  if (params?.q) qs.set("q", params.q);
  if (params?.tag) qs.set("tag", params.tag);
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  return apiFetch<MemeListResponse>(`/api/memes${qs.toString() ? `?${qs.toString()}` : ""}`);
}

export function getMeme(id: string) {
  return apiFetch<{ ok: true; meme: Meme }>(`/api/memes/${id}`);
}

export function createMeme(body: MemeInput) {
  return apiFetch<{ ok: true; meme: Meme }>("/api/memes", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateMeme(id: string, body: Partial<MemeInput>) {
  return apiFetch<{ ok: true; meme: Meme }>(`/api/memes/${id}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteMeme(id: string) {
  return apiFetch<{ ok: true }>(`/api/memes/${id}`, {
    method: "DELETE",
  });
}

export function collectMeme(id: string) {
  return apiFetch<{ ok: true; collected: true; collectCount: number }>(`/api/memes/${id}/collect`, {
    method: "POST",
  });
}

export function uncollectMeme(id: string) {
  return apiFetch<{ ok: true; collected: false; collectCount: number }>(`/api/memes/${id}/collect`, {
    method: "DELETE",
  });
}

export function useMeme(id: string) {
  return apiFetch<{ ok: true; useCount: number }>(`/api/memes/${id}/use`, {
    method: "POST",
  });
}


