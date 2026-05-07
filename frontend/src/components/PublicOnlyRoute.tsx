import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";

export default function PublicOnlyRoute({ children }: { children: JSX.Element }) {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-sky">
        <div className="spinner" />
      </div>
    );
  }
  if (token) return <Navigate to="/" replace />;
  return children;
}
