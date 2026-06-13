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

const StatCard = ({ label, value, icon: Icon, accent, testId, subtitle }) => (
  <div
    className="bg-white border border-[#EAE5D9] rounded-xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm"
    data-testid={testId}
  >
    <div className="flex items-start justify-between">
      <div>
        <div className="label-eyebrow">{label}</div>
        <div className="font-display text-3xl mt-2 text-[#1C1C1C]">{value}</div>
        {subtitle && <div className="text-xs text-[#737373] mt-1">{subtitle}</div>}
      </div>
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center"
        style={{ backgroundColor: accent || "#F4EFE3", color: "#0A3626" }}
      >
        <Icon className="w-4 h-4" />
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const { data } = await apiClient.get("/stats/dashboard");
      setStats(data);
    } catch (e) {
      setError("Could not load stats");
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div className="p-8 text-[#7A1A1E]" data-testid="dashboard-error">
        {error}
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 lg:p-12 max-w-[1400px] mx-auto" data-testid="dashboard-page">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-8">
        <div>
          <div className="label-eyebrow text-[#0A3626]">Overview</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-[#1C1C1C]">
            Today at the showroom
          </h1>
          <p className="text-sm text-[#4A4A4A] mt-2 max-w-xl">
            A glance at every running rental, upcoming returns, and balances —
            so nothing slips through the necklace.
          </p>
        </div>
        <Link
          to="/bookings"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#0A3626] hover:underline"
          data-testid="view-all-bookings-link"
        >
          View all bookings <ArrowUpRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
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
          accent="#FDF6E3"
        />
        <StatCard
          testId="stat-overdue"
          label="Overdue"
          value={stats?.overdue ?? "—"}
          subtitle="Past return date"
          icon={AlertTriangle}
          accent="#F9EAEB"
        />
        <StatCard
          testId="stat-rental-revenue"
          label="Total rental booked"
          value={stats ? formatINR(stats.total_rental) : "—"}
          subtitle="Across all bookings"
          icon={TrendingUp}
          accent="#E8F3EE"
        />
      </div>

      {/* Money strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 mb-10">
        <StatCard
          testId="stat-advance-collected"
          label="Advance collected"
          value={stats ? formatINR(stats.total_advance_collected) : "—"}
          icon={Wallet}
          accent="#E8F3EE"
        />
        <StatCard
          testId="stat-pending-from-customer"
          label="To collect from customers"
          value={stats ? formatINR(stats.pending_from_customer) : "—"}
          icon={ArrowDownToLine}
          accent="#FDF6E3"
        />
        <StatCard
          testId="stat-pending-to-customer"
          label="To refund to customers"
          value={stats ? formatINR(stats.pending_to_customer) : "—"}
          icon={ArrowUpFromLine}
          accent="#F9EAEB"
        />
      </div>

      {/* Lists */}
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
  <div className="bg-white border border-[#EAE5D9] rounded-xl" data-testid={testId}>
    <div className="px-5 py-4 border-b border-[#EAE5D9] flex items-center gap-2">
      <ScrollText className="w-4 h-4 text-[#0A3626]" />
      <h3 className="font-display text-xl">{title}</h3>
    </div>
    {items.length === 0 ? (
      <div className="px-5 py-10 text-center text-sm text-[#737373]">{empty}</div>
    ) : (
      <ul className="divide-y divide-[#EAE5D9]">
        {items.map((b) => (
          <li
            key={b.id}
            className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-[#FDFBF7] transition-colors"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[#1C1C1C]">{b.bill_no}</span>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusTone(
                    tone || b.status,
                  )}`}
                >
                  {tone || b.status}
                </span>
              </div>
              <div className="text-xs text-[#737373] mt-1 truncate">
                {b.customer?.name} • {b.product_code}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xs label-eyebrow">Return</div>
              <div className="text-sm text-[#1C1C1C]">{formatDate(b.return_date)}</div>
            </div>
          </li>
        ))}
      </ul>
    )}
  </div>
);
