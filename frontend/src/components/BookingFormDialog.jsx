import { useEffect, useState, useMemo, useRef } from "react";
import { toast } from "sonner";
import { Package, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient, API, TOKEN_KEY, formatApiErrorDetail } from "@/lib/api";
import { todayISO } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { PhotoUploader } from "@/components/PhotoUploader";

const empty = () => ({
  bill_no: "",
  branch_id: "",
  stock_id: null,
  stock_photos: [],
  product_code: "",
  product_name: "",
  booking_date: todayISO(),
  delivery_date: todayISO(),
  return_date: todayISO(),
  rental_amount: "",
  total_advance: "",
  advance_paid: "",
  customer_to_be_paid: "",
  return_to_be_paid_to_customer: "",
  status: "Booked",
  notes: "",
  customer: { name: "", phone: "", address: "", id_proof: "" },
});

export const BookingFormDialog = ({ open, onOpenChange, booking, onSaved, branches = [] }) => {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [form, setForm] = useState(empty());
  const [submitting, setSubmitting] = useState(false);
  const [stockQuery, setStockQuery] = useState("");
  const [stockSuggestions, setStockSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [stockPhotosPreview, setStockPhotosPreview] = useState([]);
  const stockDebounce = useRef(null);
  const token = localStorage.getItem(TOKEN_KEY);

  const currentBranchId = form.branch_id || user?.branch_id;

  useEffect(() => {
    if (!open) return;
    if (booking) {
      setForm({
        ...empty(),
        ...booking,
        customer: { ...empty().customer, ...(booking.customer || {}) },
        rental_amount: String(booking.rental_amount ?? ""),
        total_advance: String(booking.total_advance ?? ""),
        advance_paid: String(booking.advance_paid ?? ""),
        customer_to_be_paid: String(booking.customer_to_be_paid ?? ""),
        return_to_be_paid_to_customer: String(booking.return_to_be_paid_to_customer ?? ""),
        bill_no: booking.bill_no || "",
        branch_id: booking.branch_id || "",
        stock_id: booking.stock_id || null,
        stock_photos: booking.stock_photos || [],
      });
      setStockPhotosPreview(booking.stock_photos || []);
      setStockQuery("");
    } else {
      const init = empty();
      if (!isSuper && user?.branch_id) init.branch_id = user.branch_id;
      else if (isSuper && branches.length === 1) init.branch_id = branches[0].id;
      setForm(init);
      setStockPhotosPreview([]);
      setStockQuery("");
    }
  }, [open, booking, isSuper, user?.branch_id, branches]);

  // Stock search
  useEffect(() => {
    if (!open) return;
    if (!currentBranchId) {
      setStockSuggestions([]);
      return;
    }
    if (stockDebounce.current) clearTimeout(stockDebounce.current);
    stockDebounce.current = setTimeout(async () => {
      try {
        const params = { branch_id: currentBranchId };
        if (stockQuery.trim()) params.search = stockQuery.trim();
        const { data } = await apiClient.get("/stock", { params });
        setStockSuggestions(data.slice(0, 8));
      } catch {
        setStockSuggestions([]);
      }
    }, 250);
  }, [stockQuery, currentBranchId, open]);

  const applyStock = (s) => {
    const activePhotos = (s.photos || []).filter((p) => !p.is_deleted);
    setForm((f) => ({
      ...f,
      product_code: s.code,
      product_name: s.name,
      stock_id: s.id,
      stock_photos: activePhotos,
    }));
    setStockPhotosPreview(activePhotos);
    setStockQuery("");
    setShowSuggestions(false);
    toast.success(`Loaded ${s.code} — ${s.name}`);
  };

  const clearStock = () => {
    setForm((f) => ({ ...f, stock_id: null, stock_photos: [] }));
    setStockPhotosPreview([]);
  };

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setC = (key, value) =>
    setForm((f) => ({ ...f, customer: { ...f.customer, [key]: value } }));

  const onSubmit = async (e) => {
    e.preventDefault();
    if (isSuper && !booking && !form.branch_id) {
      toast.error("Please select a branch");
      return;
    }
    setSubmitting(true);
    const payload = {
      ...form,
      bill_no: form.bill_no?.trim() || null,
      branch_id: form.branch_id || null,
      stock_id: form.stock_id || null,
      rental_amount: Number(form.rental_amount || 0),
      total_advance: Number(form.total_advance || 0),
      advance_paid: Number(form.advance_paid || 0),
      customer_to_be_paid: Number(form.customer_to_be_paid || 0),
      return_to_be_paid_to_customer: Number(form.return_to_be_paid_to_customer || 0),
    };
    try {
      if (booking?.id) {
        await apiClient.put(`/bookings/${booking.id}`, payload);
        toast.success("Booking updated");
      } else {
        await apiClient.post("/bookings", payload);
        toast.success("Booking created");
      }
      onSaved?.();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || "Save failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="neu max-w-3xl max-h-[90vh] overflow-y-auto border-0 text-[#F0E6FF]"
        data-testid="booking-form-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-white">
            {booking ? "Edit booking" : "New booking"}
          </DialogTitle>
          <DialogDescription className="text-[#B097D1]">
            {booking
              ? "Update the rental record details."
              : "Add a new jewellery rental booking. Bill No is auto-generated per branch if blank."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6 mt-2">
          <Section title="Booking">
            {isSuper && !booking && (
              <Field label="Branch" required>
                <select
                  required
                  value={form.branch_id}
                  onChange={(e) => set("branch_id", e.target.value)}
                  className="neu-input w-full px-3 py-2.5 text-sm"
                  data-testid="form-branch-select"
                >
                  <option value="">Select branch</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field
              label="Load from stock"
              full
              hint="Type a stock code or name to auto-fill the item and copy its photos onto this bill"
            >
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B097D1] z-10" />
                    <input
                      value={stockQuery}
                      onChange={(e) => {
                        setStockQuery(e.target.value);
                        setShowSuggestions(true);
                      }}
                      onFocus={() => setShowSuggestions(true)}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder={currentBranchId ? "Search stock code or name…" : "Choose a branch first"}
                      disabled={!currentBranchId}
                      className="neu-input w-full pl-10 pr-3 py-2.5 text-sm disabled:opacity-50"
                      data-testid="form-stock-search"
                    />
                  </div>
                  {form.stock_id && (
                    <button
                      type="button"
                      onClick={clearStock}
                      className="neu-btn px-3 py-2 text-xs inline-flex items-center gap-1"
                      data-testid="form-stock-clear"
                    >
                      <X className="w-3 h-3" /> Unlink
                    </button>
                  )}
                </div>
                {showSuggestions && stockSuggestions.length > 0 && (
                  <div
                    className="absolute z-20 top-full left-0 right-0 mt-1 neu-sm max-h-64 overflow-y-auto"
                    data-testid="form-stock-suggestions"
                  >
                    {stockSuggestions.map((s) => {
                      const cover = (s.photos || []).find((p) => !p.is_deleted);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => applyStock(s)}
                          className="w-full px-3 py-2 flex items-center gap-3 hover:bg-[#352051] text-left transition-colors"
                          data-testid={`form-stock-option-${s.code}`}
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-[#261538] shrink-0 flex items-center justify-center">
                            {cover ? (
                              <img
                                src={`${API}/files/${cover.id}?auth=${token}`}
                                alt={s.name}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Package className="w-4 h-4 text-[#5A3D85]" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-white truncate">
                              <span className="font-mono">{s.code}</span> · {s.name}
                            </div>
                            {s.description && (
                              <div className="text-[11px] text-[#B097D1] truncate">
                                {s.description}
                              </div>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </Field>
            {stockPhotosPreview.length > 0 && (
              <Field label={`Linked stock photos (${stockPhotosPreview.length})`} full>
                <div className="flex gap-2 flex-wrap">
                  {stockPhotosPreview.slice(0, 5).map((p) => (
                    <div
                      key={p.id}
                      className="w-16 h-16 rounded-lg overflow-hidden neu-inset"
                      data-testid={`form-stock-photo-${p.id}`}
                    >
                      <img
                        src={`${API}/files/${p.id}?auth=${token}`}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ))}
                </div>
              </Field>
            )}
            <Field label="Bill No" hint={
              currentBranchId && branches.length > 0
                ? `Leave blank for auto: ${(branches.find(b => b.id === currentBranchId)?.code) || "BRANCH"}-####`
                : "Leave blank for auto-generation with branch prefix"
            }>
              <input
                value={form.bill_no}
                onChange={(e) => set("bill_no", e.target.value)}
                placeholder={
                  currentBranchId && branches.length > 0
                    ? `Auto (${(branches.find(b => b.id === currentBranchId)?.code) || "BRANCH"}-####)`
                    : "Auto"
                }
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-bill-no"
              />
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-status-trigger"
              >
                <option value="Booked">Booked</option>
                <option value="Delivered">Delivered</option>
                <option value="Returned">Returned</option>
              </select>
            </Field>
            <Field label="Product Code" required>
              <input
                required
                value={form.product_code}
                onChange={(e) => set("product_code", e.target.value)}
                placeholder="e.g. JS-001"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-product-code"
              />
            </Field>
            <Field label="Product Name">
              <input
                value={form.product_name}
                onChange={(e) => set("product_name", e.target.value)}
                placeholder="Polki Bridal Set"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-product-name"
              />
            </Field>
            <Field label="Booking Date" required>
              <input
                type="date"
                required
                value={form.booking_date}
                onChange={(e) => set("booking_date", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-booking-date"
              />
            </Field>
            <Field label="Delivery Date" required>
              <input
                type="date"
                required
                value={form.delivery_date}
                onChange={(e) => set("delivery_date", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-delivery-date"
              />
            </Field>
            <Field label="Return Date" required>
              <input
                type="date"
                required
                value={form.return_date}
                onChange={(e) => set("return_date", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-return-date"
              />
            </Field>
          </Section>

          <Section title="Amounts (₹)">
            <Field label="Rental Amount">
              <input
                type="number"
                value={form.rental_amount}
                onChange={(e) => set("rental_amount", e.target.value)}
                placeholder="0"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-rental-amount"
              />
            </Field>
            <Field label="Total Advance Amount">
              <input
                type="number"
                value={form.total_advance}
                onChange={(e) => set("total_advance", e.target.value)}
                placeholder="0"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-total-advance"
              />
            </Field>
            <Field label="Advance Paid">
              <input
                type="number"
                value={form.advance_paid}
                onChange={(e) => set("advance_paid", e.target.value)}
                placeholder="0"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-advance-paid"
              />
            </Field>
            <Field label="Customer To Be Paid" hint="Balance customer owes you">
              <input
                type="number"
                value={form.customer_to_be_paid}
                onChange={(e) => set("customer_to_be_paid", e.target.value)}
                placeholder="0"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-customer-to-be-paid"
              />
            </Field>
            <Field label="Return To Be Paid To Customer" hint="Refundable deposit / overpayment">
              <input
                type="number"
                value={form.return_to_be_paid_to_customer}
                onChange={(e) =>
                  set("return_to_be_paid_to_customer", e.target.value)
                }
                placeholder="0"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-return-to-customer"
              />
            </Field>
          </Section>

          <Section title="Customer">
            <Field label="Name" required>
              <input
                required
                value={form.customer.name}
                onChange={(e) => setC("name", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-customer-name"
              />
            </Field>
            <Field label="Phone" required>
              <input
                required
                value={form.customer.phone}
                onChange={(e) => setC("phone", e.target.value)}
                placeholder="+91 …"
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-customer-phone"
              />
            </Field>
            <Field label="Address" full>
              <textarea
                rows={2}
                value={form.customer.address}
                onChange={(e) => setC("address", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm resize-none"
                data-testid="form-customer-address"
              />
            </Field>
            <Field label="ID Proof" full hint="Aadhaar / PAN / DL number">
              <input
                value={form.customer.id_proof}
                onChange={(e) => setC("id_proof", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="form-customer-id-proof"
              />
            </Field>
          </Section>

          <Section title="Notes">
            <Field label="Internal notes" full>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className="neu-input w-full px-3 py-2.5 text-sm resize-none"
                data-testid="form-notes"
              />
            </Field>
          </Section>

          {booking?.id && (
            <Section title="Jewellery photos">
              <div className="sm:col-span-2">
                <PhotoUploader
                  bookingId={booking.id}
                  photos={booking.photos || []}
                  onChange={() => { /* parent reloads on save */ }}
                />
              </div>
            </Section>
          )}

          <DialogFooter className="pt-2 gap-2">
            <button
              type="button"
              className="neu-btn px-5 py-2.5 text-sm"
              onClick={() => onOpenChange(false)}
              data-testid="form-cancel"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="neu-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
              data-testid="form-submit"
            >
              {submitting ? "Saving…" : booking ? "Update booking" : "Create booking"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Section = ({ title, children }) => (
  <div>
    <div className="label-eyebrow text-[#DA4FF1] mb-3">{title}</div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const Field = ({ label, hint, required, full, children }) => (
  <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
    <label className="label-eyebrow block">
      {label}
      {required && <span className="text-[#FDB3C0] ml-1">*</span>}
    </label>
    {children}
    {hint && <div className="text-[11px] text-[#B097D1]">{hint}</div>}
  </div>
);
