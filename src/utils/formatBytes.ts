/**
 * @file formatBytes.ts - 字节数 → "1.2 MB" 这类人读的体积
 * @category Utility
 *
 * 模型市场（压缩包 ≤25MB，贴图动辄几 MB）和上传表单都要显示体积。用 1024 进制：
 * 用户对照的是资源管理器里的数字，那边也是 1024。
 */

export function formatBytes(bytes: number): string {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
