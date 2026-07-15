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
 * - 显示未读通知徽章
 * - 用户登录状态显示
 * - 登录/注册/登出按钮
 * - 移动端响应式菜单
 * 
 * 依赖文件:
 * @uses ../authContext.tsx - 获取用户状态和登出方法
 * @uses ../api.ts - 获取未读通知数 (getUnreadCount)
 * @uses ./UserHoverCard.tsx - 用户悬浮卡片
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

import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import { useEffect, useState, type FormEvent } from "react";
import { getUnreadCount, listGroups, type Group } from "../api";
import { UserHoverCard } from "./UserHoverCard";
import { useTranslation } from "react-i18next";
import NotificationsDropdown from "./NotificationsDropdown";
import AuthDialog from "./AuthDialog";
import {
  Bomb,
  Bot,
  Building2,
  CircleHelp,
  CircleUserRound,
  FileText,
  Home,
  LogIn,
  LogOut,
  MessageSquareWarning,
  Search,
  Shield,
  UserPlus,
  UsersRound,
} from "lucide-react";


function cls(isActive: boolean) {
  return isActive ? "text-white" : "text-gray-300 hover:text-white";
}

type AuthDialogState = {
  mode: "login" | "register";
  next: string;
};

export default function Navbar() {
  const { user, loading: authLoading, logout } = useAuth();
  const { t } = useTranslation();
  const [unread, setUnread] = useState(0);
  const [navSearch, setNavSearch] = useState("");
  const [navGroup, setNavGroup] = useState("world");
  const [groups, setGroups] = useState<Group[]>([{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }]);
  const [guestMenuOpen, setGuestMenuOpen] = useState(false);
  const [autoGuestMenuShown, setAutoGuestMenuShown] = useState(false);
  const [authDialog, setAuthDialog] = useState<AuthDialogState | null>(null);
  const loc = useLocation();
  const nav = useNavigate();

  const next = `${loc.pathname}${loc.search || ""}`;
  
  const userId = user?._id;

  function replayGuide() {
    window.dispatchEvent(new CustomEvent("ideahub:onboarding:start"));
  }

  function openAuthDialog(mode: "login" | "register", targetNext = next) {
    setGuestMenuOpen(false);
    setAuthDialog({ mode, next: targetNext });
  }

  function submitNavSearch(event: FormEvent) {
    event.preventDefault();
    const keyword = navSearch.trim();
    const nextParams = new URLSearchParams(loc.pathname === "/search" ? loc.search : "");
    nextParams.set("page", "1");
    nextParams.set("group", navGroup || "world");
    if (keyword) nextParams.set("q", keyword);
    else nextParams.delete("q");
    setGuestMenuOpen(false);
    nav(`/search?${nextParams.toString()}`);
  }

  function updateNavGroup(nextGroup: string) {
    setNavGroup(nextGroup);
    if (loc.pathname !== "/search") return;
    const nextParams = new URLSearchParams(loc.search);
    nextParams.set("group", nextGroup || "world");
    nextParams.set("page", "1");
    nav(`/search?${nextParams.toString()}`);
  }

  useEffect(() => {
    const current = new URLSearchParams(loc.search);
    setNavSearch(current.get("q") || "");
    setNavGroup((current.get("group") || "world").trim().toLowerCase() || "world");
  }, [loc.search]);

  useEffect(() => {
    if (authLoading || user || autoGuestMenuShown) return;
    let timer: number | undefined;
    let attempts = 0;
    const showWhenOnboardingIsClear = () => {
      const onboardingOpen = Boolean(document.getElementById("onboarding-tour-title"));
      if (onboardingOpen && attempts < 10) {
        attempts += 1;
        timer = window.setTimeout(showWhenOnboardingIsClear, 800);
        return;
      }
      if (onboardingOpen) return;
      setGuestMenuOpen(true);
      setAutoGuestMenuShown(true);
    };
    timer = window.setTimeout(showWhenOnboardingIsClear, 900);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [authLoading, autoGuestMenuShown, loc.key, user]);

  useEffect(() => {
    setGuestMenuOpen(false);
  }, [loc.key]);

  useEffect(() => {
    function handleOpenAuth(event: Event) {
      const detail = (event as CustomEvent<Partial<AuthDialogState>>).detail || {};
      openAuthDialog(detail.mode === "register" ? "register" : "login", detail.next || next);
    }

    window.addEventListener("ideahub:auth:open", handleOpenAuth as EventListener);
    return () => window.removeEventListener("ideahub:auth:open", handleOpenAuth as EventListener);
  }, [next]);

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
      if (timer) clearInterval(timer);
      window.removeEventListener('notificationsUpdated', handleNotificationsUpdate);
    };
  }, [user]);

  useEffect(() => {
    let mounted = true;
    async function loadGroups() {
      try {
        const res = await listGroups();
        if (!mounted) return;
        const accessibleGroups = (res.groups || []).filter((group) => group.isWorld || group.joined);
        setGroups(accessibleGroups.length > 0 ? accessibleGroups : [{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }]);
      } catch {
        if (!mounted) return;
        setGroups([{ _id: "world", slug: "world", name: "World", joined: true, isWorld: true }]);
      }
    }

    void loadGroups();
    return () => {
      mounted = false;
    };
  }, [user]);

  return (
    <div className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950/88 backdrop-blur" data-tour="top-nav">
      <div className="mx-auto grid max-w-7xl grid-cols-[auto,1fr,auto] items-center gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="font-bold text-xl text-white">IdeaHub</Link>
          <NavLink to="/" title={t("nav.home")} aria-label={t("nav.home")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
            <Home className="h-5 w-5" />
          </NavLink>
          <NavLink to="/arena" title={t("nav.arena")} aria-label={t("nav.arena")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
            <Bomb className="h-5 w-5" />
          </NavLink>
          {user && (
            <NavLink to="/groups" title={t("nav.groups")} aria-label={t("nav.groups")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
              <UsersRound className="h-5 w-5" />
            </NavLink>
          )}
        </div>

        <form onSubmit={submitNavSearch} className="mx-auto flex w-full max-w-xl items-center overflow-hidden rounded-full border border-gray-800 bg-gray-900/80 focus-within:border-cyan-500">
          <select
            value={navGroup}
            onChange={(event) => updateNavGroup(event.target.value)}
            className="h-9 max-w-28 border-r border-gray-800 bg-gray-900 px-3 text-xs text-gray-200 outline-none hover:bg-gray-800"
            aria-label={t("home.currentGroup")}
          >
            {groups.map((group) => (
              <option key={group.slug} value={group.slug}>{group.name}</option>
            ))}
          </select>
          <input
            value={navSearch}
            onChange={(event) => setNavSearch(event.target.value)}
            placeholder={t("home.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm text-gray-100 outline-none placeholder:text-gray-500"
          />
          <button type="submit" className="flex h-9 w-11 items-center justify-center text-gray-300 hover:bg-gray-800 hover:text-white" aria-label={t("common.search")}>
            <Search className="h-4 w-4" />
          </button>
        </form>

        <div className="flex items-center gap-2 text-sm">
          {user && <NotificationsDropdown unreadCount={unread} />}

          <button
            type="button"
            onClick={replayGuide}
            title={t("nav.guide")}
            aria-label={t("nav.guide")}
            data-tour="guide-button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-cyan-800/60 text-cyan-200 hover:bg-cyan-950/40"
          >
            <CircleHelp className="h-5 w-5" />
          </button>

          {user?.role === "company" && (
            <NavLink to="/company" title={t("nav.company")} aria-label={t("nav.company")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
              <Building2 className="h-5 w-5" />
            </NavLink>
          )}

          {user?.role === "admin" && (
            <>
              <NavLink to="/admin/users" title={t("nav.admin")} aria-label={t("nav.admin")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
                <Shield className="h-5 w-5" />
              </NavLink>
              <NavLink to="/feedback" title={t("nav.feedback")} aria-label={t("nav.feedback")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
                <MessageSquareWarning className="h-5 w-5" />
              </NavLink>
              <NavLink to="/admin/docs" title={t("nav.docs")} aria-label={t("nav.docs")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
                <FileText className="h-5 w-5" />
              </NavLink>
              <NavLink to="/admin/scraper" title={t("nav.scraper")} aria-label={t("nav.scraper")} className={({ isActive }) => `${cls(isActive)} inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-gray-900`}>
                <Bot className="h-5 w-5" />
              </NavLink>
            </>
          )}

          {!user ? (
            <div
              className="relative"
              onMouseEnter={() => setGuestMenuOpen(true)}
              onMouseLeave={() => setGuestMenuOpen(false)}
            >
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 text-black shadow-lg shadow-cyan-950/30 hover:bg-cyan-300"
                aria-label={t("nav.login")}
                onClick={() => setGuestMenuOpen((prev) => !prev)}
              >
                <CircleUserRound className="h-6 w-6" />
              </button>
              {guestMenuOpen ? (
                <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-gray-800 bg-gray-950 p-4 shadow-2xl">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-cyan-500 text-black">
                      <CircleUserRound className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="font-semibold text-white">IdeaHub</div>
                      <div className="text-xs text-gray-400">{t("auth.signInQuickly")}</div>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2">
                    <button type="button" onClick={() => openAuthDialog("login")} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-gray-200">
                      <LogIn className="h-4 w-4" /> {t("nav.login")}
                    </button>
                    <button type="button" onClick={() => openAuthDialog("register")} className="flex items-center justify-center gap-2 rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 hover:bg-gray-900">
                      <UserPlus className="h-4 w-4" /> {t("nav.register")}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              {userId && (
                <UserHoverCard userId={userId} username={user.username}>
                  <Link to={`/users/${userId}`} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-sm font-bold text-cyan-100 hover:border-cyan-600">
                    {user.username?.[0]?.toUpperCase() || "U"}
                  </Link>
                </UserHoverCard>
              )}
              <button
                onClick={logout}
                title={t("nav.logout")}
                aria-label={t("nav.logout")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-700 hover:bg-gray-900"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
      {authDialog ? (
        <AuthDialog
          initialMode={authDialog.mode}
          next={authDialog.next}
          onClose={() => setAuthDialog(null)}
        />
      ) : null}
    </div>
  );
}
