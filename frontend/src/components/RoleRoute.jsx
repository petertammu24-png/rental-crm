import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const RoleRoute = ({ roles, children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};
