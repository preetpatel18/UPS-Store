import { useEffect, useMemo, useState } from "react";
import { Building2, ClipboardList, CreditCard, KeyRound, PackageCheck, Pencil, Plus, Save, Trash2, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { Card, CardTitle } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { apiFetch, getSession, type SessionUser } from "../lib/api";
import { cn } from "../lib/utils";

type ResolvedProblem = {
  _id: string;
  category: string;
  priority: "Low" | "Medium" | "High";
  status: "Resolved";
  description: string;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
};

type CompletedPrintJob = {
  _id: string;
  customer: string;
  type: string;
  description: string;
  pricingInfo?: string;
  status: "Completed";
  due: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
};

const archiveLinks = [
  { to: "/management/problem-log", label: "Problem Log", icon: ClipboardList },
  { to: "/management/print-job-log", label: "Print Job Log", icon: PackageCheck },
  { to: "/management/staff", label: "Staff", icon: Users }
];

export function Management() {
  const session = getSession();
  if (session?.user.role === "Owner") {
    return <OwnerManagement />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {archiveLinks.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(
              "inline-flex h-10 items-center gap-2 rounded-xl border bg-white/70 px-3 text-sm shadow-sm transition dark:bg-zinc-900/70",
              isActive && "bg-primary text-primaryForeground dark:bg-primary"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}

type OwnerStaff = SessionUser & {
  lastLogin?: string | null;
};

type OwnerStore = {
  id: string;
  name: string;
  code: string;
  databaseName: string;
  storeNumber: string;
  address: string;
  websiteStatus: "Active" | "Pending" | "Suspended" | "Cancelled";
  paymentType: "One-Time Purchase" | "Monthly Subscription";
  priceSold: number;
  monthlySubscriptionPrice: number;
  nextDueDate: string;
  paymentStatus: "Paid" | "Due Soon" | "Overdue" | "Cancelled";
  notes: string;
  assignedAdmins: OwnerStaff[];
  assignedManagers: OwnerStaff[];
};

function OwnerManagement() {
  const [stores, setStores] = useState<OwnerStore[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState("");
  const [notice, setNotice] = useState("");
  const [staffDraft, setStaffDraft] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    role: "Manager",
    assignedStoreId: ""
  });
  const [newStoreDraft, setNewStoreDraft] = useState({
    storeName: "",
    storeCode: "",
    storeNumber: "",
    address: "",
    name: "",
    username: "",
    email: "",
    password: "",
    role: "Administrator",
    paymentType: "Monthly Subscription",
    priceSold: "0",
    monthlySubscriptionPrice: "0",
    nextDueDate: ""
  });
  const [resetDraft, setResetDraft] = useState({ userId: "", name: "", password: "" });
  const [editDraft, setEditDraft] = useState({ userId: "", name: "", email: "", username: "", status: "Active" });

  useEffect(() => {
    void loadStores();
  }, []);

  async function loadStores() {
    try {
      const rows = await apiFetch<OwnerStore[]>("/stores");
      setStores(rows);
      setSelectedStoreId((current) => current || rows[0]?.id || "");
      setStaffDraft((current) => ({ ...current, assignedStoreId: current.assignedStoreId || rows[0]?.id || "" }));
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load Owner management data.");
    }
  }

  async function createStoreAdmin() {
    if (!newStoreDraft.storeName.trim() || !newStoreDraft.name.trim() || !newStoreDraft.username.trim() || !newStoreDraft.password.trim()) {
      setNotice("Enter store name, admin name, username, and a strong temporary password.");
      return;
    }

    try {
      await apiFetch<SessionUser>("/users", {
        method: "POST",
        body: JSON.stringify({
          ...newStoreDraft,
          priceSold: Number(newStoreDraft.priceSold || 0),
          monthlySubscriptionPrice: Number(newStoreDraft.monthlySubscriptionPrice || 0)
        })
      });
      setNewStoreDraft({ storeName: "", storeCode: "", storeNumber: "", address: "", name: "", username: "", email: "", password: "", role: "Administrator", paymentType: "Monthly Subscription", priceSold: "0", monthlySubscriptionPrice: "0", nextDueDate: "" });
      await loadStores();
      setNotice("UPS Store and administrator created.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create store administrator.");
    }
  }

  async function createStaff() {
    const assignedStoreId = staffDraft.assignedStoreId || selectedStoreId;
    if (!assignedStoreId || !staffDraft.name.trim() || !staffDraft.username.trim() || !staffDraft.password.trim()) {
      setNotice("Select a store, then enter name, username, and temporary password.");
      return;
    }
    try {
      await apiFetch<SessionUser>("/users", {
        method: "POST",
        body: JSON.stringify({ ...staffDraft, assignedStoreId })
      });
      setStaffDraft({ name: "", username: "", email: "", password: "", role: "Manager", assignedStoreId });
      await loadStores();
      setNotice(`${staffDraft.role} account created.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create staff account.");
    }
  }

  async function updateStore(store: OwnerStore, update: Partial<OwnerStore>) {
    try {
      await apiFetch<OwnerStore>(`/stores/${store.id}`, {
        method: "PATCH",
        body: JSON.stringify(update)
      });
      await loadStores();
      setNotice(`${store.name} updated.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update store.");
    }
  }

  async function removeStore(store: OwnerStore) {
    const confirmed = window.confirm(`Delete ${store.name}? This removes the UPS Store, assigned admins/managers/employees, sessions, messages, and store records. This cannot be undone.`);
    if (!confirmed) return;

    try {
      await apiFetch(`/stores/${store.id}`, { method: "DELETE" });
      const remaining = stores.filter((item) => item.id !== store.id);
      setStores(remaining);
      setSelectedStoreId(remaining[0]?.id ?? "");
      setStaffDraft((current) => ({ ...current, assignedStoreId: remaining[0]?.id ?? "" }));
      setNotice(`${store.name} was deleted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete UPS Store.");
    }
  }

  async function disableUser(user: OwnerStaff) {
    if (!window.confirm(`Disable ${user.name}'s login?`)) return;
    try {
      await apiFetch(`/users/${user.id}`, { method: "DELETE" });
      await loadStores();
      setNotice(`${user.name}'s login was disabled.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not disable user.");
    }
  }

  async function resetPassword() {
    if (!resetDraft.userId || resetDraft.password.length < 8) {
      setNotice("Enter a strong temporary password.");
      return;
    }
    try {
      await apiFetch(`/users/${resetDraft.userId}/reset-password`, {
        method: "PATCH",
        body: JSON.stringify({ password: resetDraft.password })
      });
      setResetDraft({ userId: "", name: "", password: "" });
      setNotice("Temporary password updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not reset password.");
    }
  }

  async function saveUserEdit() {
    if (!editDraft.userId || !editDraft.name.trim() || !editDraft.username.trim()) {
      setNotice("Enter a name and username.");
      return;
    }
    try {
      await apiFetch(`/users/${editDraft.userId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editDraft.name,
          email: editDraft.email,
          username: editDraft.username,
          status: editDraft.status
        })
      });
      setEditDraft({ userId: "", name: "", email: "", username: "", status: "Active" });
      await loadStores();
      setNotice("User updated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update user.");
    }
  }

  const selectedStore = stores.find((store) => store.id === selectedStoreId) ?? stores[0];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      {notice ? <p className="rounded-2xl border bg-white/80 px-4 py-3 text-sm text-mutedForeground shadow-sm dark:bg-zinc-900/80">{notice}</p> : null}

      <Card>
        <CardTitle title="Create New UPS Store" detail="Create the store tenant and first administrator login" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input className={ownerInputClass} placeholder="UPS store name" value={newStoreDraft.storeName} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, storeName: event.target.value })} />
          <input className={ownerInputClass} placeholder="Store code" value={newStoreDraft.storeCode} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, storeCode: event.target.value })} />
          <input className={ownerInputClass} placeholder="Store number" value={newStoreDraft.storeNumber} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, storeNumber: event.target.value })} />
          <input className={ownerInputClass} placeholder="Address/location" value={newStoreDraft.address} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, address: event.target.value })} />
          <input className={ownerInputClass} placeholder="Admin full name" value={newStoreDraft.name} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, name: event.target.value })} />
          <input className={ownerInputClass} placeholder="Admin username/login ID" value={newStoreDraft.username} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, username: event.target.value })} />
          <input className={ownerInputClass} type="email" placeholder="Admin email" value={newStoreDraft.email} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, email: event.target.value })} />
          <input className={ownerInputClass} type="password" placeholder="Temporary password" value={newStoreDraft.password} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, password: event.target.value })} />
          <select className={ownerInputClass} value={newStoreDraft.paymentType} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, paymentType: event.target.value })}>
            <option>Monthly Subscription</option>
            <option>One-Time Purchase</option>
          </select>
          <input className={ownerInputClass} type="number" min="0" placeholder="Price sold for" value={newStoreDraft.priceSold} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, priceSold: event.target.value })} />
          <input className={ownerInputClass} type="number" min="0" placeholder="Monthly price" value={newStoreDraft.monthlySubscriptionPrice} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, monthlySubscriptionPrice: event.target.value })} />
          <input className={ownerInputClass} type="date" value={newStoreDraft.nextDueDate} onChange={(event) => setNewStoreDraft({ ...newStoreDraft, nextDueDate: event.target.value })} />
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm text-primaryForeground shadow-soft md:col-span-2 xl:col-span-4" onClick={() => void createStoreAdmin()}>
            <Plus className="h-4 w-4" />
            Add Store and Admin
          </button>
        </div>
      </Card>

      <Card>
        <CardTitle title="Add Admin or Manager" detail="Create regular login IDs for leadership inside a selected UPS Store" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <select className={ownerInputClass} value={staffDraft.assignedStoreId || selectedStoreId} onChange={(event) => setStaffDraft({ ...staffDraft, assignedStoreId: event.target.value })}>
            {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
          <select className={ownerInputClass} value={staffDraft.role} onChange={(event) => setStaffDraft({ ...staffDraft, role: event.target.value })}>
            <option>Manager</option>
            <option>Administrator</option>
          </select>
          <input className={ownerInputClass} placeholder="Full name" value={staffDraft.name} onChange={(event) => setStaffDraft({ ...staffDraft, name: event.target.value })} />
          <input className={ownerInputClass} placeholder="Username/login ID" value={staffDraft.username} onChange={(event) => setStaffDraft({ ...staffDraft, username: event.target.value })} />
          <input className={ownerInputClass} type="email" placeholder="Email" value={staffDraft.email} onChange={(event) => setStaffDraft({ ...staffDraft, email: event.target.value })} />
          <input className={ownerInputClass} type="password" placeholder="Temporary password" value={staffDraft.password} onChange={(event) => setStaffDraft({ ...staffDraft, password: event.target.value })} />
          <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm text-primaryForeground shadow-soft md:col-span-2 xl:col-span-6" onClick={() => void createStaff()}>
            <Plus className="h-4 w-4" />
            Add Leadership User
          </button>
        </div>
      </Card>

      {resetDraft.userId ? (
        <Card>
          <CardTitle title={`Reset Login for ${resetDraft.name}`} detail="Creates a new temporary password. The old password cannot be viewed." />
          <div className="flex flex-col gap-3 sm:flex-row">
            <input className={ownerInputClass} type="password" placeholder="New temporary password" value={resetDraft.password} onChange={(event) => setResetDraft({ ...resetDraft, password: event.target.value })} />
            <button className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm text-primaryForeground shadow-soft" onClick={() => void resetPassword()}><KeyRound className="h-4 w-4" /> Save Password</button>
            <button className="h-11 rounded-2xl border bg-white/80 px-4 text-sm shadow-sm dark:bg-zinc-900/80" onClick={() => setResetDraft({ userId: "", name: "", password: "" })}>Cancel</button>
          </div>
        </Card>
      ) : null}

      {editDraft.userId ? (
        <Card>
          <CardTitle title={`Edit ${editDraft.name}`} detail="Update Admin/Manager profile and login status" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input className={ownerInputClass} placeholder="Full name" value={editDraft.name} onChange={(event) => setEditDraft({ ...editDraft, name: event.target.value })} />
            <input className={ownerInputClass} placeholder="Username/login ID" value={editDraft.username} onChange={(event) => setEditDraft({ ...editDraft, username: event.target.value })} />
            <input className={ownerInputClass} type="email" placeholder="Email" value={editDraft.email} onChange={(event) => setEditDraft({ ...editDraft, email: event.target.value })} />
            <select className={ownerInputClass} value={editDraft.status} onChange={(event) => setEditDraft({ ...editDraft, status: event.target.value })}>
              <option>Active</option>
              <option>Pending</option>
              <option>Disabled</option>
            </select>
            <div className="flex gap-2">
              <button className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm text-primaryForeground shadow-soft" onClick={() => void saveUserEdit()}><Save className="h-4 w-4" /> Save</button>
              <button className="h-11 rounded-2xl border bg-white/80 px-4 text-sm shadow-sm dark:bg-zinc-900/80" onClick={() => setEditDraft({ userId: "", name: "", email: "", username: "", status: "Active" })}>Cancel</button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card>
          <CardTitle title="UPS Stores" detail="Select a store to manage staff and billing" />
          <div className="space-y-2">
            {stores.map((store) => (
              <button key={store.id} className={cn("w-full rounded-2xl border bg-white/65 p-3 text-left shadow-sm dark:bg-zinc-900/65", selectedStore?.id === store.id && "border-zinc-950 bg-white dark:border-white dark:bg-zinc-900")} onClick={() => setSelectedStoreId(store.id)}>
                <span className="block truncate text-sm font-semibold">{store.name}</span>
                <span className="mt-1 block truncate text-xs text-mutedForeground">{store.storeNumber ? `#${store.storeNumber}` : store.code} · {store.assignedAdmins.length} admin · {store.assignedManagers.length} manager</span>
              </button>
            ))}
            {!stores.length ? <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-mutedForeground">No stores created yet.</p> : null}
          </div>
        </Card>

        {selectedStore ? (
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <CardTitle title={selectedStore.name} detail={`${selectedStore.storeNumber ? `Store #${selectedStore.storeNumber}` : selectedStore.code}${selectedStore.address ? ` · ${selectedStore.address}` : ""} · DB ${selectedStore.databaseName}`} />
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={selectedStore.websiteStatus} />
                <StatusBadge value={selectedStore.paymentStatus} />
                <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white/80 px-3 text-xs text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" onClick={() => void removeStore(selectedStore)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Store
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <StoreSelect label="Website" value={selectedStore.websiteStatus} options={["Active", "Pending", "Suspended", "Cancelled"]} onChange={(value) => void updateStore(selectedStore, { websiteStatus: value as OwnerStore["websiteStatus"] })} />
              <StoreSelect label="Payment" value={selectedStore.paymentStatus} options={["Paid", "Due Soon", "Overdue", "Cancelled"]} onChange={(value) => void updateStore(selectedStore, { paymentStatus: value as OwnerStore["paymentStatus"] })} />
              <StoreSelect label="Billing" value={selectedStore.paymentType} options={["Monthly Subscription", "One-Time Purchase"]} onChange={(value) => void updateStore(selectedStore, { paymentType: value as OwnerStore["paymentType"] })} />
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-mutedForeground">Next due date</span>
                <input className={ownerInputClass} type="date" value={selectedStore.nextDueDate || ""} onChange={(event) => void updateStore(selectedStore, { nextDueDate: event.target.value })} />
              </label>
              <NumberPatch label="Price sold" value={selectedStore.priceSold} onSave={(value) => void updateStore(selectedStore, { priceSold: value })} />
              <NumberPatch label="Monthly price" value={selectedStore.monthlySubscriptionPrice} onSave={(value) => void updateStore(selectedStore, { monthlySubscriptionPrice: value })} />
              <TextPatch label="Address/location" value={selectedStore.address} onSave={(value) => void updateStore(selectedStore, { address: value })} />
              <TextPatch label="Notes" value={selectedStore.notes} onSave={(value) => void updateStore(selectedStore, { notes: value })} />
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <OwnerStaffGroup
                title="Assigned Admins"
                staff={selectedStore.assignedAdmins}
                onEdit={(user) => setEditDraft({ userId: user.id, name: user.name, email: user.email ?? "", username: user.username ?? "", status: user.status ?? "Active" })}
                onReset={(user) => setResetDraft({ userId: user.id, name: user.name, password: "" })}
                onDisable={disableUser}
              />
              <OwnerStaffGroup
                title="Assigned Managers"
                staff={selectedStore.assignedManagers}
                onEdit={(user) => setEditDraft({ userId: user.id, name: user.name, email: user.email ?? "", username: user.username ?? "", status: user.status ?? "Active" })}
                onReset={(user) => setResetDraft({ userId: user.id, name: user.name, password: "" })}
                onDisable={disableUser}
              />
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

const ownerInputClass = "h-11 w-full rounded-2xl border bg-white/80 px-3 text-sm shadow-sm outline-none transition focus:ring-2 focus:ring-ring dark:bg-zinc-900/80";

function StoreSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{label}</span>
      <select className={ownerInputClass} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

function NumberPatch({ label, value, onSave }: { label: string; value: number; onSave: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value ?? 0));

  useEffect(() => {
    setDraft(String(value ?? 0));
  }, [value]);

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{label}</span>
      <span className="flex gap-2">
        <input className={ownerInputClass} type="number" min="0" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-white/80 shadow-sm dark:bg-zinc-900/80" type="button" title={`Save ${label}`} onClick={() => onSave(Number(draft || 0))}>
          <Save className="h-4 w-4" />
        </button>
      </span>
    </label>
  );
}

function TextPatch({ label, value, onSave }: { label: string; value: string; onSave: (value: string) => void }) {
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{label}</span>
      <span className="flex gap-2">
        <input className={ownerInputClass} value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border bg-white/80 shadow-sm dark:bg-zinc-900/80" type="button" title={`Save ${label}`} onClick={() => onSave(draft)}>
          <Save className="h-4 w-4" />
        </button>
      </span>
    </label>
  );
}

function OwnerStaffGroup({ title, staff, onEdit, onReset, onDisable }: { title: string; staff: OwnerStaff[]; onEdit: (user: OwnerStaff) => void; onReset: (user: OwnerStaff) => void; onDisable: (user: OwnerStaff) => void }) {
  return (
    <section className="rounded-3xl border bg-white/55 p-4 shadow-sm dark:bg-zinc-900/55">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-mutedForeground">{staff.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {staff.map((user) => (
          <div key={user.id} className="rounded-2xl border bg-white/65 p-3 shadow-sm dark:bg-zinc-900/65">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="truncate text-xs text-mutedForeground">@{user.username || "login-id"} · {user.role}</p>
                <p className="mt-1 text-xs text-mutedForeground">Last login: {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : "Never"}</p>
              </div>
              <StatusBadge value={user.status ?? "Active"} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white/80 px-3 text-xs shadow-sm dark:bg-zinc-900/80" onClick={() => onEdit(user)}>
                <Pencil className="h-3.5 w-3.5" />
                Edit User
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-xl border bg-white/80 px-3 text-xs shadow-sm dark:bg-zinc-900/80" onClick={() => onReset(user)}>
                <KeyRound className="h-3.5 w-3.5" />
                Reset Login
              </button>
              <button className="inline-flex h-9 items-center gap-2 rounded-xl border border-red-200 bg-white/80 px-3 text-xs text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" onClick={() => onDisable(user)}>
                <Trash2 className="h-3.5 w-3.5" />
                Disable
              </button>
            </div>
          </div>
        ))}
        {!staff.length ? <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-mutedForeground">No users assigned.</p> : null}
      </div>
    </section>
  );
}

export function ManagementProblemLog() {
  const [resolvedProblems, setResolvedProblems] = useState<ResolvedProblem[]>([]);
  const [priority, setPriority] = useState("All");

  useEffect(() => {
    void apiFetch<ResolvedProblem[]>("/problem-logs/resolved").then(setResolvedProblems);
  }, []);

  const filtered = useMemo(
    () => resolvedProblems.filter((problem) => priority === "All" || problem.priority === priority),
    [priority, resolvedProblems]
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs text-mutedForeground">Resolved Problems</p>
          <p className="mt-2 text-3xl font-semibold">{resolvedProblems.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-mutedForeground">High Priority Resolved</p>
          <p className="mt-2 text-3xl font-semibold">{resolvedProblems.filter((item) => item.priority === "High").length}</p>
        </Card>
        <Card>
          <p className="text-xs text-mutedForeground">Archive Access</p>
          <p className="mt-2 text-sm font-medium">Managers and Administrators only</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="Resolved Problem Log" detail="Problems confirmed resolved are stored here for management review" />
          <select className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>All</option>
            <option>High</option>
            <option>Medium</option>
            <option>Low</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-mutedForeground">
              <tr>
                {["Category", "Priority", "Description", "Reported By", "Created", "Resolved", "Status"].map((head) => (
                  <th key={head} className="py-3 pr-4 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((problem) => (
                <tr key={problem._id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{problem.category}</td>
                  <td className="py-3 pr-4">{problem.priority}</td>
                  <td className="max-w-md py-3 pr-4 text-mutedForeground">{problem.description || "No description provided."}</td>
                  <td className="py-3 pr-4">{problem.ownerName}</td>
                  <td className="py-3 pr-4">{new Date(problem.createdAt).toLocaleDateString()}</td>
                  <td className="py-3 pr-4">{new Date(problem.updatedAt).toLocaleDateString()}</td>
                  <td className="py-3 pr-4"><StatusBadge value={problem.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-mutedForeground" colSpan={7}>No resolved problems found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ManagementPrintJobLog() {
  const [completedJobs, setCompletedJobs] = useState<CompletedPrintJob[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    void apiFetch<CompletedPrintJob[]>("/print-jobs/completed").then(setCompletedJobs);
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return completedJobs;
    return completedJobs.filter((job) => [job.customer, job.type, job.description, job.pricingInfo, job.createdByName].some((value) => value?.toLowerCase().includes(query)));
  }, [completedJobs, search]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs text-mutedForeground">Completed Print Jobs</p>
          <p className="mt-2 text-3xl font-semibold">{completedJobs.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-mutedForeground">With Pricing Details</p>
          <p className="mt-2 text-3xl font-semibold">{completedJobs.filter((job) => job.pricingInfo?.trim()).length}</p>
        </Card>
        <Card>
          <p className="text-xs text-mutedForeground">Archive Access</p>
          <p className="mt-2 text-sm font-medium">Managers and Administrators only</p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="Completed Print Job Log" detail="Completed work remains stored in MongoDB for management review" />
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Search print jobs" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-mutedForeground">
              <tr>
                {["Customer", "Job Type", "Description", "Pricing Info", "Created By", "Due", "Completed", "Status"].map((head) => (
                  <th key={head} className="py-3 pr-4 font-medium">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((job) => (
                <tr key={job._id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{job.customer}</td>
                  <td className="py-3 pr-4">{job.type}</td>
                  <td className="max-w-xs py-3 pr-4 text-mutedForeground">{job.description || "No description provided."}</td>
                  <td className="max-w-xs py-3 pr-4 text-mutedForeground">{job.pricingInfo || "No pricing info provided."}</td>
                  <td className="py-3 pr-4">{job.createdByName || "Unknown"}</td>
                  <td className="py-3 pr-4">{job.due || "Not set"}</td>
                  <td className="py-3 pr-4">{new Date(job.updatedAt).toLocaleDateString()}</td>
                  <td className="py-3 pr-4"><StatusBadge value={job.status} /></td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td className="py-8 text-center text-mutedForeground" colSpan={8}>No completed print jobs found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ManagementStaff() {
  const session = getSession();
  const isOwner = session?.user.role === "Owner";
  const isAdmin = session?.user.role === "Administrator" || isOwner;
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [filter, setFilter] = useState("Employee");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({
    name: "",
    username: "",
    password: "",
    email: "",
    role: "Employee",
    department: "Operations",
    profilePicture: ""
  });

  useEffect(() => {
    void loadUsers();
  }, []);

  async function loadUsers() {
    setUsers(await apiFetch<SessionUser[]>("/users"));
  }

  async function createUser() {
    if (!draft.name.trim() || !draft.username.trim() || draft.password.length < 8) {
      setNotice("Enter a name, username, and password with at least 8 characters.");
      return;
    }
    try {
      const created = await apiFetch<SessionUser>("/users", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setUsers((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setDraft({ name: "", username: "", password: "", email: "", role: "Employee", department: "Operations", profilePicture: "" });
      setNotice(`${created.name}'s account was created.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create account.");
    }
  }

  async function removeUser(user: SessionUser) {
    if (!window.confirm(`Remove ${user.name}'s staff account? This cannot be undone.`)) return;
    try {
      await apiFetch(`/users/${user.id}`, { method: "DELETE" });
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setNotice(`${user.name}'s account was removed.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not remove account.");
    }
  }

  const filtered = users.filter((user) => filter === "All" || user.role === filter);

  return (
    <div className="space-y-4">
      {!isOwner ? <Card>
        <CardTitle title="Create Staff Account" detail={isAdmin ? "Administrators can add employees and managers" : "Managers can add employee accounts"} />
        <div className="grid gap-3 md:grid-cols-3">
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Full name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Username" value={draft.username} onChange={(event) => setDraft({ ...draft, username: event.target.value })} />
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" type="password" placeholder="Temporary password" value={draft.password} onChange={(event) => setDraft({ ...draft, password: event.target.value })} />
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" type="email" placeholder="Email (optional)" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
          <select className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value })}>
            {["Operations", "Print", "Shipping", "Retail", "Administration"].map((department) => <option key={department}>{department}</option>)}
          </select>
          <select className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })}>
            <option>Employee</option>
            {isAdmin ? <option>Manager</option> : null}
          </select>
          <input className="h-10 rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80 md:col-span-2" placeholder="Profile picture URL (optional)" value={draft.profilePicture} onChange={(event) => setDraft({ ...draft, profilePicture: event.target.value })} />
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={createUser}><Plus className="h-4 w-4" /> Add staff member</button>
        </div>
        {notice ? <p className="mt-3 text-sm text-mutedForeground">{notice}</p> : null}
      </Card> : null}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="Store Staff" detail="Employee, manager, and administrator accounts for this location" />
          <div className="flex flex-wrap gap-2">
            {["All", "Employee", "Manager", "Administrator"].map((role) => (
              <button key={role} className={cn("h-9 rounded-xl border bg-white/75 px-3 text-xs shadow-sm dark:bg-zinc-900/75", filter === role && "bg-primary text-primaryForeground dark:bg-primary")} onClick={() => setFilter(role)}>{role}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((user) => {
            const canRemove = session?.user.id !== user.id && (isAdmin || user.role === "Employee");
            return (
              <div key={user.id} className="flex items-center gap-3 rounded-xl border bg-white/60 p-3 shadow-sm dark:bg-zinc-900/60">
                {user.profilePicture ? <img className="h-11 w-11 rounded-full border object-cover" src={user.profilePicture} alt="" /> : <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primaryForeground">{user.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-xs text-mutedForeground">@{user.username || "staff"} · {user.role}</p>
                  <p className="truncate text-xs text-mutedForeground">{user.department} · {user.status}</p>
                </div>
                {canRemove ? <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white/80 text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/80 dark:text-red-300" aria-label={`Remove ${user.name}`} title="Remove account" onClick={() => removeUser(user)}><Trash2 className="h-4 w-4" /></button> : null}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
