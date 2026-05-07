import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export default function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { token, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="spinner" />
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
