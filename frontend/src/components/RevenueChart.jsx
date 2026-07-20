import { useEffect, useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import { apiClient } from "@/lib/api";
import { formatINR } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

const BRANCH_COLORS = ["#DA4FF1", "#5BC79A", "#FFD679", "#7CB7FF", "#FF8DA1", "#C39BFF"];

const monthLabel = (key) => {
  // key is "YYYY-MM"
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

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="neu-sm px-3 py-2 text-xs" style={{ background: "#2E1C46" }}>
      <div className="font-semibold text-white mb-1">{monthLabel(label)}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[#D9CDF0]">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{ background: p.fill }}
          />
          <span>{p.dataKey}:</span>
          <span className="text-white font-medium">{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export const RevenueChart = ({ branchFilter }) => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const isSuper = user?.role === "super_admin";

  useEffect(() => {
    const params = { months: 12 };
    if (isSuper && branchFilter && branchFilter !== "all") {
      params.branch_id = branchFilter;
    }
    apiClient
      .get("/stats/revenue", { params })
      .then((r) => setData(r.data))
      .catch(() => setData({ series: [], branch_codes: [] }));
  }, [branchFilter, isSuper]);

  const codes = useMemo(() => data?.branch_codes || [], [data]);
  const showStacks = isSuper && (!branchFilter || branchFilter === "all") && codes.length > 1;

  return (
    <div className="neu-sm p-5" data-testid="revenue-chart">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">Revenue trend</div>
          <h3 className="font-display text-xl text-white mt-1">Last 12 months</h3>
        </div>
        <div className="text-xs text-[#B097D1]">
          {showStacks ? "Stacked by branch" : "Total rental booked"}
        </div>
      </div>
      <div style={{ width: "100%", height: 280 }}>
        {!data ? (
          <div className="h-full flex items-center justify-center text-sm text-[#B097D1]">
            Loading chart…
          </div>
        ) : (
          <ResponsiveContainer>
            <BarChart data={data.series}>
              <defs>
                <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
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
                tickFormatter={(v) => (v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${v / 1000}k` : v)}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(218,79,241,0.08)" }} />
              {showStacks ? (
                <>
                  <Legend wrapperStyle={{ fontSize: 11, color: "#D9CDF0" }} />
                  {codes.map((c, i) => (
                    <Bar
                      key={c}
                      dataKey={c}
                      stackId="branches"
                      fill={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                      radius={i === codes.length - 1 ? [6, 6, 0, 0] : 0}
                    />
                  ))}
                </>
              ) : (
                <Bar dataKey="total" fill="url(#totalGrad)" radius={[6, 6, 0, 0]} />
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
