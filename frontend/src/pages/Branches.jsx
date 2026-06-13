import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Building2, Pencil, Trash2 } from "lucide-react";
import { apiClient, formatApiErrorDetail } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const emptyBranch = () => ({ name: "", code: "", address: "", phone: "" });

export default function Branches() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyBranch());
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/branches");
      setItems(data);
    } catch (e) {
      toast.error("Could not load branches");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(emptyBranch());
    setOpen(true);
  };
  const openEdit = (b) => {
    setEditing(b);
    setForm({ name: b.name, code: b.code, address: b.address || "", phone: b.phone || "" });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
      };
      if (editing) {
        await apiClient.put(`/branches/${editing.id}`, payload);
        toast.success("Branch updated");
      } else {
        await apiClient.post("/branches", payload);
        toast.success("Branch created");
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await apiClient.delete(`/branches/${deleteId}`);
      toast.success("Branch deleted");
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-8 lg:p-10 max-w-[1300px] mx-auto" data-testid="branches-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">Locations</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-white">Branches</h1>
          <p className="text-sm text-[#B097D1] mt-2">
            Each branch has its own bill-number sequence and isolated bookings.
          </p>
        </div>
        <button
          className="neu-btn-primary px-5 py-3 text-sm font-semibold inline-flex items-center gap-2"
          onClick={openNew}
          data-testid="new-branch-button"
        >
          <Plus className="w-4 h-4" /> New branch
        </button>
      </div>

      {loading ? (
        <div className="neu-sm p-10 text-center text-[#B097D1]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="neu-sm p-12 text-center" data-testid="branches-empty">
          <Building2 className="w-10 h-10 mx-auto text-[#DA4FF1] mb-3" />
          <div className="font-display text-xl text-white">No branches yet</div>
          <p className="text-sm text-[#B097D1] mt-1">
            Add your first branch (e.g., Banglzz, Kalyani Covering).
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((b) => (
            <div key={b.id} className="neu-sm p-6" data-testid={`branch-card-${b.code}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="label-eyebrow">{b.code}</div>
                  <div className="font-display text-xl text-white mt-1">{b.name}</div>
                </div>
                <div className="flex gap-1">
                  <button
                    className="neu-btn w-8 h-8 flex items-center justify-center"
                    onClick={() => openEdit(b)}
                    data-testid={`edit-branch-${b.code}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className="neu-btn w-8 h-8 flex items-center justify-center text-[#FDB3C0]"
                    onClick={() => setDeleteId(b.id)}
                    data-testid={`delete-branch-${b.code}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm">
                {b.phone && (
                  <div className="text-[#D9CDF0]">
                    <span className="label-eyebrow mr-2">Phone</span>
                    {b.phone}
                  </div>
                )}
                {b.address && (
                  <div className="text-[#D9CDF0]">
                    <span className="label-eyebrow mr-2">Address</span>
                    {b.address}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="neu max-w-lg border-0 text-[#F0E6FF]"
          data-testid="branch-form-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-white">
              {editing ? "Edit branch" : "New branch"}
            </DialogTitle>
            <DialogDescription className="text-[#B097D1]">
              Set a short uppercase code — it prefixes bill numbers (e.g., BNG-0001).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <Field label="Name" required>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="branch-form-name"
                placeholder="Banglzz"
              />
            </Field>
            <Field label="Code" required hint="2–8 uppercase letters/numbers">
              <input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="neu-input w-full px-3 py-2.5 text-sm uppercase tracking-widest"
                data-testid="branch-form-code"
                placeholder="BNG"
                maxLength={8}
              />
            </Field>
            <Field label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="branch-form-phone"
              />
            </Field>
            <Field label="Address">
              <textarea
                rows={2}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="neu-input w-full px-3 py-2.5 text-sm resize-none"
                data-testid="branch-form-address"
              />
            </Field>
            <DialogFooter className="gap-2">
              <button
                type="button"
                className="neu-btn px-5 py-2.5 text-sm"
                onClick={() => setOpen(false)}
                data-testid="branch-form-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="neu-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                data-testid="branch-form-submit"
              >
                {submitting ? "Saving…" : editing ? "Update branch" : "Create branch"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="neu border-0 text-[#F0E6FF]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-white">Delete branch?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#B097D1]">
              You can only delete branches that have no users and no bookings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="neu-btn border-0 text-[#E9DEFE]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-gradient-to-r from-[#7E2C3E] to-[#E04F6B] text-white"
              onClick={confirmDelete}
              data-testid="branch-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const Field = ({ label, required, hint, children }) => (
  <div className="space-y-1.5">
    <label className="label-eyebrow block">
      {label}
      {required && <span className="text-[#FDB3C0] ml-1">*</span>}
    </label>
    {children}
    {hint && <div className="text-[11px] text-[#B097D1]">{hint}</div>}
  </div>
);
