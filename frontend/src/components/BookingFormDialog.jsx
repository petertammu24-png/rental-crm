import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, formatApiErrorDetail } from "@/lib/api";
import { todayISO } from "@/lib/format";

const empty = () => ({
  bill_no: "",
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

export const BookingFormDialog = ({ open, onOpenChange, booking, onSaved }) => {
  const [form, setForm] = useState(empty());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (booking) {
        setForm({
          ...empty(),
          ...booking,
          customer: { ...empty().customer, ...(booking.customer || {}) },
          rental_amount: String(booking.rental_amount ?? ""),
          total_advance: String(booking.total_advance ?? ""),
          advance_paid: String(booking.advance_paid ?? ""),
          customer_to_be_paid: String(booking.customer_to_be_paid ?? ""),
          return_to_be_paid_to_customer: String(
            booking.return_to_be_paid_to_customer ?? "",
          ),
          bill_no: booking.bill_no || "",
        });
      } else {
        setForm(empty());
      }
    }
  }, [open, booking]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const setC = (key, value) =>
    setForm((f) => ({ ...f, customer: { ...f.customer, [key]: value } }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    const payload = {
      ...form,
      bill_no: form.bill_no?.trim() || null,
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
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="booking-form-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            {booking ? "Edit booking" : "New booking"}
          </DialogTitle>
          <DialogDescription>
            {booking
              ? "Update the rental record details."
              : "Add a new jewellery rental booking. Bill No is auto-generated if left blank."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-6 mt-2">
          {/* Booking details */}
          <Section title="Booking">
            <Field label="Bill No" hint="Leave blank for auto-generation">
              <Input
                value={form.bill_no}
                onChange={(e) => set("bill_no", e.target.value)}
                placeholder="Auto"
                data-testid="form-bill-no"
              />
            </Field>
            <Field label="Status">
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger data-testid="form-status-trigger">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Booked">Booked</SelectItem>
                  <SelectItem value="Delivered">Delivered</SelectItem>
                  <SelectItem value="Returned">Returned</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Product Code" required>
              <Input
                required
                value={form.product_code}
                onChange={(e) => set("product_code", e.target.value)}
                placeholder="e.g. JS-001"
                data-testid="form-product-code"
              />
            </Field>
            <Field label="Product Name">
              <Input
                value={form.product_name}
                onChange={(e) => set("product_name", e.target.value)}
                placeholder="Polki Bridal Set"
                data-testid="form-product-name"
              />
            </Field>
            <Field label="Booking Date" required>
              <Input
                type="date"
                required
                value={form.booking_date}
                onChange={(e) => set("booking_date", e.target.value)}
                data-testid="form-booking-date"
              />
            </Field>
            <Field label="Delivery Date" required>
              <Input
                type="date"
                required
                value={form.delivery_date}
                onChange={(e) => set("delivery_date", e.target.value)}
                data-testid="form-delivery-date"
              />
            </Field>
            <Field label="Return Date" required>
              <Input
                type="date"
                required
                value={form.return_date}
                onChange={(e) => set("return_date", e.target.value)}
                data-testid="form-return-date"
              />
            </Field>
          </Section>

          {/* Amounts */}
          <Section title="Amounts (₹)">
            <Field label="Rental Amount">
              <Input
                type="number"
                inputMode="decimal"
                value={form.rental_amount}
                onChange={(e) => set("rental_amount", e.target.value)}
                placeholder="0"
                data-testid="form-rental-amount"
              />
            </Field>
            <Field label="Total Advance Amount">
              <Input
                type="number"
                value={form.total_advance}
                onChange={(e) => set("total_advance", e.target.value)}
                placeholder="0"
                data-testid="form-total-advance"
              />
            </Field>
            <Field label="Advance Paid">
              <Input
                type="number"
                value={form.advance_paid}
                onChange={(e) => set("advance_paid", e.target.value)}
                placeholder="0"
                data-testid="form-advance-paid"
              />
            </Field>
            <Field label="Customer To Be Paid" hint="Balance customer owes you">
              <Input
                type="number"
                value={form.customer_to_be_paid}
                onChange={(e) => set("customer_to_be_paid", e.target.value)}
                placeholder="0"
                data-testid="form-customer-to-be-paid"
              />
            </Field>
            <Field
              label="Return To Be Paid To Customer"
              hint="Refundable deposit / overpayment"
            >
              <Input
                type="number"
                value={form.return_to_be_paid_to_customer}
                onChange={(e) =>
                  set("return_to_be_paid_to_customer", e.target.value)
                }
                placeholder="0"
                data-testid="form-return-to-customer"
              />
            </Field>
          </Section>

          {/* Customer */}
          <Section title="Customer">
            <Field label="Name" required>
              <Input
                required
                value={form.customer.name}
                onChange={(e) => setC("name", e.target.value)}
                data-testid="form-customer-name"
              />
            </Field>
            <Field label="Phone" required>
              <Input
                required
                value={form.customer.phone}
                onChange={(e) => setC("phone", e.target.value)}
                placeholder="+91 …"
                data-testid="form-customer-phone"
              />
            </Field>
            <Field label="Address" full>
              <Textarea
                rows={2}
                value={form.customer.address}
                onChange={(e) => setC("address", e.target.value)}
                data-testid="form-customer-address"
              />
            </Field>
            <Field label="ID Proof" full hint="Aadhaar / PAN / DL number">
              <Input
                value={form.customer.id_proof}
                onChange={(e) => setC("id_proof", e.target.value)}
                data-testid="form-customer-id-proof"
              />
            </Field>
          </Section>

          <Section title="Notes">
            <Field label="Internal notes" full>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                data-testid="form-notes"
              />
            </Field>
          </Section>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              className="border-[#EAE5D9]"
              onClick={() => onOpenChange(false)}
              data-testid="form-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="bg-[#0A3626] hover:bg-[#134D38] text-white"
              data-testid="form-submit"
            >
              {submitting ? "Saving…" : booking ? "Update booking" : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const Section = ({ title, children }) => (
  <div>
    <div className="label-eyebrow text-[#0A3626] mb-3">{title}</div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
  </div>
);

const Field = ({ label, hint, required, full, children }) => (
  <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
    <Label className="text-xs tracking-[0.15em] uppercase text-[#737373]">
      {label}
      {required && <span className="text-[#7A1A1E] ml-1">*</span>}
    </Label>
    {children}
    {hint && <div className="text-[11px] text-[#737373]">{hint}</div>}
  </div>
);
