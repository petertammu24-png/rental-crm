import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Gem,
  Building2,
  UserCog,
  LogOut,
  Sparkles,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/lib/format";
import { apiClient } from "@/lib/api";

const navItemsFor = (role) => {
  const items = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
    { to: "/bookings", label: "Bookings", icon: Gem, end: false },
  ];
  if (role === "super_admin") {
    items.push({ to: "/branches", label: "Branches", icon: Building2, end: false });
  }
  if (role === "super_admin" || role === "manager") {
    items.push({ to: "/users", label: "Users", icon: UserCog, end: false });
  }
  return items;
};

export const AppLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [branch, setBranch] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const loadBranch = async () => {
      if (user?.branch_id && !user?.branch) {
        try {
          const { data } = await apiClient.get("/branches");
          setBranch(data.find((b) => b.id === user.branch_id) || null);
        } catch {
          setBranch(null);
        }
      } else {
        setBranch(user?.branch || null);
      }
    };
    if (user) loadBranch();
  }, [user]);

  const navItems = navItemsFor(user?.role);

  const sidebarContent = (
    <>
      <div className="px-6 py-7 flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl neu-btn-primary flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="label-eyebrow text-[#DA4FF1]">Rental CRM</div>
          <div className="font-display text-base text-white truncate">
            Banglzz &amp; Kalyani
          </div>
        </div>
      </div>

      <nav className="flex-1 px-4 py-3 space-y-2" data-testid="sidebar-nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              data-testid={`nav-${item.label.toLowerCase()}`}
              className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all duration-200 ${
                active
                  ? "neu-btn-primary"
                  : "neu-btn hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>

      <div className="px-4 py-4">
        <div className="neu-sm p-4">
          <div className="label-eyebrow">Signed in</div>
          <div className="text-sm font-semibold text-white mt-1 truncate" data-testid="current-user-name">
            {user?.name || user?.email}
          </div>
          <div className="text-xs text-[#B097D1] mt-1 truncate" data-testid="current-user-email">
            {user?.email}
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#3A2A5E] text-[#E9CFFD]">
              {roleLabel(user?.role)}
            </span>
            {branch && (
              <span
                className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#22463A] text-[#A6E8C9]"
                data-testid="current-branch"
              >
                {branch.code}
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="neu-btn w-full mt-4 py-2.5 text-xs font-medium flex items-center justify-center gap-2"
            data-testid="logout-button"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="app-bg flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-72 shrink-0 flex-col neu-sm m-4 rounded-[28px] h-[calc(100vh-2rem)] sticky top-4">
        {sidebarContent}
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 px-4 py-3 flex items-center justify-between bg-[#251638]/90 backdrop-blur border-b border-[#3D2A5C]">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl neu-btn-primary flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="font-display text-sm text-white">Banglzz &amp; Kalyani</div>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="neu-btn w-9 h-9 flex items-center justify-center"
          data-testid="mobile-menu-toggle"
        >
          {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm pt-16"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="neu-sm w-72 flex flex-col ml-4 mr-4 mt-2 rounded-[28px] max-h-[calc(100vh-5rem)] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-16 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
};
