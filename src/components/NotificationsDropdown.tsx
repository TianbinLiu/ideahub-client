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
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listNotifications, listMessageRequests } from "../api";

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
  const [unreadByType, setUnreadByType] = useState<{ system: number; mentions: number; reactions: number; likes: number; dislikes: number; replies: number; messages: number }>({ system: 0, mentions: 0, reactions: 0, likes: 0, dislikes: 0, replies: 0, messages: 0 });
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

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
        // Load notifications
        const res = await listNotifications({ unread: 1, limit: 100 });
        const items = res.items || [];
        
        const mentionTypes = ["MENTION"];
        const likeTypes = ["LIKE", "LIKE_COMMENT", "LIKE_POST"];
        const dislikeTypes = ["DISLIKE_COMMENT"];
        
        // 区分 system 和 replies：
        // - system: 顶级评论（COMMENT 且无 parentCommentId）+ BOOKMARK + INTEREST + INVITE
        // - replies: 回复（COMMENT 且有 parentCommentId）
        const systemCount = items.filter(n => 
          ["BOOKMARK", "INTEREST", "INVITE"].includes(n.type) ||
          (n.type === "COMMENT" && !n.payload?.parentCommentId)
        ).length;
        
        const repliesCount = items.filter(n => 
          n.type === "COMMENT" && n.payload?.parentCommentId
        ).length;
        
        const mentionsCount = items.filter(n => mentionTypes.includes(n.type)).length;
        const likesCount = items.filter(n => likeTypes.includes(n.type)).length;
        const dislikesCount = items.filter(n => dislikeTypes.includes(n.type)).length;
        const reactionsCount = likesCount + dislikesCount;
        
        // Load unread message requests
        const msgRes = await listMessageRequests("pending");
        const messageRequests = [...(msgRes.receivedRequests || []), ...(msgRes.sentRequests || [])];
        const unreadMessageCount = messageRequests.filter((r: any) => !r.viewedAt).length;
        
        setUnreadByType({
          system: systemCount,
          mentions: mentionsCount,
          reactions: reactionsCount,
          likes: likesCount,
          dislikes: dislikesCount,
          replies: repliesCount,
          messages: unreadMessageCount,
        });
      } catch (e) {
        console.error("Failed to load unread by type", e);
      }
    }

    // Load immediately on mount and when dropdown opens
    if (isOpen) {
      loadUnreadByType();
    }

    // Also listen for notifications updates
    window.addEventListener('notificationsUpdated', loadUnreadByType);
    
    return () => window.removeEventListener('notificationsUpdated', loadUnreadByType);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !triggerRef.current) {
      return;
    }

    function updateMenuPosition() {
      if (!triggerRef.current) return;

      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = 224;
      let left = rect.left;
      const top = rect.bottom + 8;

      if (left + menuWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - menuWidth - 16);
      }

      setMenuPosition({ top, left });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
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
      key: "replies",
      label: t("notifications.tabReplies"),
      path: "/notifications?tab=replies",
      unread: unreadByType.replies,
    },
    {
      key: "reactions",
      label: t("notifications.likesDislikesOverview"),
      path: "/notifications?tab=reactions",
      unread: unreadByType.reactions,
    },
    {
      key: "likes",
      label: t("notifications.likesReceived"),
      path: "/notifications?tab=likes",
      unread: unreadByType.likes,
    },
    {
      key: "dislikes",
      label: t("notifications.dislikesReceived"),
      path: "/notifications?tab=dislikes",
      unread: unreadByType.dislikes,
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
      ref={triggerRef}
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

      {isOpen && menuPosition && createPortal(
        <div
          onMouseEnter={handleMenuEnter}
          onMouseLeave={handleMenuLeave}
          className="fixed z-[100000] w-56 rounded-xl border border-gray-700 bg-gray-900 py-2 shadow-2xl"
          style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}
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
        </div>,
        document.body
      )}
    </div>
  );
}
