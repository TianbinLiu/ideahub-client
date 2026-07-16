/**
 * @file useUnreadCount.ts - 未读通知数（导航栏铃铛徽章）
 * @category Hook
 * @i18n none
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 的 hooks 章节
 *
 * 职责:
 * - 拉取未读通知数，登录时每 20s 轮询一次（MVP 口径，与原 Navbar 内联实现一致）
 * - 监听 window 的 'notificationsUpdated' 事件即时刷新
 * - 未登录 → 恒为 0 且不轮询
 *
 * 说明:
 * - 从 Navbar.tsx 原样抽出，供 Navbar 与 ArenaNavbar 复用（两套导航栏都要铃铛徽章）。
 *   行为与抽出前完全一致，仅去重，不改语义。
 *
 * 依赖文件:
 * @uses ../api.ts - getUnreadCount
 * @uses ../authContext.tsx - 登录态
 *
 * 被使用于:
 * @used_in ../components/Navbar.tsx
 * @used_in ../components/ArenaNavbar.tsx
 */

import { useEffect, useState } from "react";
import { getUnreadCount } from "../api";
import { useAuth } from "../authContext";

export function useUnreadCount(): number {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;

    async function load() {
      if (!user) {
        setUnread(0);
        return;
      }
      try {
        const r = await getUnreadCount();
        setUnread(r.count || 0);
      } catch (e) {
        // 徽章拿不到就维持旧值：这点小事不该打扰用户，但别静默到查不出来
        if (import.meta.env.DEV) console.warn("[useUnreadCount] 获取未读数失败：", e);
      }
    }

    void load();
    // 简单轮询（MVP）：每 20s 更新一次
    if (user) timer = setInterval(() => void load(), 20000);

    function handleNotificationsUpdate() {
      void load();
    }
    window.addEventListener("notificationsUpdated", handleNotificationsUpdate);

    return () => {
      if (timer) clearInterval(timer);
      window.removeEventListener("notificationsUpdated", handleNotificationsUpdate);
    };
  }, [user]);

  return unread;
}

export default useUnreadCount;
