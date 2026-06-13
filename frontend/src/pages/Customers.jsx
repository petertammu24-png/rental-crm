import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { Search, Eye, Phone, MapPin, ScrollText } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { formatINR, formatDate, statusTone } from "@/lib/format";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Link } from "react-router-dom";

export default function Customers() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const [customers, setCustomers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  const branchMap = useMemo(() => {
    const m = {};
    branches.forEach((b) => (m[b.id] = b));
    return m;
  }, [branches]);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (isSuper && branchFilter !== "all") params.branch_id = branchFilter;
      const { data } = await apiClient.get("/customers", { params });
      setCustomers(data);
    } catch (e) {
      toast.error("Could not load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiClient.get("/branches").then((r) => setBranches(r.data)).catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, branchFilter]);

  return (
    <div className="p-6 md:p-8 lg:p-10 max-w-[1500px] mx-auto" data-testid="customers-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">Master list</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-white">Customers</h1>
          <p className="text-sm text-[#B097D1] mt-2">
            Every patron who's rented from you, grouped across bookings.
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="neu-sm p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B097D1] z-10" />
          <input
            placeholder="Search by customer name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="neu-input w-full pl-10 pr-4 py-2.5 text-sm"
            data-testid="customers-search-input"
          />
        </div>
        {isSuper && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="neu-input w-full md:w-52 px-3 py-2.5 text-sm"
            data-testid="customers-branch-filter"
          >
            <option value="all">All branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="neu-sm p-10 text-center text-[#B097D1]">Loading…</div>
      ) : customers.length === 0 ? (
        <div className="neu-sm p-12 text-center" data-testid="customers-empty">
          <ScrollText className="w-10 h-10 mx-auto text-[#DA4FF1] mb-3" />
          <div className="font-display text-xl text-white">No customers yet</div>
          <p className="text-sm text-[#B097D1] mt-1">
            Customers will appear here as you add bookings.
          </p>
        </div>
      ) : (
        <div className="neu-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="customers-table">
              <thead className="bg-[#261538]">
                <tr className="text-left">
                  <Th>Customer</Th>
                  <Th>Phone</Th>
                  <Th right>Bookings</Th>
                  <Th right>Total Rental</Th>
                  <Th right>Adv. Paid</Th>
                  <Th right>To Collect</Th>
                  <Th right>To Refund</Th>
                  <Th>Last Booking</Th>
                  <Th>Branches</Th>
                  <Th right>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.phone}
                    className="border-t border-[#3D2A5C] hover:bg-[#352051]"
                    data-testid={`customer-row-${c.phone}`}
                  >
                    <Td>
                      <div className="text-white font-medium">{c.name || "—"}</div>
                      {c.id_proof && (
                        <div className="text-xs text-[#B097D1]">ID: {c.id_proof}</div>
                      )}
                    </Td>
                    <Td>{c.phone}</Td>
                    <Td right>
                      <span className="text-white font-medium">{c.total_bookings}</span>
                    </Td>
                    <Td right>{formatINR(c.total_rental)}</Td>
                    <Td right>{formatINR(c.total_advance_paid)}</Td>
                    <Td right>
                      <span className={c.outstanding_to_collect > 0 ? "text-[#FFD679]" : ""}>
                        {formatINR(c.outstanding_to_collect)}
                      </span>
                    </Td>
                    <Td right>
                      <span className={c.outstanding_to_refund > 0 ? "text-[#FDB3C0]" : ""}>
                        {formatINR(c.outstanding_to_refund)}
                      </span>
                    </Td>
                    <Td>{formatDate(c.last_booking_date)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {c.branch_ids.map((bid) => (
                          <span
                            key={bid}
                            className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#22463A] text-[#A6E8C9]"
                          >
                            {branchMap[bid]?.code || "—"}
                          </span>
                        ))}
                      </div>
                    </Td>
                    <Td right>
                      <button
                        className="neu-btn w-8 h-8 flex items-center justify-center"
                        onClick={() => setActive(c)}
                        data-testid={`view-customer-${c.phone}`}
                        title="View history"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Customer detail dialog */}
      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent
          className="neu max-w-3xl max-h-[90vh] overflow-y-auto border-0 text-[#F0E6FF]"
          data-testid="customer-detail-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-white">
              {active?.name || "Customer"}
            </DialogTitle>
            <DialogDescription className="text-[#B097D1]">
              Full booking history across branches.
            </DialogDescription>
          </DialogHeader>

          {active && (
            <div className="space-y-5 mt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="neu-inset px-4 py-3">
                  <div className="label-eyebrow flex items-center gap-2">
                    <Phone className="w-3 h-3" /> Phone
                  </div>
                  <div className="text-sm text-white mt-1">{active.phone}</div>
                </div>
                {active.address && (
                  <div className="neu-inset px-4 py-3">
                    <div className="label-eyebrow flex items-center gap-2">
                      <MapPin className="w-3 h-3" /> Address
                    </div>
                    <div className="text-sm text-white mt-1">{active.address}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Bookings" value={active.total_bookings} />
                <Stat label="Total Rental" value={formatINR(active.total_rental)} />
                <Stat
                  label="To Collect"
                  value={formatINR(active.outstanding_to_collect)}
                />
                <Stat
                  label="To Refund"
                  value={formatINR(active.outstanding_to_refund)}
                />
              </div>

              <div>
                <div className="label-eyebrow text-[#DA4FF1] mb-2">Bookings</div>
                <div className="neu-inset divide-y divide-[#3D2A5C] rounded-2xl">
                  {active.bookings.map((b) => (
                    <Link
                      to={`/invoice/${b.id}`}
                      key={b.id}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-[#2E1C46] transition-colors"
                      data-testid={`customer-booking-${b.bill_no}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white">{b.bill_no}</span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${statusTone(
                              b.status,
                            )}`}
                          >
                            {b.status}
                          </span>
                          {branchMap[b.branch_id] && (
                            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#22463A] text-[#A6E8C9]">
                              {branchMap[b.branch_id].code}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#B097D1] mt-1 truncate">
                          {b.product_code} {b.product_name ? `• ${b.product_name}` : ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm text-white">{formatINR(b.rental_amount)}</div>
                        <div className="text-[11px] text-[#B097D1]">
                          {formatDate(b.booking_date)} → {formatDate(b.return_date)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Th = ({ children, right }) => (
  <th
    className={`label-eyebrow whitespace-nowrap px-4 py-3 ${
      right ? "text-right" : "text-left"
    }`}
  >
    {children}
  </th>
);

const Td = ({ children, right }) => (
  <td
    className={`px-4 py-3 whitespace-nowrap text-[#D9CDF0] ${
      right ? "text-right" : "text-left"
    }`}
  >
    {children}
  </td>
);

const Stat = ({ label, value }) => (
  <div className="neu-inset px-3 py-3">
    <div className="label-eyebrow">{label}</div>
    <div className="text-base font-semibold text-white mt-1">{value}</div>
  </div>
);
