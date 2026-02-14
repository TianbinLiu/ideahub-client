export function safeNext(next: string | null) {
  if (!next) return "/";

  if (!next.startsWith("/")) return "/";
  if (next.startsWith("//")) return "/";

  // 阻止回跳到 auth 页面（避免 /register -> /login -> /register 循环）
  if (next.startsWith("/login")) return "/";
  if (next.startsWith("/register")) return "/";

  return next;
}
