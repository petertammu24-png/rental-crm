import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  RefreshCcw,
  Plus,
  Pencil,
  Trash2,
  History,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatDate } from "@/lib/format";

const ACTIONS = ["all", "create", "update", "delete"];
const ENTITIES = ["all", "booking", "user", "branch", "photo"];

const actionTone = (action) => {
  switch (action) {
    case "create":
      return "bg-[#22463A] text-[#A6E8C9] border border-[#3A6E58]";
    case "update":
      return "bg-[#3A2A5E] text-[#E9CFFD] border border-[#5A3D85]";
    case "delete":
      return "bg-[#5C1F2C] text-[#FDB3C0] border border-[#7E2C3E]";
    default:
      return "bg-[#3A2A5E] text-[#E9CFFD] border border-[#5A3D85]";
  }
};

const ActionIcon = ({ action }) => {
  const cls = "w-3.5 h-3.5";
  if (action === "create") return <Plus className={cls} />;
  if (action === "update") return <Pencil className={cls} />;
  if (action === "delete") return <Trash2 className={cls} />;
  return <History className={cls} />;
};

const formatDateTime = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};

export default function AuditLog() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [entity, setEntity] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  const branchMap = useMemo(() => {
    const m = {};
    branches.forEach((b) => (m[b.id] = b));
    return m;
  }, [branches]);

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 200 };
      if (search.trim()) params.search = search.trim();
      if (action !== "all") params.action = action;
      if (entity !== "all") params.entity_type = entity;
      if (isSuper && branchFilter !== "all") params.branch_id = branchFilter;
      const { data } = await apiClient.get("/audit", { params });
      setItems(data);
    } catch (e) {
      toast.error("Could not load audit log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiClient.get("/branches").then((r) => setBranches(r.data)).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, entity, branchFilter]);

  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className="p-6 md:p-8 lg:p-10 max-w-[1500px] mx-auto" data-testid="audit-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">Accountability</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-white">Audit log</h1>
          <p className="text-sm text-[#B097D1] mt-2">
            Every create, update and delete — who did it, when, and to what.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="neu-sm p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B097D1] z-10" />
          <input
            placeholder="Search by user or summary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="neu-input w-full pl-10 pr-4 py-2.5 text-sm"
            data-testid="audit-search-input"
          />
        </div>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="neu-input w-full md:w-40 px-3 py-2.5 text-sm"
          data-testid="audit-action-filter"
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a === "all" ? "All actions" : a}
            </option>
          ))}
        </select>
        <select
          value={entity}
          onChange={(e) => setEntity(e.target.value)}
          className="neu-input w-full md:w-44 px-3 py-2.5 text-sm"
          data-testid="audit-entity-filter"
        >
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e === "all" ? "All types" : e}
            </option>
          ))}
        </select>
        {isSuper && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="neu-input w-full md:w-48 px-3 py-2.5 text-sm"
            data-testid="audit-branch-filter"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        )}
        <button
          className="neu-btn w-11 h-11 flex items-center justify-center shrink-0"
          onClick={load}
          data-testid="audit-refresh"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="neu-sm p-10 text-center text-[#B097D1]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="neu-sm p-12 text-center" data-testid="audit-empty">
          <History className="w-10 h-10 mx-auto text-[#DA4FF1] mb-3" />
          <div className="font-display text-xl text-white">No activity yet</div>
          <p className="text-sm text-[#B097D1] mt-1">
            Once people start creating bookings, you'll see the trail here.
          </p>
        </div>
      ) : (
        <div className="neu-sm overflow-hidden" data-testid="audit-list">
          <ul className="divide-y divide-[#3D2A5C]">
            {items.map((e) => {
              const br = branchMap[e.branch_id];
              return (
                <li
                  key={e.id}
                  className="px-5 py-4 flex items-start gap-4 hover:bg-[#352051] transition-colors"
                  data-testid={`audit-row-${e.id}`}
                >
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${actionTone(
                      e.action,
                    )}`}
                  >
                    <ActionIcon action={e.action} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${actionTone(
                          e.action,
                        )}`}
                      >
                        {e.action}
                      </span>
                      <span className="text-[10px] uppercase tracking-widest text-[#B097D1]">
                        {e.entity_type}
                      </span>
                      {br && (
                        <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#22463A] text-[#A6E8C9]">
                          {br.code}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-white mt-1">{e.summary}</div>
                    <div className="text-xs text-[#B097D1] mt-1">
                      {e.user_name || e.user_email}
                      {e.user_email && e.user_name ? ` · ${e.user_email}` : ""}
                    </div>
                  </div>
                  <div className="text-right text-xs text-[#B097D1] shrink-0">
                    {formatDateTime(e.created_at)}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
