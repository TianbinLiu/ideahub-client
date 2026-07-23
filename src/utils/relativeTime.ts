/**
 * @file relativeTime.ts - B 站式相对时间（跟随 i18n 当前语言，zh/en 双语——评审实锤）：
 * <1 小时 → 「X分钟前 / Xm ago」；<24 小时 → 「X小时前 / Xh ago」；
 * 昨天 → 「昨天 HH:mm / Yesterday HH:mm」；同年更早 → 「MM-DD」；跨年 → 「YYYY-MM-DD」。
 * 需求口径（动态 dropdown）：24 小时内只显示「多少小时前」，超过只显示日期。
 */
import i18n from "../i18n";

function isZh() {
  return (i18n.language || "zh").toLowerCase().startsWith("zh");
}

export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const time = date.getTime();
  if (Number.isNaN(time)) return "";

  const zh = isZh();
  const now = Date.now();
  const diffMs = Math.max(0, now - time);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return zh ? "刚刚" : "just now";
  if (diffMinutes < 60) return zh ? `${diffMinutes}分钟前` : `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return zh ? `${diffHours}小时前` : `${diffHours}h ago`;

  const pad = (n: number) => String(n).padStart(2, "0");
  const nowDate = new Date(now);
  const yesterday = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (isYesterday) {
    const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return zh ? `昨天 ${hm}` : `Yesterday ${hm}`;
  }

  if (date.getFullYear() === nowDate.getFullYear()) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
