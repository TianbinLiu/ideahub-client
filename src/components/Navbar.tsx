//Navbar.tsx

import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../authContext";
import { useEffect, useState } from "react";
import { getUnreadCount } from "../api";
import { UserHoverCard } from "./UserHoverCard";
import { useTranslation } from "react-i18next";
import LanguageSwitcher from "./LanguageSwitcher";


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

    return () => timer && clearInterval(timer);
  }, [user]);

  return (
    <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl text-white">IdeaHub</Link>

        <div className="flex items-center gap-4 text-sm">
          <NavLink to="/" className={({ isActive }) => cls(isActive)}>{t('nav.home')}</NavLink>
          <NavLink to="/tag-rank" className={({ isActive }) => cls(isActive)}>{t('nav.tagRank')}</NavLink>

          {user && (
            <NavLink to="/notifications" className={({ isActive }) => cls(isActive)}>
              <span className="relative inline-flex items-center">
                {t('nav.notifications')}
                {unread > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] min-w-5 h-5 px-1">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </span>
            </NavLink>
          )}

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
