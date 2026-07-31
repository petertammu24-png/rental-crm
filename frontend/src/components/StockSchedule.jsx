import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { CalendarClock, PackageCheck, TrendingUp, Timer } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { formatINR, formatDate, statusTone, todayISO } from "@/lib/format";

const monthLabel = (key) => {
  try {
    const [y, m] = key.split("-").map((s) => parseInt(s, 10));
    return new Date(y, m - 1, 1).toLocaleString("en-IN", {
      month: "short",
      year: "2-digit",
    });
  } catch {
    return key;
  }
};

const RevenueTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="neu-sm px-3 py-2 text-xs" style={{ background: "#2E1C46" }}>
      <div className="font-semibold text-white mb-1">{monthLabel(label)}</div>
      <div className="text-[#D9CDF0]">
        Revenue: <span className="text-white font-medium">{formatINR(payload[0].value)}</span>
      </div>
    </div>
  );
};

export const StockSchedule = ({ stock, open, onOpenChange }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !stock?.id) return;
    setLoading(true);
    setData(null);
    apiClient
      .get(`/stock/${stock.id}/schedule`, { params: { months: 12 } })
      .then((r) => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, stock?.id]);

  const today = todayISO();

  const activeStatus = useMemo(() => {
    if (!data) return null;
    const now = data.bookings.find(
      (b) =>
        b.status !== "Returned" &&
        (b.booking_date || "") <= today &&
        (b.return_date || "") >= today,
    );
    if (now) return { kind: "rented", until: now.return_date, bill: now.bill_no };
    const nextBooked = data.upcoming.find((b) => (b.booking_date || "") > today);
    if (nextBooked)
      return { kind: "upcoming", from: nextBooked.booking_date, bill: nextBooked.bill_no };
    return { kind: "available" };
  }, [data, today]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="neu max-w-3xl max-h-[90vh] overflow-y-auto border-0 text-[#F0E6FF]"
        data-testid="stock-schedule-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-white flex items-center gap-3">
            <span className="text-[#DA4FF1] font-mono text-base">{stock?.code}</span>
            <span>{stock?.name}</span>
          </DialogTitle>
          <DialogDescription className="text-[#B097D1]">
            Availability schedule and revenue for this jewellery set.
          </DialogDescription>
        </DialogHeader>

        {loading || !data ? (
          <div className="py-10 text-center text-[#B097D1]">Loading schedule…</div>
        ) : (
          <div className="space-y-6 mt-2">
            {/* Status banner */}
            {activeStatus && (
              <div
                className={`neu-inset px-4 py-3 flex items-center gap-3 ${
                  activeStatus.kind === "rented"
                    ? "text-[#FDB3C0]"
                    : activeStatus.kind === "upcoming"
                    ? "text-[#FFD679]"
                    : "text-[#A6E8C9]"
                }`}
                data-testid="stock-status-banner"
              >
                {activeStatus.kind === "available" ? (
                  <PackageCheck className="w-5 h-5 shrink-0" />
                ) : (
                  <CalendarClock className="w-5 h-5 shrink-0" />
                )}
                <div className="text-sm">
                  {activeStatus.kind === "rented" && (
                    <>
                      Currently rented on <span className="text-white font-medium">{activeStatus.bill}</span> —
                      due back <span className="text-white font-medium">{formatDate(activeStatus.until)}</span>
                    </>
                  )}
                  {activeStatus.kind === "upcoming" && (
                    <>
                      Available today. Next booking{" "}
                      <span className="text-white font-medium">{activeStatus.bill}</span> starts{" "}
                      <span className="text-white font-medium">{formatDate(activeStatus.from)}</span>
                    </>
                  )}
                  {activeStatus.kind === "available" && (
                    <>Available — no upcoming bookings scheduled.</>
                  )}
                </div>
              </div>
            )}

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-3">
              <StatCell
                icon={PackageCheck}
                label="Bookings"
                value={data.total_bookings}
              />
              <StatCell
                icon={Timer}
                label="Rented days"
                value={data.total_rented_days}
              />
              <StatCell
                icon={TrendingUp}
                label="Total revenue"
                value={formatINR(data.total_revenue)}
              />
            </div>

            {/* Chart */}
            <div>
              <div className="label-eyebrow text-[#DA4FF1] mb-3">
                Monthly revenue · this item
              </div>
              <div style={{ width: "100%", height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={data.series}>
                    <defs>
                      <linearGradient id="stockRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#DA4FF1" stopOpacity={1} />
                        <stop offset="100%" stopColor="#7E2C9A" stopOpacity={1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#3D2A5C" vertical={false} />
                    <XAxis
                      dataKey="month"
                      tickFormatter={monthLabel}
                      stroke="#B097D1"
                      tickLine={false}
                      axisLine={{ stroke: "#3D2A5C" }}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      stroke="#B097D1"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v) =>
                        v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${v / 1000}k` : v
                      }
                    />
                    <Tooltip content={<RevenueTooltip />} cursor={{ fill: "rgba(218,79,241,0.08)" }} />
                    <Bar dataKey="total" fill="url(#stockRev)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bookings list */}
            <div>
              <div className="label-eyebrow text-[#DA4FF1] mb-2">
                Booked date-ranges ({data.bookings.length})
              </div>
              {data.bookings.length === 0 ? (
                <div className="neu-inset px-4 py-6 text-center text-sm text-[#B097D1]">
                  No bookings for this item yet.
                </div>
              ) : (
                <ul className="neu-inset divide-y divide-[#3D2A5C] rounded-2xl">
                  {data.bookings.map((b) => {
                    const overdue = b.status !== "Returned" && (b.return_date || "") < today;
                    const display = overdue ? "Overdue" : b.status;
                    return (
                      <li
                        key={b.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                        data-testid={`schedule-booking-${b.bill_no}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-white">{b.bill_no}</span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full ${statusTone(display)}`}
                            >
                              {display}
                            </span>
                          </div>
                          <div className="text-xs text-[#B097D1] mt-1 truncate">
                            {b.customer?.name} · {b.customer?.phone}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm text-white">
                            {formatDate(b.booking_date)} → {formatDate(b.return_date)}
                          </div>
                          <div className="text-xs text-[#B097D1] mt-0.5">
                            {formatINR(b.rental_amount)}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const StatCell = ({ icon: Icon, label, value }) => (
  <div className="neu-inset px-3 py-3">
    <div className="flex items-center gap-2">
      <Icon className="w-3.5 h-3.5 text-[#DA4FF1]" />
      <span className="label-eyebrow">{label}</span>
    </div>
    <div className="text-lg font-semibold text-white mt-1">{value}</div>
  </div>
);
