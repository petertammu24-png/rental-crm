import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7]">
        <div className="animate-pulse text-sm tracking-[0.2em] uppercase text-[#737373]">
          Loading
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
};
