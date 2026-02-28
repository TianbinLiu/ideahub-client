/**
 * @file NotificationsDropdown.tsx - 通知下拉菜单组件
 * @category Component
 * @i18n yes
 * 
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建组件必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 * 
 * 职责:
 * - 在Navbar的Notifications上悬浮时显示下拉菜单
 * - 提供4个选项：我的消息、系统消息、@我的、收到的赞
 * - 显示未读数量徽章
 * - 响应式关闭（鼠标离开时自动关闭）
 * 
 * 依赖文件:
 * @uses react-router-dom - 路由导航
 * @uses react-i18next - 国际化
 * 
 * 被使用于:
 * @used_in ./Navbar.tsx - 通知链接的下拉菜单
 * 
 * 可复用性: 中 - 专用于通知导航
 * 
 * 必备功能检查:
 * ✅ TypeScript类型定义
 * ✅ 国际化支持 (useTranslation)
 * ✅ 无业务逻辑耦合
 * ✅ 响应式设计
 */

import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listNotifications } from "../api";

type NotificationsDropdownProps = {
  unreadCount: number;
};

type NotificationMenuItem = {
  key: string;
  label: string;
  path: string;
  unread?: number;
};

export default function NotificationsDropdown({ unreadCount }: NotificationsDropdownProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadByType, setUnreadByType] = useState<{ system: number; mentions: number; likes: number; messages: number }>({ system: 0, mentions: 0, likes: 0, messages: 0 });
  const timeoutRef = useRef<number | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Load unread count by type when dropdown opens, and listen for updates
  useEffect(() => {
    async function loadUnreadByType() {
      try {
        const res = await listNotifications({ unread: 1, limit: 100 });
        const items = res.items || [];
        
        const systemTypes = ["COMMENT", "BOOKMARK", "INTEREST", "INVITE"];
        const mentionTypes = ["MENTION"];
        const likeTypes = ["LIKE", "LIKE_COMMENT", "LIKE_POST"];
        
        const systemCount = items.filter(n => systemTypes.includes(n.type)).length;
        const mentionsCount = items.filter(n => mentionTypes.includes(n.type)).length;
        const likesCount = items.filter(n => likeTypes.includes(n.type)).length;
        
        setUnreadByType({
          system: systemCount,
          mentions: mentionsCount,
          likes: likesCount,
          messages: 0, // TODO: Get unread message requests count
        });
      } catch (e) {
        console.error("Failed to load unread by type", e);
      }
    }

    // Always listen for notifications updates
    window.addEventListener('notificationsUpdated', loadUnreadByType);
    
    // Load counts when dropdown opens
    if (isOpen) {
      loadUnreadByType();
    }

    return () => window.removeEventListener('notificationsUpdated', loadUnreadByType);
  }, [isOpen]);

  const menuItems: NotificationMenuItem[] = [
    {
      key: "messages",
      label: t("notifications.myMessages"),
      path: "/message-requests",
      unread: unreadByType.messages,
    },
    {
      key: "system",
      label: t("notifications.system"),
      path: "/notifications?tab=system",
      unread: unreadByType.system,
    },
    {
      key: "mentions",
      label: t("notifications.mentions"),
      path: "/notifications?tab=mentions",
      unread: unreadByType.mentions,
    },
    {
      key: "likes",
      label: t("notifications.likesReceived"),
      path: "/notifications?tab=likes",
      unread: unreadByType.likes,
    },
  ];

  function handleMouseEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(true);
    }, 300);
  }

  function handleMouseLeave() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }

  function handleMenuEnter() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }

  function handleMenuLeave() {
    timeoutRef.current = window.setTimeout(() => {
      setIsOpen(false);
    }, 300);
  }

  const isActive = location.pathname === "/notifications" || location.pathname === "/messages";

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <Link
        to="/notifications"
        className={`relative inline-flex items-center ${
          isActive ? "text-white" : "text-gray-300 hover:text-white"
        }`}
      >
        {t("nav.notifications")}
        {unreadCount > 0 && (
          <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] min-w-5 h-5 px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Link>

      {isOpen && (
        <div
          onMouseEnter={handleMenuEnter}
          onMouseLeave={handleMenuLeave}
          className="absolute left-0 top-full mt-2 z-50 w-56 rounded-xl border border-gray-700 bg-gray-900 py-2 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {menuItems.map((item) => (
            <Link
              key={item.key}
              to={item.path}
              className="block px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <div className="flex items-center justify-between">
                <span>{item.label}</span>
                {item.unread !== undefined && item.unread > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] min-w-4 h-4 px-1">
                    {item.unread > 99 ? "99+" : item.unread}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
