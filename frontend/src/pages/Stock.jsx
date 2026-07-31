import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Package,
  Camera,
} from "lucide-react";
import { apiClient, API, TOKEN_KEY, formatApiErrorDetail } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";
import { PhotoUploader } from "@/components/PhotoUploader";
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

const emptyStock = () => ({
  code: "",
  name: "",
  description: "",
  notes: "",
  branch_id: "",
});

export default function Stock() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const canEdit = user?.role === "super_admin" || user?.role === "manager";

  const [items, setItems] = useState([]);
  const [branches, setBranches] = useState([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyStock());
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const token = localStorage.getItem(TOKEN_KEY);

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
      const { data } = await apiClient.get("/stock", { params });
      setItems(data);
    } catch (e) {
      toast.error("Could not load stock");
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
  }, [branchFilter]);

  useEffect(() => {
    const t = setTimeout(load, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const openNew = () => {
    setEditing(null);
    const init = emptyStock();
    if (!isSuper && user?.branch_id) init.branch_id = user.branch_id;
    else if (isSuper && branches.length === 1) init.branch_id = branches[0].id;
    setForm(init);
    setOpen(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setForm({
      code: s.code,
      name: s.name,
      description: s.description || "",
      notes: s.notes || "",
      branch_id: s.branch_id,
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!editing && isSuper && !form.branch_id) {
      toast.error("Please select a branch");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        const { branch_id, ...update } = form;
        const { data } = await apiClient.put(`/stock/${editing.id}`, update);
        toast.success("Stock item updated");
        setEditing(data);
      } else {
        const { data } = await apiClient.post("/stock", form);
        toast.success("Stock item created");
        setEditing(data);
      }
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
      await apiClient.delete(`/stock/${deleteId}`);
      toast.success("Stock item deleted");
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-8 lg:p-10 max-w-[1500px] mx-auto" data-testid="stock-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">Inventory</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-white">Stock</h1>
          <p className="text-sm text-[#B097D1] mt-2">
            Your jewellery sets by code — with photos that flow into bookings & bills.
          </p>
        </div>
        {canEdit && (
          <button
            className="neu-btn-primary px-5 py-3 text-sm font-semibold inline-flex items-center gap-2"
            onClick={openNew}
            data-testid="new-stock-button"
          >
            <Plus className="w-4 h-4" /> New stock item
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="neu-sm p-4 mb-6 flex flex-col md:flex-row gap-3 md:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B097D1] z-10" />
          <input
            placeholder="Search by code or name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="neu-input w-full pl-10 pr-4 py-2.5 text-sm"
            data-testid="stock-search-input"
          />
        </div>
        {isSuper && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="neu-input w-full md:w-52 px-3 py-2.5 text-sm"
            data-testid="stock-branch-filter"
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

      {/* Grid */}
      {loading ? (
        <div className="neu-sm p-10 text-center text-[#B097D1]">Loading…</div>
      ) : items.length === 0 ? (
        <div className="neu-sm p-12 text-center" data-testid="stock-empty">
          <Package className="w-10 h-10 mx-auto text-[#DA4FF1] mb-3" />
          <div className="font-display text-xl text-white">No stock yet</div>
          <p className="text-sm text-[#B097D1] mt-1">
            {canEdit
              ? "Add your first jewellery set with a code and photos."
              : "No stock has been added to your branch yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {items.map((s) => {
            const cover = (s.photos || []).find((p) => !p.is_deleted);
            const br = branchMap[s.branch_id];
            return (
              <div key={s.id} className="neu-sm overflow-hidden" data-testid={`stock-card-${s.code}`}>
                <div className="aspect-[4/3] bg-[#261538] relative">
                  {cover ? (
                    <img
                      src={`${API}/files/${cover.id}?auth=${token}`}
                      alt={s.name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-[#5A3D85]">
                      <Camera className="w-8 h-8 mb-1" />
                      <span className="text-[11px]">No photo</span>
                    </div>
                  )}
                  <div className="absolute top-3 left-3">
                    <span className="text-[10px] font-mono px-2 py-1 rounded-full bg-black/60 text-white backdrop-blur">
                      {s.code}
                    </span>
                  </div>
                  {br && (
                    <div className="absolute top-3 right-3">
                      <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#22463A]/90 text-[#A6E8C9] backdrop-blur">
                        {br.code}
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <div className="font-display text-lg text-white truncate">{s.name}</div>
                  {s.description && (
                    <div className="text-xs text-[#B097D1] mt-1 line-clamp-2">
                      {s.description}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-[11px] text-[#B097D1]">
                      {(s.photos || []).filter((p) => !p.is_deleted).length} photo
                      {(s.photos || []).filter((p) => !p.is_deleted).length !== 1 && "s"}
                      {" · "}
                      Added {formatDate(s.created_at)}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1">
                        <button
                          className="neu-btn w-8 h-8 flex items-center justify-center"
                          onClick={() => openEdit(s)}
                          data-testid={`edit-stock-${s.code}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="neu-btn w-8 h-8 flex items-center justify-center text-[#FDB3C0]"
                          onClick={() => setDeleteId(s.id)}
                          data-testid={`delete-stock-${s.code}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="neu max-w-2xl max-h-[90vh] overflow-y-auto border-0 text-[#F0E6FF]"
          data-testid="stock-form-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-white">
              {editing ? "Edit stock item" : "New stock item"}
            </DialogTitle>
            <DialogDescription className="text-[#B097D1]">
              Give this jewellery set a unique code within its branch. Photos will
              auto-copy into any booking that uses this code.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {!editing && isSuper && (
                <Field label="Branch" required>
                  <select
                    required
                    value={form.branch_id}
                    onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                    className="neu-input w-full px-3 py-2.5 text-sm"
                    data-testid="stock-form-branch"
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
              <Field label="Code" required hint="Unique per branch">
                <input
                  required
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  className="neu-input w-full px-3 py-2.5 text-sm font-mono"
                  data-testid="stock-form-code"
                  placeholder="JS-001"
                />
              </Field>
              <Field label="Name" required>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="neu-input w-full px-3 py-2.5 text-sm"
                  data-testid="stock-form-name"
                  placeholder="Polki Bridal Set"
                />
              </Field>
              <Field label="Description" full>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="neu-input w-full px-3 py-2.5 text-sm resize-none"
                  data-testid="stock-form-description"
                />
              </Field>
              <Field label="Internal notes" full>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="neu-input w-full px-3 py-2.5 text-sm resize-none"
                  data-testid="stock-form-notes"
                />
              </Field>
            </div>

            {editing?.id && (
              <div>
                <div className="label-eyebrow text-[#DA4FF1] mb-2">Photos</div>
                <PhotoUploader
                  bookingId={null}
                  stockId={editing.id}
                  photos={editing.photos || []}
                  onChange={(next) => setEditing({ ...editing, photos: next })}
                />
              </div>
            )}

            <DialogFooter className="gap-2">
              <button
                type="button"
                className="neu-btn px-5 py-2.5 text-sm"
                onClick={() => setOpen(false)}
                data-testid="stock-form-cancel"
              >
                {editing ? "Done" : "Cancel"}
              </button>
              {!editing && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="neu-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                  data-testid="stock-form-submit"
                >
                  {submitting ? "Saving…" : "Create & add photos"}
                </button>
              )}
              {editing && (
                <button
                  type="submit"
                  disabled={submitting}
                  className="neu-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                  data-testid="stock-form-submit"
                >
                  {submitting ? "Saving…" : "Save changes"}
                </button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="neu border-0 text-[#F0E6FF]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-white">
              Delete stock item?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#B097D1]">
              Existing bookings will keep the photos on their bill. New bookings
              won't be able to auto-fill from this code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="neu-btn border-0 text-[#E9DEFE]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-gradient-to-r from-[#7E2C3E] to-[#E04F6B] text-white"
              onClick={confirmDelete}
              data-testid="stock-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const Field = ({ label, required, hint, full, children }) => (
  <div className={`space-y-1.5 ${full ? "sm:col-span-2" : ""}`}>
    <label className="label-eyebrow block">
      {label}
      {required && <span className="text-[#FDB3C0] ml-1">*</span>}
    </label>
    {children}
    {hint && <div className="text-[11px] text-[#B097D1]">{hint}</div>}
  </div>
);
