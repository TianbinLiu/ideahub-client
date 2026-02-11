const KEY = "ideahub_token";

export function getToken() {
  return localStorage.getItem(KEY) || "";
}
export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}
export function clearToken() {
  localStorage.removeItem(KEY);
}
