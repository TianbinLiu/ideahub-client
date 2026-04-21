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

// Ideas API - Type definitions
export type ExternalSource = {
  platform?: string;      // e.g. "贴吧", "Facebook", "Twitter"
  url?: string;            // link to original post
  originalAuthor?: string; // author name from original platform
  sourceCreatedAt?: string; // when original post was created (ISO date string)
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
  memberCount?: number | null;
  joined?: boolean;
  isWorld?: boolean;
  createdAt?: string;
  creator?: string | { _id: string; username?: string } | null;
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

export function listGroups() {
  return apiFetch<{ ok: true; groups: Group[]; joinedGroupSlugs: string[] }>("/api/groups");
}

export function createGroup(payload: { name: string; slug?: string; description?: string }) {
  return apiFetch<{ ok: true; group: Group }>("/api/groups", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function joinGroup(slug: string) {
  return apiFetch<{ ok: true; joined: boolean; slug: string }>(`/api/groups/${encodeURIComponent(slug)}/join`, {
    method: "POST",
  });
}

export function leaveGroup(slug: string) {
  return apiFetch<{ ok: true; joined: boolean; slug: string }>(`/api/groups/${encodeURIComponent(slug)}/leave`, {
    method: "POST",
  });
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


