import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider } from "@/context/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import { RoleRoute } from "@/components/RoleRoute";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Bookings from "@/pages/Bookings";
import Branches from "@/pages/Branches";
import Users from "@/pages/Users";
import Customers from "@/pages/Customers";
import Invoice from "@/pages/Invoice";

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/invoice/:id"
              element={
                <ProtectedRoute>
                  <Invoice />
                </ProtectedRoute>
              }
            />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/bookings" element={<Bookings />} />
              <Route path="/customers" element={<Customers />} />
              <Route
                path="/branches"
                element={
                  <RoleRoute roles={["super_admin"]}>
                    <Branches />
                  </RoleRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <RoleRoute roles={["super_admin", "manager"]}>
                    <Users />
                  </RoleRoute>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "#2E1C46",
              color: "#F0E6FF",
              border: "1px solid #5A3D85",
            },
          }}
        />
      </AuthProvider>
    </div>
  );
}

export default App;
