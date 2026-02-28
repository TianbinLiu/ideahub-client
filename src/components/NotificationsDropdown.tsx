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
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const menuItems: NotificationMenuItem[] = [
    {
      key: "messages",
      label: t("notifications.myMessages"),
      path: "/messages",
      unread: 0, // TODO: 实际未读消息数
    },
    {
      key: "system",
      label: t("notifications.system"),
      path: "/notifications?tab=system",
    },
    {
      key: "mentions",
      label: t("notifications.mentions"),
      path: "/notifications?tab=mentions",
    },
    {
      key: "likes",
      label: t("notifications.likesReceived"),
      path: "/notifications?tab=likes",
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
