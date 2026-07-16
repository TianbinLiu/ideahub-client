/**
 * @file ArenaNavbar.tsx - 卢本伟广场专属导航栏（需求 8c）
 * @category Component
 * @i18n yes（全部复用 Navbar 已有的 nav.* 键，不新增键；品牌位用 nav.arena）
 *
 * 📖 [AI] 修改前必读: /.ai-instructions.md #新建组件必备功能清单
 * 🔄 [AI] 修改后必须: 同步更新 PROJECT_STRUCTURE.md 组件列表
 *
 * 职责:
 * - 只在 /arena/* 下渲染（由 ArenaLayout 挂载），格式与 homepage 的 Navbar 类似，但按需求三点不同：
 *   ① 【没有搜索栏】——广场里没有全站搜索这回事，留个搜不到东西的框只会误导
 *   ② 【炸弹与 home 位置调转】：homepage 是 [home][炸弹]，这里是 [炸弹][home]
 *      （当前所在的区域排在前面，home 退化成“回主站”的出口）
 *   ③ 用户小菜单与 homepage 不同：我的主页 /arena/profile、插件设置 /arena/extension、退出登录
 *      （homepage 的退出是独立图标按钮，这里收进菜单）
 * - 保留通知铃铛（与 homepage 同一套未读数逻辑，见 useUnreadCount）
 *
 * 依赖文件:
 * @uses ../authContext.tsx - 用户状态与 logout
 * @uses ../hooks/useUnreadCount.ts - 铃铛未读数（与 Navbar 共用，避免两份轮询逻辑各自漂移）
 * @uses ./NotificationsDropdown.tsx - 通知铃铛
 * @uses ./UserHoverCard.tsx - 头像悬浮卡片
 * @uses ./AuthDialog.tsx - 未登录时的登录/注册
 *
 * 被使用于:
 * @used_in ./ArenaLayout.tsx - /arena/* 的 layout route
 *
 * 必备功能检查:
 * ✅ TypeScript类型定义
 * ✅ 国际化支持 (useTranslation)
 * ✅ 响应式设计
 * ✅ 可访问性（菜单 aria-haspopup/aria-expanded/role=menu，点外部与 Esc 关闭）
 */

import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Bomb,
  ChevronDown,
  CircleUserRound,
  Home,
  LogOut,
  Puzzle,
  UserRoundCog,
} from "lucide-react";
import { useAuth } from "../authContext";
import { useUnreadCount } from "../hooks/useUnreadCount";
import NotificationsDropdown from "./NotificationsDropdown";
import { UserHoverCard } from "./UserHoverCard";
import AuthDialog from "./AuthDialog";

function cls(isActive: boolean) {
  return isActive ? "text-white" : "text-gray-300 hover:text-white";
}

const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900";
const menuItem =
  "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-900 hover:text-white";

export default function ArenaNavbar() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const unread = useUnreadCount();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);
  const loc = useLocation();

  const userId = user?._id;
  const next = `${loc.pathname}${loc.search || ""}`;

  // 换路由就关菜单（与 Navbar 同口径）。菜单项自身的 onClick 已经会关，这里兜的是
  // 浏览器前进/后退等非点击导航——否则菜单会挂在新页面上不走。
  // 用渲染期比对而不是 useEffect：状态只跟着 loc.key 走，不需要为它多跑一轮 effect。
  const [menuLocKey, setMenuLocKey] = useState(loc.key);
  if (menuLocKey !== loc.key) {
    setMenuLocKey(loc.key);
    setMenuOpen(false);
  }

  // 点外部关闭 + Esc 关闭（关时把焦点还给触发按钮）
  useEffect(() => {
    if (!menuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <div className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950/88 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/arena" className="font-bold text-xl text-white">
            {t("nav.arena")}
          </Link>
          {/* ★需求 8c：炸弹在前、home 在后（与 homepage 相反） */}
          <NavLink
            to="/arena"
            end
            title={t("nav.arena")}
            aria-label={t("nav.arena")}
            className={({ isActive }) => `${cls(isActive)} ${iconBtn}`}
          >
            <Bomb className="h-5 w-5" />
          </NavLink>
          <NavLink
            to="/"
            title={t("nav.home")}
            aria-label={t("nav.home")}
            className={({ isActive }) => `${cls(isActive)} ${iconBtn}`}
          >
            <Home className="h-5 w-5" />
          </NavLink>
        </div>

        {/* ★需求 8c：这里【没有搜索栏】 */}

        <div className="flex items-center gap-2 text-sm">
          {user && <NotificationsDropdown unreadCount={unread} />}

          {!user ? (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 text-black shadow-lg shadow-cyan-950/30 hover:bg-cyan-300"
              aria-label={t("nav.login")}
              title={t("nav.login")}
            >
              <CircleUserRound className="h-6 w-6" />
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {userId && (
                <UserHoverCard userId={userId} username={user.username}>
                  <Link
                    to={`/users/${userId}`}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-sm font-bold text-cyan-100 hover:border-cyan-600"
                  >
                    {user.username?.[0]?.toUpperCase() || "U"}
                  </Link>
                </UserHoverCard>
              )}
              <div className="relative" ref={menuRef}>
                <button
                  ref={menuButtonRef}
                  type="button"
                  onClick={() => setMenuOpen((prev) => !prev)}
                  title={t("nav.userMenu")}
                  aria-label={t("nav.userMenu")}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-controls="arena-navbar-user-menu"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 hover:bg-gray-900"
                >
                  <ChevronDown className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`} />
                </button>
                {menuOpen ? (
                  <div
                    id="arena-navbar-user-menu"
                    role="menu"
                    aria-label={t("nav.userMenu")}
                    className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-2xl border border-gray-800 bg-gray-950 p-1.5 shadow-2xl"
                  >
                    <Link
                      to="/arena/profile"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={menuItem}
                    >
                      <UserRoundCog className="h-4 w-4 text-cyan-300" />
                      {t("nav.arenaProfile")}
                    </Link>
                    <Link
                      to="/arena/extension"
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      className={menuItem}
                    >
                      <Puzzle className="h-4 w-4 text-cyan-300" />
                      {t("nav.extensionSettings")}
                    </Link>
                    <div className="my-1 h-px bg-gray-800" role="separator" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                      }}
                      className={menuItem}
                    >
                      <LogOut className="h-4 w-4 text-gray-400" />
                      {t("nav.logout")}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
      {authOpen ? <AuthDialog initialMode="login" next={next} onClose={() => setAuthOpen(false)} /> : null}
    </div>
  );
}
