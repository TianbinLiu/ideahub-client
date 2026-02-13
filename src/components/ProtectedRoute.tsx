// src/components/ProtectedRoute.tsx
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../authContext";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <div className="p-6 text-gray-300">Loading...</div>;

  if (!user) {
    const next = `${loc.pathname}${loc.search || ""}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return <>{children}</>;
}

