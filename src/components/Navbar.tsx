//Navbar.tsx

import { Link, NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../authContext";
import { useEffect, useState } from "react";
import { getUnreadCount } from "../api";


function cls(isActive: boolean) {
  return isActive ? "text-white" : "text-gray-300 hover:text-white";
}

export default function Navbar() {
  const { user, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  const loc = useLocation();

  const next = `${loc.pathname}${loc.search || ""}`;
  const loginTo = `/login?next=${encodeURIComponent(next)}`;
  const registerTo = `/register?next=${encodeURIComponent(next)}`;

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
          <NavLink to="/" className={({ isActive }) => cls(isActive)}>Home</NavLink>
          <NavLink to="/ideas/new" className={({ isActive }) => cls(isActive)}>New</NavLink>
          <NavLink to="/me" className={({ isActive }) => cls(isActive)}>Me</NavLink>

          {user && (
            <NavLink to="/notifications" className={({ isActive }) => cls(isActive)}>
              <span className="relative inline-flex items-center">
                Notifications
                {unread > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] min-w-5 h-5 px-1">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
              </span>
            </NavLink>
          )}

          {user?.role === "company" && (
            <NavLink to="/company" className={({ isActive }) => cls(isActive)}>Company</NavLink>
          )}

          {user?.role === "admin" && (
            <NavLink to="/admin/users" className={({ isActive }) => cls(isActive)}>
              Admin
            </NavLink>
          )}


          {!user ? (
            <>
              <NavLink to={loginTo} className={({ isActive }) => cls(isActive)}>Login</NavLink>
              <NavLink to={registerTo} className={({ isActive }) => cls(isActive)}>Register</NavLink>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-gray-300">{user.username}</span>
              <button
                onClick={logout}
                className="rounded-lg border border-gray-700 px-3 py-1.5 hover:bg-gray-900"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
