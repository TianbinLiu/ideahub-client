// src/components/AdminRoute.tsx
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../authContext";
import AuthDialog from "./AuthDialog";

export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  const nav = useNavigate();

  if (loading) return <div className="p-6 text-gray-300">Loading...</div>;

  if (!user) {
    const next = `${loc.pathname}${loc.search || ""}`;
    return <AuthDialog initialMode="login" next={next} onClose={() => nav("/", { replace: true })} />;
  }

  if (user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
