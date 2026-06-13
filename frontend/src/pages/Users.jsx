import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, UserCog, Pencil, Trash2, KeyRound } from "lucide-react";
import { apiClient, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { roleLabel } from "@/lib/format";
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

const emptyUser = () => ({
  name: "",
  email: "",
  password: "",
  role: "staff",
  branch_id: "",
});

export default function Users() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";

  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyUser());
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const branchMap = useMemo(() => {
    const m = {};
    branches.forEach((b) => (m[b.id] = b));
    return m;
  }, [branches]);

  const load = async () => {
    setLoading(true);
    try {
      const [u, b] = await Promise.all([
        apiClient.get("/users"),
        apiClient.get("/branches"),
      ]);
      setUsers(u.data);
      setBranches(b.data);
    } catch (e) {
      toast.error("Could not load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    const init = emptyUser();
    if (!isSuper && user?.branch_id) init.branch_id = user.branch_id;
    else if (isSuper && branches.length === 1) init.branch_id = branches[0].id;
    setForm(init);
    setOpen(true);
  };

  const openEdit = (u) => {
    setEditing(u);
    setForm({
      name: u.name || "",
      email: u.email,
      password: "",
      role: u.role,
      branch_id: u.branch_id || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editing) {
        const payload = { name: form.name };
        if (form.password) payload.password = form.password;
        if (isSuper && form.role !== editing.role) payload.role = form.role;
        if (isSuper && form.branch_id !== editing.branch_id) payload.branch_id = form.branch_id;
        await apiClient.put(`/users/${editing.id}`, payload);
        toast.success("User updated");
      } else {
        const payload = {
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          branch_id: form.branch_id,
        };
        await apiClient.post("/users", payload);
        toast.success("User created");
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
      await apiClient.delete(`/users/${deleteId}`);
      toast.success("User deleted");
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail));
    }
  };

  return (
    <div className="p-6 md:p-8 lg:p-10 max-w-[1400px] mx-auto" data-testid="users-page">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow text-[#DA4FF1]">People</div>
          <h1 className="font-display text-4xl sm:text-5xl mt-1 text-white">Users</h1>
          <p className="text-sm text-[#B097D1] mt-2">
            {isSuper
              ? "All managers and staff across every branch."
              : "Staff in your branch."}
          </p>
        </div>
        <button
          className="neu-btn-primary px-5 py-3 text-sm font-semibold inline-flex items-center gap-2"
          onClick={openNew}
          data-testid="new-user-button"
        >
          <Plus className="w-4 h-4" /> New user
        </button>
      </div>

      {loading ? (
        <div className="neu-sm p-10 text-center text-[#B097D1]">Loading…</div>
      ) : users.length === 0 ? (
        <div className="neu-sm p-12 text-center" data-testid="users-empty">
          <UserCog className="w-10 h-10 mx-auto text-[#DA4FF1] mb-3" />
          <div className="font-display text-xl text-white">No users yet</div>
          <p className="text-sm text-[#B097D1] mt-1">Create your first team member.</p>
        </div>
      ) : (
        <div className="neu-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#261538]">
              <tr className="text-left">
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Branch</Th>
                <Th right>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const br = branchMap[u.branch_id];
                return (
                  <tr
                    key={u.id}
                    className="border-t border-[#3D2A5C] hover:bg-[#352051]"
                    data-testid={`user-row-${u.email}`}
                  >
                    <Td>
                      <div className="text-white font-medium">{u.name || "—"}</div>
                    </Td>
                    <Td>{u.email}</Td>
                    <Td>
                      <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#3A2A5E] text-[#E9CFFD]">
                        {roleLabel(u.role)}
                      </span>
                    </Td>
                    <Td>
                      {br ? (
                        <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded-full bg-[#22463A] text-[#A6E8C9]">
                          {br.code}
                        </span>
                      ) : (
                        <span className="text-[#B097D1]">—</span>
                      )}
                    </Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        {u.role !== "super_admin" && (
                          <>
                            <button
                              className="neu-btn w-8 h-8 flex items-center justify-center"
                              onClick={() => openEdit(u)}
                              data-testid={`edit-user-${u.email}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="neu-btn w-8 h-8 flex items-center justify-center text-[#FDB3C0]"
                              onClick={() => setDeleteId(u.id)}
                              data-testid={`delete-user-${u.email}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="neu max-w-lg border-0 text-[#F0E6FF]"
          data-testid="user-form-dialog"
        >
          <DialogHeader>
            <DialogTitle className="font-display text-2xl text-white">
              {editing ? "Edit user" : "New user"}
            </DialogTitle>
            <DialogDescription className="text-[#B097D1]">
              {editing
                ? "Update name, role, branch, or set a new password."
                : "Create a login for a team member at a specific branch."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4 mt-2">
            <Field label="Full name" required>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="neu-input w-full px-3 py-2.5 text-sm"
                data-testid="user-form-name"
              />
            </Field>
            <Field label="Email" required>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!!editing}
                className="neu-input w-full px-3 py-2.5 text-sm disabled:opacity-60"
                data-testid="user-form-email"
              />
            </Field>
            <Field
              label={editing ? "New password (leave blank to keep)" : "Password"}
              required={!editing}
            >
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#B097D1] z-10" />
                <input
                  required={!editing}
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="neu-input w-full pl-10 pr-3 py-2.5 text-sm"
                  data-testid="user-form-password"
                  placeholder={editing ? "Unchanged" : "min 6 characters"}
                  minLength={editing ? 0 : 6}
                />
              </div>
            </Field>
            <Field label="Role" required>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="neu-input w-full px-3 py-2.5 text-sm"
                disabled={!isSuper && !!editing}
                data-testid="user-form-role"
              >
                {isSuper && <option value="manager">Manager</option>}
                <option value="staff">Staff</option>
              </select>
            </Field>
            {isSuper && (
              <Field label="Branch" required>
                <select
                  required
                  value={form.branch_id}
                  onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
                  className="neu-input w-full px-3 py-2.5 text-sm"
                  data-testid="user-form-branch"
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
            <DialogFooter className="gap-2">
              <button
                type="button"
                className="neu-btn px-5 py-2.5 text-sm"
                onClick={() => setOpen(false)}
                data-testid="user-form-cancel"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="neu-btn-primary px-5 py-2.5 text-sm font-semibold disabled:opacity-60"
                data-testid="user-form-submit"
              >
                {submitting ? "Saving…" : editing ? "Update user" : "Create user"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent className="neu border-0 text-[#F0E6FF]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-white">Delete user?</AlertDialogTitle>
            <AlertDialogDescription className="text-[#B097D1]">
              They will lose access immediately. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="neu-btn border-0 text-[#E9DEFE]">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-gradient-to-r from-[#7E2C3E] to-[#E04F6B] text-white"
              onClick={confirmDelete}
              data-testid="user-delete-confirm"
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

const Field = ({ label, required, children }) => (
  <div className="space-y-1.5">
    <label className="label-eyebrow block">
      {label}
      {required && <span className="text-[#FDB3C0] ml-1">*</span>}
    </label>
    {children}
  </div>
);
