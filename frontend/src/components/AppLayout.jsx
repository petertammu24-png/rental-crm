import { NavLink, Outlet, useLocation } from "react-router-dom";
import { LayoutDashboard, Gem, LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/bookings", label: "Bookings", icon: Gem, end: false },
];

export const AppLayout = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-[#FDFBF7]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-[#EAE5D9] bg-white">
        <div className="px-6 py-7 border-b border-[#EAE5D9]">
          <div className="label-eyebrow text-[#0A3626]">Rental CRM</div>
          <h1 className="font-display text-2xl mt-1 text-[#1C1C1C]">
            Maharani <span className="text-[#0A3626]">Jewels</span>
          </h1>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1" data-testid="sidebar-nav">
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-200 ${
                  active
                    ? "bg-[#0A3626] text-white"
                    : "text-[#4A4A4A] hover:bg-[#F4EFE3]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-[#EAE5D9]">
          <div className="text-xs text-[#737373] mb-2">Signed in as</div>
          <div className="text-sm font-medium text-[#1C1C1C] truncate" data-testid="current-user-email">
            {user?.email || "—"}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 w-full border-[#EAE5D9] hover:bg-[#F4EFE3]"
            onClick={logout}
            data-testid="logout-button"
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-20 bg-white border-b border-[#EAE5D9] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="label-eyebrow text-[#0A3626]">Rental CRM</div>
          <div className="font-display text-lg text-[#1C1C1C]">Maharani Jewels</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logout}
          data-testid="logout-button-mobile"
        >
          <LogOut className="w-4 h-4" />
        </Button>
      </div>

      <main className="flex-1 min-w-0 pt-16 md:pt-0">
        {/* Mobile nav strip */}
        <div className="md:hidden border-b border-[#EAE5D9] bg-white px-4 py-2 flex gap-2">
          {navItems.map((item) => {
            const active = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                data-testid={`mobile-nav-${item.label.toLowerCase()}`}
                className={`text-xs px-3 py-1.5 rounded-md ${
                  active
                    ? "bg-[#0A3626] text-white"
                    : "text-[#4A4A4A] bg-[#F4EFE3]"
                }`}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
        <Outlet />
      </main>
    </div>
  );
};
