import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RefreshCcw,
} from "lucide-react";
import { apiClient, formatApiErrorDetail } from "@/lib/api";
import { formatINR, formatDate, statusTone } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { BookingFormDialog } from "@/components/BookingFormDialog";

const STATUSES = ["all", "Booked", "Delivered", "Returned"];

export default function Bookings() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (status && status !== "all") params.status = status;
      const { data } = await apiClient.get("/bookings", { params });
      setBookings(data);
    } catch (e) {
      toast.error("Could not load bookings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  return (
    <div className="p-6 md:p-8 lg:p-12 max-w-[1500px] mx-auto" data-testid="bookings-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-8">
        <div>
          <div className="label-eyebrow text-[#0A3626]">Rentals</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-[#1C1C1C]">
            Bookings ledger
          </h1>
          <p className="text-sm text-[#4A4A4A] mt-2">
            Every jewellery set that's out, due, or returning home.
          </p>
        </div>
        <Button
          className="bg-[#0A3626] hover:bg-[#134D38] text-white"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          data-testid="new-booking-button"
        >
          <Plus className="w-4 h-4 mr-2" /> New booking
        </Button>
      </div>

      {/* Toolbar */}
      <div className="bg-white border border-[#EAE5D9] rounded-xl p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#737373]" />
          <Input
            placeholder="Search by bill, product, customer name or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 border-[#EAE5D9] focus-visible:ring-[#0A3626]/20 focus-visible:border-[#0A3626]"
            data-testid="bookings-search-input"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-full md:w-48 border-[#EAE5D9]" data-testid="status-filter-trigger">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} data-testid={`status-filter-${s}`}>
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="border-[#EAE5D9]"
          onClick={load}
          data-testid="refresh-button"
        >
          <RefreshCcw className="w-4 h-4" />
        </Button>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#EAE5D9] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="bookings-table">
            <thead className="bg-[#FDFBF7]">
              <tr className="text-left">
                <Th sticky>Bill No</Th>
                <Th>Product</Th>
                <Th>Customer</Th>
                <Th>Booking</Th>
                <Th>Delivery</Th>
                <Th>Return</Th>
                <Th right>Rental</Th>
                <Th right>Total Adv.</Th>
                <Th right>Adv. Paid</Th>
                <Th right>Cust. To Pay</Th>
                <Th right>Refund to Cust.</Th>
                <Th>Status</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-[#737373]">
                    Loading…
                  </td>
                </tr>
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-16">
                    <div className="font-display text-xl text-[#1C1C1C]">
                      No bookings yet
                    </div>
                    <p className="text-sm text-[#737373] mt-1">
                      Create your first rental to see it here.
                    </p>
                  </td>
                </tr>
              ) : (
                bookings.map((b) => {
                  const isOverdue =
                    b.status !== "Returned" && (b.return_date || "") < todayStr;
                  const displayStatus = isOverdue ? "Overdue" : b.status;
                  return (
                    <tr
                      key={b.id}
                      className="border-t border-[#EAE5D9] hover:bg-[#FDFBF7] transition-colors"
                      data-testid={`booking-row-${b.bill_no}`}
                    >
                      <Td sticky>
                        <span className="font-semibold text-[#1C1C1C]">{b.bill_no}</span>
                      </Td>
                      <Td>
                        <div className="font-medium text-[#1C1C1C]">{b.product_code}</div>
                        {b.product_name && (
                          <div className="text-xs text-[#737373]">{b.product_name}</div>
                        )}
                      </Td>
                      <Td>
                        <div className="text-[#1C1C1C]">{b.customer?.name}</div>
                        <div className="text-xs text-[#737373]">{b.customer?.phone}</div>
                      </Td>
                      <Td>{formatDate(b.booking_date)}</Td>
                      <Td>{formatDate(b.delivery_date)}</Td>
                      <Td>
                        <span className={isOverdue ? "text-[#7A1A1E] font-medium" : ""}>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-[#F4EFE3]"
                            onClick={() => {
                              setEditing(b);
                              setDialogOpen(true);
                            }}
                            data-testid={`edit-booking-${b.bill_no}`}
                          >
                            <Pencil className="w-4 h-4 text-[#4A4A4A]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 hover:bg-[#F9EAEB]"
                            onClick={() => setDeleteId(b.id)}
                            data-testid={`delete-booking-${b.bill_no}`}
                          >
                            <Trash2 className="w-4 h-4 text-[#7A1A1E]" />
                          </Button>
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
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent data-testid="delete-confirm-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this booking?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the booking record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#7A1A1E] hover:bg-[#5e1316]"
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

const Th = ({ children, right, sticky }) => (
  <th
    className={`label-eyebrow whitespace-nowrap px-4 py-3 ${
      right ? "text-right" : "text-left"
    } ${sticky ? "sticky left-0 bg-[#FDFBF7]" : ""}`}
  >
    {children}
  </th>
);

const Td = ({ children, right, sticky }) => (
  <td
    className={`px-4 py-3 whitespace-nowrap text-[#4A4A4A] ${
      right ? "text-right" : "text-left"
    } ${sticky ? "sticky left-0 bg-inherit" : ""}`}
  >
    {children}
  </td>
);
