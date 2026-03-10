/**
 * @file Navbar.tsx - 全局导航栏组件
 * @category Component
 * @i18n yes
 * 
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建组件必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 * 
 * 职责:
 * - 显示全局导航链接（Home, Tag Rank, Notifications等）
 * - 集成语言切换器（中英文）
 * - 显示未读通知徽章
 * - 用户登录状态显示
 * - 登录/注册/登出按钮
 * - 移动端响应式菜单
 * 
 * 依赖文件:
 * @uses ../authContext.tsx - 获取用户状态和登出方法
 * @uses ../api.ts - 获取未读通知数 (getUnreadCount)
 * @uses ./UserHoverCard.tsx - 用户悬浮卡片
 * @uses ./LanguageSwitcher.tsx - 语言切换组件
 * 
 * 被使用于:
 * @used_in App.tsx - 所有页面的头部
 * 
 * 可复用性: 高 - 全局导航组件，独立自成
 * 
 * 必备功能检查:
 * ✅ TypeScript类型定义
 * ✅ 国际化支持 (useTranslation)
 * ✅ 无业务逻辑耦合
 * ✅ 响应式设计
 */

import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../authContext";
import { useEffect, useState } from "react";
import { getUnreadCount } from "../api";
import { UserHoverCard } from "./UserHoverCard";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";
import NotificationsDropdown from "./NotificationsDropdown";


function cls(isActive: boolean) {
  return isActive ? "text-white" : "text-gray-300 hover:text-white";
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [unread, setUnread] = useState(0);
  const loc = useLocation();

  const next = `${loc.pathname}${loc.search || ""}`;
  const loginTo = `/login?next=${encodeURIComponent(next)}`;
  const registerTo = `/register?next=${encodeURIComponent(next)}`;
  
  const userId = (user as any)?._id || (user as any)?.id;

  useEffect(() => {
    let timer: any;

    async function load() {
      if (!user) {
        setUnread(0);
        return;
      }
      try {
        const r = await getUnreadCount();
        setUnread(r.count || 0);
      } catch {
        // ignore
      }
    }

    load();
    // 简单轮询（MVP）：每 20s 更新一次
    if (user) timer = setInterval(load, 20000);

    // 监听通知更新事件
    function handleNotificationsUpdate() {
      load();
    }
    window.addEventListener('notificationsUpdated', handleNotificationsUpdate);

    return () => {
      timer && clearInterval(timer);
      window.removeEventListener('notificationsUpdated', handleNotificationsUpdate);
    };
  }, [user]);

  return (
    <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl text-white">IdeaHub</Link>

        <div className="flex items-center gap-4 text-sm">
          <NavLink to="/" className={({ isActive }) => cls(isActive)}>{t('nav.home')}</NavLink>
          <NavLink to="/tag-rank" className={({ isActive }) => cls(isActive)}>{t('nav.tagRank')}</NavLink>

          {user && <NotificationsDropdown unreadCount={unread} />}

          {user?.role === "company" && (
            <NavLink to="/company" className={({ isActive }) => cls(isActive)}>{t('nav.company')}</NavLink>
          )}

          {user?.role === "admin" && (
            <>
              <NavLink to="/admin/users" className={({ isActive }) => cls(isActive)}>
                {t('nav.admin')}
              </NavLink>
              <NavLink to="/feedback" className={({ isActive }) => cls(isActive)}>
                {t('nav.feedback')}
              </NavLink>
              <NavLink to="/admin/docs" className={({ isActive }) => cls(isActive)}>
                {t('nav.docs')}
              </NavLink>
              <NavLink to="/admin/scraper" className={({ isActive }) => cls(isActive)}>
                {t('nav.scraper')}
              </NavLink>
            </>
          )}

          <LanguageSwitcher />

          {!user ? (
            <>
              <NavLink to={loginTo} className={({ isActive }) => cls(isActive)}>{t('nav.login')}</NavLink>
              <NavLink to={registerTo} className={({ isActive }) => cls(isActive)}>{t('nav.register')}</NavLink>
            </>
          ) : (
            <div className="flex items-center gap-3">
              {userId && (
                <UserHoverCard userId={userId} username={user.username}>
                  <Link to={`/users/${userId}`} className="text-gray-300 hover:text-white">
                    {user.username}
                  </Link>
                </UserHoverCard>
              )}
              <button
                onClick={logout}
                className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900"
              >
                {t('nav.logout')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
