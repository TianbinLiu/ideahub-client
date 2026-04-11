const KEY = "ideahub_token";
export const AUTH_EXPIRED_EVENT = "ideahub:auth-expired";

export function getToken() {
  return localStorage.getItem(KEY) || "";
}
export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}
export function clearToken() {
  localStorage.removeItem(KEY);
}

export function notifyAuthExpired(reason: string = "UNAUTHORIZED") {
  clearToken();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT, { detail: { reason } }));
  }
}
