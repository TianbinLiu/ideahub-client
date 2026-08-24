/**
 * App.tsx - 根组件和路由配置中心
 * 
 * 📖 AI开发规范：修改前必读 /.ai-instructions.md 和 PROJECT_STRUCTURE.md
 * 🔄 修改后同步更新：PROJECT_STRUCTURE.md 的路由表章节
 * 
 * 重要提示：
 * - 新增页面必须在此注册路由
 * - 需要权限的页面用 ProtectedRoute 包裹
 * - 管理员页面用 AdminRoute 包裹
 */

import { Routes, Route, Navigate, Outlet, useNavigate } from "react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import Navbar from "./components/Navbar";
import ArenaLayout from "./components/ArenaLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import { useAuth } from "./authContext";

// 页面组件按路由懒加载：React.lazy → Vite 给每页拆独立 chunk，首包不再打进全部 ~45 个页面。
// 切页/首进时的 chunk 加载由各 layout 的 <Suspense fallback={<PageLoading/>}> 兜底。
import PageLoading from "./components/PageLoading";
const HomePage = lazy(() => import("./pages/HomePage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const NewIdeaPage = lazy(() => import("./pages/NewIdeaPage"));
const NewIdeaTypePage = lazy(() => import("./pages/NewIdeaTypePage"));
const IdeaDetailPage = lazy(() => import("./pages/IdeaDetailPage"));
const HotPage = lazy(() => import("./pages/HotPage"));
const FeedPage = lazy(() => import("./pages/FeedPage"));
const CompanyPage = lazy(() => import("./pages/CompanyPage"));
const DownloadPage = lazy(() => import("./pages/DownloadPage"));
const PrivacyPage = lazy(() => import("./pages/PrivacyPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const MessagesPage = lazy(() => import("./pages/MessagesPage"));
const MessageRequestsPage = lazy(() => import("./pages/MessageRequestsPage"));
const ComponentsPage = lazy(() => import("./pages/ComponentsPage"));
const Live2DSettingsPage = lazy(() => import("./pages/Live2DSettingsPage"));
const TagRankSettingsPage = lazy(() => import("./pages/TagRankSettingsPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const FeedbackAdminPage = lazy(() => import("./pages/FeedbackAdminPage"));
const DocsAdminPage = lazy(() => import("./pages/DocsAdminPage"));
const AdminScraperPage = lazy(() => import("./pages/AdminScraperPage"));
const EditIdeaPage = lazy(() => import("./pages/EditIdeaPage"));
const PhoneLoginPage = lazy(() => import("./pages/PhoneLoginPage"));
const OAuthCallbackPage = lazy(() => import("./pages/OAuthCallbackPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));
const TagRankPage = lazy(() => import("./pages/TagRankPage"));
const LeaderboardDetailPage = lazy(() => import("./pages/LeaderboardDetailPage"));
const UserProfilePage = lazy(() => import("./pages/UserProfilePage"));
const BlacklistPage = lazy(() => import("./pages/BlacklistPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const TagMapPage = lazy(() => import("./pages/TagMapPage"));
const WorkshopPage = lazy(() => import("./pages/WorkshopPage"));
const WorkshopTemplateDetailPage = lazy(() => import("./pages/WorkshopTemplateDetailPage"));
const WorkshopEditorPage = lazy(() => import("./pages/WorkshopEditorPage"));
const WorkshopTagMapPage = lazy(() => import("./pages/WorkshopTagMapPage"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));
const GroupDetailPage = lazy(() => import("./pages/GroupDetailPage"));
const ArenaPage = lazy(() => import("./pages/ArenaPage"));
const ScenarioGalleryPage = lazy(() => import("./pages/ScenarioGalleryPage"));
const ScenarioDetailPage = lazy(() => import("./pages/ScenarioDetailPage"));
const ScenarioEditorPage = lazy(() => import("./pages/ScenarioEditorPage"));
const ScenarioPlayPage = lazy(() => import("./pages/ScenarioPlayPage"));
const ScenarioSessionReplayPage = lazy(() => import("./pages/ScenarioSessionReplayPage"));
const StandpointPage = lazy(() => import("./pages/StandpointPage"));
const BountyBoardPage = lazy(() => import("./pages/BountyBoardPage"));
const BountyDetailPage = lazy(() => import("./pages/BountyDetailPage"));
const BountyEditorPage = lazy(() => import("./pages/BountyEditorPage"));
const StyleProfilePage = lazy(() => import("./pages/StyleProfilePage"));
const ArenaProfilePage = lazy(() => import("./pages/ArenaProfilePage"));
const ExtensionSettingsPage = lazy(() => import("./pages/ExtensionSettingsPage"));
const PersonaGalleryPage = lazy(() => import("./pages/PersonaGalleryPage"));
const PersonaDetailPage = lazy(() => import("./pages/PersonaDetailPage"));
const PersonaEditorPage = lazy(() => import("./pages/PersonaEditorPage"));
const MemeLibraryPage = lazy(() => import("./pages/MemeLibraryPage"));
import { getActiveWorkshopTemplate, type WorkshopTemplate, type WorkshopTheme } from "./api";
import { applyWorkshopTemplateToDocument, readActiveWorkshopTemplate, saveActiveWorkshopTemplate } from "./utils/workshopTheme";
import SiteTemplateEditOverlay from "./components/SiteTemplateEditOverlay";
import SiteLive2D from "./components/SiteLive2D";
import WorkshopSiteEditorAccessGate from "./components/WorkshopSiteEditorAccessGate";
import OnboardingTour from "./components/OnboardingTour";
import AuthDialog from "./components/AuthDialog";

/**
 * 主站 layout：除 /arena/* 外的所有路由都套这个，导航栏与改造前完全一致。
 *
 * ★导航栏从「<Routes> 外面的全局一份」改成「按 layout route 分发」，是为了让 /arena/*
 *   能换成 ArenaNavbar（需求 8c）。非 arena 页面渲染的仍是同一个 <Navbar />，
 *   位置也仍在页面内容之上 —— 对它们来说什么都没变。
 */
function MainLayout() {
  return (
    <>
      <Navbar />
      <Suspense fallback={<PageLoading />}>
        <Outlet />
      </Suspense>
    </>
  );
}

// Redirect /me to the current user's profile
function MeRedirect() {
  const { user } = useAuth();
  const nav = useNavigate();
  const userId = user?._id;

  if (!userId) {
    return <AuthDialog initialMode="login" next="/me" onClose={() => nav("/", { replace: true })} />;
  }

  return <Navigate to={`/users/${userId}`} replace />;
}


export default function App() {
  const { user } = useAuth();
  const [activeTemplate, setActiveTemplate] = useState<WorkshopTemplate | null>(readActiveWorkshopTemplate());

  useEffect(() => {
    applyWorkshopTemplateToDocument(activeTemplate);
  }, [activeTemplate]);

  const userId = user?._id;

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!userId) {
        setActiveTemplate(readActiveWorkshopTemplate());
        return;
      }
      try {
        const res = await getActiveWorkshopTemplate();
        if (!mounted) return;
        setActiveTemplate(res.activeTemplate || null);
        saveActiveWorkshopTemplate(res.activeTemplate || null);
      } catch {
        // keep local fallback
      }
    })();

    return () => {
      mounted = false;
    };
  }, [userId]);

  const bg: WorkshopTheme = activeTemplate?.theme || {
    backgroundType: "none",
    backgroundUrl: "",
    accentColor: "#22d3ee",
    textColor: "#f3f4f6",
    cardRadius: 16,
    cardOpacity: 0.92,
    customCss: "",
    componentCss: { card: "", button: "", title: "" },
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 relative">
      {bg.backgroundType === "image" && bg.backgroundUrl && (
        <div
          className="pointer-events-none fixed inset-0 -z-10 bg-cover bg-center opacity-45"
          style={{ backgroundImage: `url(${bg.backgroundUrl})` }}
        />
      )}
      {bg.backgroundType === "video" && bg.backgroundUrl && (
        <video
          className="pointer-events-none fixed inset-0 -z-10 h-full w-full object-cover opacity-45"
          src={bg.backgroundUrl}
          autoPlay
          loop
          muted
          playsInline
        />
      )}
      {bg.backgroundType === "gradient" && (
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.25)_0%,rgba(3,7,18,1)_55%)]" />
      )}
      <SiteTemplateEditOverlay />
      <SiteLive2D />
      <OnboardingTour />
      <Routes>
        {/*
          ===== 卢本伟广场 =====
          ★ArenaLayout = ArenaNavbar + ArenaGate(插件门禁)。门禁必须守在这一层：
            只在 navbar 炸弹图标上拦是假的，用户直接敲 /arena 网址就绕过去了。
          ★新增 /arena/* 子路由请一律加在这个 <Route> 里面，加到外面 = 该子路由没有门禁。
        */}
        <Route element={<ArenaLayout />}>
          <Route path="/arena" element={<ArenaPage />} />
          <Route path="/arena/simulate" element={<ScenarioGalleryPage />} />
          <Route
            path="/arena/simulate/new"
            element={
              <ProtectedRoute>
                <ScenarioEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="/arena/simulate/:id" element={<ScenarioDetailPage />} />
          <Route
            path="/arena/simulate/:id/edit"
            element={
              <ProtectedRoute>
                <ScenarioEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arena/simulate/:id/play"
            element={
              <ProtectedRoute>
                <ScenarioPlayPage />
              </ProtectedRoute>
            }
          />
          <Route path="/arena/simulate/:id/session/:sessionId" element={<ScenarioSessionReplayPage />} />
          <Route
            path="/arena/standpoint"
            element={
              <ProtectedRoute>
                <StandpointPage />
              </ProtectedRoute>
            }
          />
          <Route path="/arena/bounty" element={<BountyBoardPage />} />
          <Route
            path="/arena/bounty/new"
            element={
              <ProtectedRoute>
                <BountyEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="/arena/bounty/:id" element={<BountyDetailPage />} />
          <Route
            path="/arena/bounty/:id/edit"
            element={
              <ProtectedRoute>
                <BountyEditorPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arena/style"
            element={
              <ProtectedRoute>
                <StyleProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arena/profile"
            element={
              <ProtectedRoute>
                <ArenaProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/arena/extension"
            element={
              <ProtectedRoute>
                <ExtensionSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="/arena/persona" element={<PersonaGalleryPage />} />
          <Route
            path="/arena/persona/new"
            element={
              <ProtectedRoute>
                <PersonaEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="/arena/persona/:id" element={<PersonaDetailPage />} />
          <Route
            path="/arena/persona/:id/edit"
            element={
              <ProtectedRoute>
                <PersonaEditorPage />
              </ProtectedRoute>
            }
          />
          <Route path="/arena/memes" element={<MemeLibraryPage />} />
        </Route>

        {/* ===== 主站：导航栏与改造前一致（<Navbar />），行为不变 ===== */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/hot" element={<HotPage />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/search" element={<SearchPage />} />
          {/* App 安装包下载页。★必须**不登录**可访问：这个地址会被分享/印成二维码给
              还没有账号的人，挂在 ProtectedRoute 后面等于扫了码只看到登录页 */}
          <Route path="/download" element={<DownloadPage />} />
          {/* 隐私政策。★同样**必须不登录可访问**：应用市场与开放平台（微信/QQ/Play）
              审核的人没有账号，这一页正是给他们看的 */}
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/ideas/:id" element={<IdeaDetailPage />} />
          <Route
            path="/ideas/:id/edit"
            element={
              <ProtectedRoute>
                <EditIdeaPage />
              </ProtectedRoute>
            }
          />


          <Route path="/login" element={<LoginPage />} />
          <Route path="/reset" element={<ResetPasswordPage />} />
          <Route path="/login/phone" element={<PhoneLoginPage />} />
          <Route path="/oauth/callback" element={<OAuthCallbackPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            path="/ideas/new"
            element={
              <ProtectedRoute>
                <NewIdeaTypePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/ideas/new/:mode"
            element={
              <ProtectedRoute>
                <NewIdeaPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/me"
            element={
              <ProtectedRoute>
                <MeRedirect />
              </ProtectedRoute>
            }
          />

          <Route
            path="/company"
            element={
              <ProtectedRoute>
                <CompanyPage />
              </ProtectedRoute>
            }
          />

          <Route path="/tag-rank" element={<TagRankPage />} />
          <Route path="/tag-map" element={<TagMapPage />} />
          <Route path="/leaderboard/:id" element={<LeaderboardDetailPage />} />

          <Route path="/users/:id" element={<UserProfilePage />} />
          <Route
            path="/groups"
            element={
              <ProtectedRoute>
                <GroupsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/groups/:slug"
            element={
              <ProtectedRoute>
                <GroupDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workshop"
            element={
              <ProtectedRoute>
                <WorkshopPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workshop/new"
            element={
              <ProtectedRoute>
                <WorkshopSiteEditorAccessGate>
                  <WorkshopEditorPage />
                </WorkshopSiteEditorAccessGate>
              </ProtectedRoute>
            }
          />
          <Route
            path="/workshop/tag-map"
            element={
              <ProtectedRoute>
                <WorkshopTagMapPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workshop/templates/:id"
            element={
              <ProtectedRoute>
                <WorkshopTemplateDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/workshop/templates/:id/edit"
            element={
              <ProtectedRoute>
                <WorkshopSiteEditorAccessGate>
                  <WorkshopEditorPage />
                </WorkshopSiteEditorAccessGate>
              </ProtectedRoute>
            }
          />

          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <NotificationsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/messages"
            element={
              <ProtectedRoute>
                <MessagesPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/message-requests"
            element={
              <ProtectedRoute>
                <MessageRequestsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/blacklist"
            element={
              <ProtectedRoute>
                <BlacklistPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/components"
            element={
              <ProtectedRoute>
                <ComponentsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/components/live2d"
            element={
              <ProtectedRoute>
                <Live2DSettingsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/components/tag-rank"
            element={
              <ProtectedRoute>
                <TagRankSettingsPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin/users"
            element={
              <AdminRoute>
                <AdminUsersPage />
              </AdminRoute>
            }
          />

          <Route
            path="/feedback"
            element={
              <AdminRoute>
                <FeedbackAdminPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/docs"
            element={
              <AdminRoute>
                <DocsAdminPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/scraper"
            element={
              <AdminRoute>
                <AdminScraperPage />
              </AdminRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </div>
  );
}
