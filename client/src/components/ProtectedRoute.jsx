import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sand">
        <div className="rounded-full border border-brand-100 bg-white px-6 py-3 text-sm text-slate-600 shadow-panel">
          Загружаем рабочее пространство...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

export function PermissionRoute({ children, anyPermissions = [] }) {
  const { hasPermission } = useAuth();

  if (
    anyPermissions.length > 0 &&
    !anyPermissions.some((permission) => hasPermission(permission))
  ) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export function PublicRoute({ children }) {
  const { isAuthenticated } = useAuth();

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
