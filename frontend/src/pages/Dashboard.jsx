import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  PackageOpen,
  CalendarClock,
  AlertTriangle,
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  ScrollText,
  ArrowUpRight,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { formatINR, formatDate, statusTone } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const StatCard = ({ label, value, icon: Icon, subtitle, testId, accent }) => (
  <div className="neu-sm p-5 transition-transform hover:-translate-y-0.5" data-testid={testId}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="label-eyebrow">{label}</div>
        <div className="font-display text-3xl mt-2 text-white truncate">{value}</div>
        {subtitle && <div className="text-xs text-[#B097D1] mt-1.5">{subtitle}</div>}
      </div>
      <div
        className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
        style={{
          background: accent || "linear-gradient(135deg, #B026D3, #E879F9)",
          boxShadow: "4px 4px 10px rgba(0,0,0,0.4), -3px -3px 8px rgba(120,70,180,0.18)",
        }}
      >
        <Icon className="w-4 h-4 text-white" />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchFilter, setBranchFilter] = useState("all");
  const [error, setError] = useState(null);

  const isSuper = user?.role === "super_admin";

  const load = async (bid = branchFilter) => {
    try {
      const params = isSuper && bid !== "all" ? { branch_id: bid } : {};
      const { data } = await apiClient.get("/stats/dashboard", { params });
      setStats(data);
    } catch (e) {
      setError("Could not load stats");
    }
  };

  useEffect(() => {
    if (isSuper) {
      apiClient.get("/branches").then((r) => setBranches(r.data)).catch(() => setBranches([]));
    }
    load(branchFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchFilter, isSuper]);

  if (error) {
    return <div className="p-8 text-[#FDB3C0]" data-testid="dashboard-error">{error}</div>;
  }

  return (
    <div className="p-6 md:p-8 lg:p-10 max-w-[1500px] mx-auto" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">Overview</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-white">
            Today at the showroom
          </h1>
          <p className="text-sm text-[#B097D1] mt-2 max-w-xl">
            Every running rental, upcoming return and balance — across your branches.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isSuper && (
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="neu-input px-3 py-2.5 text-sm"
              data-testid="dashboard-branch-filter"
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          )}
          <Link
            to="/bookings"
            className="neu-btn inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5"
            data-testid="view-all-bookings-link"
          >
            View all bookings <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
        <StatCard
          testId="stat-currently-rented"
          label="Currently rented"
          value={stats?.currently_rented ?? "—"}
          subtitle={`${stats?.total_bookings ?? 0} total bookings`}
          icon={PackageOpen}
        />
        <StatCard
          testId="stat-upcoming-returns"
          label="Returns in 7 days"
          value={stats?.upcoming_returns ?? "—"}
          subtitle="Plan pickups & cleaning"
          icon={CalendarClock}
          accent="linear-gradient(135deg,#7A5C00,#D9B53C)"
        />
        <StatCard
          testId="stat-overdue"
          label="Overdue"
          value={stats?.overdue ?? "—"}
          subtitle="Past return date"
          icon={AlertTriangle}
          accent="linear-gradient(135deg,#7E2C3E,#E04F6B)"
        />
        <StatCard
          testId="stat-rental-revenue"
          label="Total rental booked"
          value={stats ? formatINR(stats.total_rental) : "—"}
          subtitle="Across all bookings"
          icon={TrendingUp}
          accent="linear-gradient(135deg,#1F5E48,#5BC79A)"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-8">
        <StatCard
          testId="stat-advance-collected"
          label="Advance collected"
          value={stats ? formatINR(stats.total_advance_collected) : "—"}
          icon={Wallet}
          accent="linear-gradient(135deg,#1F5E48,#5BC79A)"
        />
        <StatCard
          testId="stat-pending-from-customer"
          label="To collect from customers"
          value={stats ? formatINR(stats.pending_from_customer) : "—"}
          icon={ArrowDownToLine}
          accent="linear-gradient(135deg,#7A5C00,#D9B53C)"
        />
        <StatCard
          testId="stat-pending-to-customer"
          label="To refund to customers"
          value={stats ? formatINR(stats.pending_to_customer) : "—"}
          icon={ArrowUpFromLine}
          accent="linear-gradient(135deg,#7E2C3E,#E04F6B)"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListCard
          title="Overdue returns"
          empty="No overdue rentals. Beautiful."
          items={stats?.overdue_bookings || []}
          tone="Overdue"
          testId="overdue-list"
        />
        <ListCard
          title="Upcoming returns"
          empty="Nothing returning this week."
          items={stats?.upcoming_bookings || []}
          testId="upcoming-list"
        />
      </div>
    </div>
  );
}

const ListCard = ({ title, items, empty, tone, testId }) => (
  <div className="neu-sm overflow-hidden" data-testid={testId}>
    <div className="px-5 py-4 border-b border-[#3D2A5C] flex items-center gap-2">
      <ScrollText className="w-4 h-4 text-[#DA4FF1]" />
      <h3 className="font-display text-lg text-white">{title}</h3>
    </div>
    {items.length === 0 ? (
      <div className="px-5 py-10 text-center text-sm text-[#B097D1]">{empty}</div>
    ) : (
      <ul className="divide-y divide-[#3D2A5C]">
        {items.map((b) => (
          <li
            key={b.id}
            className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#352051] transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{b.bill_no}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusTone(
                    tone || b.status,
                  )}`}
                >
                  {tone || b.status}
                </span>
              </div>
              <div className="text-xs text-[#B097D1] mt-1 truncate">
                {b.customer?.name} • {b.product_code}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="label-eyebrow">Return</div>
              <div className="text-sm text-white">{formatDate(b.return_date)}</div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);
