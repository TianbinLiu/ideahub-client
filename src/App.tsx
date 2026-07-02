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

import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminRoute from "./components/AdminRoute";
import { useAuth } from "./authContext";

import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import NewIdeaPage from "./pages/NewIdeaPage";
import NewIdeaTypePage from "./pages/NewIdeaTypePage";
import IdeaDetailPage from "./pages/IdeaDetailPage";
import CompanyPage from "./pages/CompanyPage";
import NotificationsPage from "./pages/NotificationsPage";
import MessagesPage from "./pages/MessagesPage";
import MessageRequestsPage from "./pages/MessageRequestsPage";
import ComponentsPage from "./pages/ComponentsPage";
import Live2DSettingsPage from "./pages/Live2DSettingsPage";
import TagRankSettingsPage from "./pages/TagRankSettingsPage";
import AdminUsersPage from "./pages/AdminUsersPage";
import FeedbackAdminPage from "./pages/FeedbackAdminPage";
import DocsAdminPage from "./pages/DocsAdminPage";
import AdminScraperPage from "./pages/AdminScraperPage";
import EditIdeaPage from "./pages/EditIdeaPage";
import PhoneLoginPage from "./pages/PhoneLoginPage";
import OAuthCallbackPage from "./pages/OAuthCallbackPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import TagRankPage from "./pages/TagRankPage";
import LeaderboardDetailPage from "./pages/LeaderboardDetailPage";
import UserProfilePage from "./pages/UserProfilePage";
import BlacklistPage from "./pages/BlacklistPage";
import SettingsPage from "./pages/SettingsPage";
import TagMapPage from "./pages/TagMapPage";
import WorkshopPage from "./pages/WorkshopPage";
import WorkshopTemplateDetailPage from "./pages/WorkshopTemplateDetailPage";
import WorkshopEditorPage from "./pages/WorkshopEditorPage";
import WorkshopTagMapPage from "./pages/WorkshopTagMapPage";
import GroupsPage from "./pages/GroupsPage";
import GroupDetailPage from "./pages/GroupDetailPage";
import { getActiveWorkshopTemplate, type WorkshopTemplate, type WorkshopTheme } from "./api";
import { applyWorkshopTemplateToDocument, readActiveWorkshopTemplate, saveActiveWorkshopTemplate } from "./utils/workshopTheme";
import SiteTemplateEditOverlay from "./components/SiteTemplateEditOverlay";
import SiteLive2D from "./components/SiteLive2D";
import WorkshopSiteEditorAccessGate from "./components/WorkshopSiteEditorAccessGate";
import OnboardingTour from "./components/OnboardingTour";

// Redirect /me to the current user's profile
function MeRedirect() {
  const { user } = useAuth();
  const userId = user?._id;

  if (!userId) {
    return <Navigate to="/login" replace />;
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
      <Navbar />
      <SiteTemplateEditOverlay />
      <SiteLive2D />
      <OnboardingTour />
      <Routes>
        <Route path="/" element={<HomePage />} />
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
      </Routes>
    </div>
  );
}
