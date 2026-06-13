import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, RefreshCcw, Download, FileText } from "lucide-react";
import { apiClient, formatApiErrorDetail } from "@/lib/api";
import { formatINR, formatDate, statusTone } from "@/lib/format";
import { downloadCSV } from "@/lib/csv";
import { useAuth } from "@/context/AuthContext";
import { BookingFormDialog } from "@/components/BookingFormDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUSES = ["all", "Booked", "Delivered", "Returned"];

export default function Bookings() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const canEdit = user?.role === "super_admin" || user?.role === "manager";

  const [bookings, setBookings] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (status !== "all") params.status = status;
      if (isSuper && branchFilter !== "all") params.branch_id = branchFilter;
      const { data } = await apiClient.get("/bookings", { params });
      setBookings(data);
    } catch (e) {
      toast.error("Could not load bookings");
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
  }, [status, branchFilter]);

  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const branchMap = useMemo(() => {
    const m = {};
    branches.forEach((b) => (m[b.id] = b));
    return m;
  }, [branches]);

  const handleSaved = () => {
    setDialogOpen(false);
    setEditing(null);
    load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await apiClient.delete(`/bookings/${deleteId}`);
      toast.success("Booking deleted");
      setDeleteId(null);
      load();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail));
    }
  };

  const handleExportCSV = () => {
    if (bookings.length === 0) {
      toast.info("Nothing to export");
      return;
    }
    const rows = bookings.map((b) => ({
      "Bill No": b.bill_no,
      Branch: branchMap[b.branch_id]?.code || "",
      "Product Code": b.product_code,
      "Product Name": b.product_name || "",
      "Customer Name": b.customer?.name || "",
      "Customer Phone": b.customer?.phone || "",
      "Customer Address": b.customer?.address || "",
      "ID Proof": b.customer?.id_proof || "",
      "Booking Date": b.booking_date,
      "Delivery Date": b.delivery_date,
      "Return Date": b.return_date,
      "Rental Amount": b.rental_amount,
      "Total Advance": b.total_advance,
      "Advance Paid": b.advance_paid,
      "Customer To Be Paid": b.customer_to_be_paid,
      "Refund To Customer": b.return_to_be_paid_to_customer,
      Status: b.status,
      Notes: b.notes || "",
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCSV(`bookings-${stamp}.csv`, rows);
    toast.success(`Exported ${rows.length} bookings`);
  };

  return (
    <div className="p-6 md:p-8 lg:p-10 max-w-[1600px] mx-auto" data-testid="bookings-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">Rentals</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-white">
            Bookings ledger
          </h1>
          <p className="text-sm text-[#B097D1] mt-2">
            Every jewellery set that's out, due, or returning home.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className="neu-btn px-4 py-3 text-sm font-medium inline-flex items-center gap-2"
            onClick={handleExportCSV}
            data-testid="export-csv-button"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button
            className="neu-btn-primary px-5 py-3 text-sm font-semibold inline-flex items-center gap-2"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            data-testid="new-booking-button"
          >
            <Plus className="w-4 h-4" /> New booking
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="neu-sm p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B097D1] z-10" />
          <input
            placeholder="Search by bill, product, customer name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="neu-input w-full pl-10 pr-4 py-2.5 text-sm"
            data-testid="bookings-search-input"
          />
        </div>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="neu-input w-full md:w-44 px-3 py-2.5 text-sm"
          data-testid="status-filter-trigger"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === "all" ? "All statuses" : s}
            </option>
          ))}
        </select>
        {isSuper && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="neu-input w-full md:w-48 px-3 py-2.5 text-sm"
            data-testid="bookings-branch-filter"
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
          data-testid="refresh-button"
        >
          <RefreshCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      <div className="neu-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="bookings-table">
            <thead>
              <tr className="text-left bg-[#261538]">
                <Th>Bill No</Th>
                {isSuper && <Th>Branch</Th>}
                <Th>Product</Th>
                <Th>Customer</Th>
                <Th>Booking</Th>
                <Th>Delivery</Th>
                <Th>Return</Th>
                <Th right>Rental</Th>
                <Th right>Adv. Total</Th>
                <Th right>Adv. Paid</Th>
                <Th right>Cust. To Pay</Th>
                <Th right>Refund</Th>
                <Th>Status</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={isSuper ? 14 : 13} className="text-center py-12 text-[#B097D1]">
                    Loading…
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={isSuper ? 14 : 13} className="text-center py-16">
                    <div className="font-display text-xl text-white">No bookings yet</div>
                    <p className="text-sm text-[#B097D1] mt-1">
                      Create your first rental to see it here.
                    </p>
                  </td>
                </tr>
              ) : (
                bookings.map((b) => {
                  const isOverdue =
                    b.status !== "Returned" && (b.return_date || "") < todayStr;
                  const displayStatus = isOverdue ? "Overdue" : b.status;
                  const br = branchMap[b.branch_id];
                  return (
                    <tr
                      key={b.id}
                      className="border-t border-[#3D2A5C] hover:bg-[#352051] transition-colors"
                      data-testid={`booking-row-${b.bill_no}`}
                    >
                      <Td>
                        <span className="font-semibold text-white">{b.bill_no}</span>
                      </Td>
                      {isSuper && (
                        <Td>
                          <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#22463A] text-[#A6E8C9]">
                            {br?.code || "—"}
                          </span>
                        </Td>
                      )}
                      <Td>
                        <div className="font-medium text-white">{b.product_code}</div>
                        {b.product_name && (
                          <div className="text-xs text-[#B097D1]">{b.product_name}</div>
                        )}
                      </Td>
                      <Td>
                        <div className="text-white">{b.customer?.name}</div>
                        <div className="text-xs text-[#B097D1]">{b.customer?.phone}</div>
                      </Td>
                      <Td>{formatDate(b.booking_date)}</Td>
                      <Td>{formatDate(b.delivery_date)}</Td>
                      <Td>
                        <span className={isOverdue ? "text-[#FDB3C0] font-medium" : ""}>
                          {formatDate(b.return_date)}
                        </span>
                      </Td>
                      <Td right>{formatINR(b.rental_amount)}</Td>
                      <Td right>{formatINR(b.total_advance)}</Td>
                      <Td right>{formatINR(b.advance_paid)}</Td>
                      <Td right>{formatINR(b.customer_to_be_paid)}</Td>
                      <Td right>{formatINR(b.return_to_be_paid_to_customer)}</Td>
                      <Td>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusTone(
                            displayStatus,
                          )}`}
                          data-testid={`status-badge-${b.bill_no}`}
                        >
                          {displayStatus}
                        </span>
                      </Td>
                      <Td right>
                        <div className="flex justify-end gap-1">
                          <Link
                            to={`/invoice/${b.id}`}
                            className="neu-btn w-8 h-8 flex items-center justify-center rounded-lg"
                            data-testid={`invoice-booking-${b.bill_no}`}
                            title="Print invoice"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Link>
                          {canEdit && (
                            <button
                              className="neu-btn w-8 h-8 flex items-center justify-center rounded-lg"
                              onClick={() => {
                                setEditing(b);
                                setDialogOpen(true);
                              }}
                              data-testid={`edit-booking-${b.bill_no}`}
                              title="Edit"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              className="neu-btn w-8 h-8 flex items-center justify-center rounded-lg text-[#FDB3C0]"
                              onClick={() => setDeleteId(b.id)}
                              data-testid={`delete-booking-${b.bill_no}`}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <BookingFormDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditing(null);
        }}
        booking={editing}
        onSaved={handleSaved}
        branches={branches}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent
          className="neu border-0 text-[#F0E6FF]"
          data-testid="delete-confirm-dialog"
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-white">
              Delete this booking?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#B097D1]">
              This will permanently remove the booking record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="neu-btn border-0 text-[#E9DEFE] hover:text-white"
              data-testid="delete-cancel"
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-gradient-to-r from-[#7E2C3E] to-[#E04F6B] text-white hover:opacity-90"
              onClick={handleDelete}
              data-testid="delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
