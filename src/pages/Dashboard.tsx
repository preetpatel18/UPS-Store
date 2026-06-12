import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowRight, Building2, CalendarClock, CreditCard, DollarSign, MessageSquare, RefreshCw, Settings2, Trash2, Users } from "lucide-react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { Card, CardTitle } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import type { Role } from "../data/operations";
import { apiFetch } from "../lib/api";

type PortfolioStaff = {
  id: string;
  name: string;
  email: string;
  username: string;
  role: "Administrator" | "Manager";
  status: "Active" | "Disabled" | "Pending";
  lastLogin?: string | null;
  storeName?: string;
};

type StorePortfolio = {
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
  assignedAdmins: PortfolioStaff[];
  assignedManagers: PortfolioStaff[];
  createdAt: string;
};

type TimesheetRow = {
  _id: string;
  employeeName: string;
  department: string;
  clockIn: string;
  breakIn: string | null;
  breakOut: string | null;
  status: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value || 0);
}

function dateText(value?: string) {
  if (!value) return "Not set";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : format(date, "MMM d, yyyy");
}

function timeText(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "h:mm a");
}

export function Dashboard() {
  const { role } = useOutletContext<{ role: Role }>();
  return role === "Owner" ? <OwnerDashboard /> : <StoreDashboard role={role} />;
}

function OwnerDashboard() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<StorePortfolio[]>([]);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const loadStores = useCallback(async () => {
    setLoading(true);
    try {
      setStores(await apiFetch<StorePortfolio[]>("/stores"));
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load UPS Store portfolio.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStores();
  }, [loadStores]);

  async function removeStore(store: StorePortfolio) {
    if (!window.confirm(`Delete ${store.name}? This removes the UPS Store, assigned staff, sessions, messages, and store records. This cannot be undone.`)) return;
    try {
      await apiFetch(`/stores/${store.id}`, { method: "DELETE" });
      setStores((current) => current.filter((item) => item.id !== store.id));
      setNotice(`${store.name} was deleted.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete UPS Store.");
    }
  }

  const totals = useMemo(() => ({
    active: stores.filter((store) => store.websiteStatus === "Active").length,
    subscriptions: stores.filter((store) => store.paymentType === "Monthly Subscription").length,
    monthlyRevenue: stores.reduce((sum, store) => sum + (store.paymentType === "Monthly Subscription" ? store.monthlySubscriptionPrice || 0 : 0), 0),
    overdue: stores.filter((store) => store.paymentStatus === "Overdue").length
  }), [stores]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      {notice ? <p className="rounded-2xl border bg-white/80 px-4 py-3 text-sm text-mutedForeground shadow-sm dark:bg-zinc-900/80">{notice}</p> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Building2} label="UPS Stores Sold" value={stores.length} detail={`${totals.active} active websites`} />
        <MetricCard icon={CreditCard} label="Subscriptions" value={totals.subscriptions} detail="Monthly accounts" />
        <MetricCard icon={DollarSign} label="Monthly Revenue" value={money(totals.monthlyRevenue)} detail="Expected subscription billing" />
        <MetricCard icon={CalendarClock} label="Overdue Payments" value={totals.overdue} detail="Need follow-up" />
      </section>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle title="UPS Store Portfolio" detail="Websites sold, billing status, and assigned store leadership" />
          <button className="inline-flex h-10 items-center gap-2 rounded-2xl border bg-white/80 px-3 text-sm shadow-sm hover:bg-white dark:bg-zinc-900/80 dark:hover:bg-zinc-900" onClick={() => void loadStores()}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          {stores.map((store) => (
            <article key={store.id} className="rounded-3xl border bg-white/62 p-4 shadow-sm dark:bg-zinc-900/62">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-lg font-semibold">{store.name}</p>
                  <p className="mt-1 text-sm text-mutedForeground">
                    {store.storeNumber ? `Store #${store.storeNumber}` : store.code}
                    {store.address ? ` · ${store.address}` : ""}
                  </p>
                  <p className="mt-1 text-xs text-mutedForeground">Database: {store.databaseName}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge value={store.websiteStatus} />
                  <StatusBadge value={store.paymentStatus} />
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <InfoTile label="Payment Type" value={store.paymentType} />
                <InfoTile label="Sold For" value={money(store.priceSold)} />
                <InfoTile label="Next Due" value={dateText(store.nextDueDate)} />
                <InfoTile label="Monthly" value={store.paymentType === "Monthly Subscription" ? money(store.monthlySubscriptionPrice) : "N/A"} />
                <InfoTile label="Created/Sold" value={dateText(store.createdAt?.slice(0, 10))} />
                <InfoTile label="Leadership" value={`${store.assignedAdmins.length} admin · ${store.assignedManagers.length} mgr`} />
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <StaffList title="Assigned Admins" staff={store.assignedAdmins} />
                <StaffList title="Assigned Managers" staff={store.assignedManagers} />
              </div>

              {store.notes ? <p className="mt-4 rounded-2xl bg-muted/70 p-3 text-sm text-mutedForeground">{store.notes}</p> : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <OwnerAction label="View Store" icon={Building2} onClick={() => navigate("/management")} />
                <OwnerAction label="Edit Store" icon={Settings2} onClick={() => navigate("/management")} />
                <OwnerAction label="Manage Staff" icon={Users} onClick={() => navigate("/management")} />
                <OwnerAction label="Message Admin" icon={MessageSquare} onClick={() => navigate("/messages")} />
                <OwnerAction label="Delete Store" icon={Trash2} danger onClick={() => void removeStore(store)} />
              </div>
            </article>
          ))}
          {!stores.length ? (
            <div className="rounded-3xl border border-dashed bg-white/50 p-8 text-center text-sm text-mutedForeground dark:bg-zinc-900/50 xl:col-span-2">
              No UPS Stores are in the portfolio yet. Create a store administrator from Management or Settings to start a new store record.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function StoreDashboard({ role }: { role: Role }) {
  const [working, setWorking] = useState<TimesheetRow[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void apiFetch<TimesheetRow[]>("/timesheets")
      .then((rows) => setWorking(rows.filter((row) => row.status === "Active")))
      .catch((error) => setNotice(error instanceof Error ? error.message : "Unable to load store dashboard."));
  }, []);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      {notice ? <p className="rounded-2xl border bg-white/80 px-4 py-3 text-sm text-mutedForeground shadow-sm dark:bg-zinc-900/80">{notice}</p> : null}
      <Card>
        <CardTitle title={role === "Employee" ? "My Store Dashboard" : "Store Dashboard"} detail="Current staff activity for this UPS Store" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-mutedForeground">
              <tr>
                {["Employee", "Department", "Clock In", "Break In", "Break Out", "State"].map((head) => <th key={head} className="px-4 py-3 font-medium">{head}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y">
              {working.map((row) => {
                const onBreak = Boolean(row.breakIn && !row.breakOut);
                return (
                  <tr key={row._id}>
                    <td className="px-4 py-3 font-medium">{row.employeeName}</td>
                    <td className="px-4 py-3 text-mutedForeground">{row.department || "--"}</td>
                    <td className="px-4 py-3">{timeText(row.clockIn)}</td>
                    <td className="px-4 py-3">{timeText(row.breakIn)}</td>
                    <td className="px-4 py-3">{timeText(row.breakOut)}</td>
                    <td className="px-4 py-3"><StatusBadge value={onBreak ? "Pending" : "Working"} /></td>
                  </tr>
                );
              })}
              {!working.length ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-mutedForeground">No employees are clocked in right now.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Building2; label: string; value: string | number; detail: string }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-mutedForeground">{label}</p>
          <p className="mt-3 text-3xl font-semibold">{value}</p>
          <p className="mt-1 text-sm text-mutedForeground">{detail}</p>
        </div>
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-primaryForeground shadow-soft">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white/65 p-3 shadow-sm dark:bg-zinc-900/65">
      <p className="text-[11px] uppercase tracking-[0.12em] text-mutedForeground">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}

function StaffList({ title, staff }: { title: string; staff: PortfolioStaff[] }) {
  return (
    <div className="rounded-2xl border bg-white/55 p-3 shadow-sm dark:bg-zinc-900/55">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mutedForeground">{title}</p>
      <div className="mt-3 space-y-2">
        {staff.map((person) => (
          <div key={person.id} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{person.name}</p>
              <p className="truncate text-xs text-mutedForeground">@{person.username || "login-id"} · {person.role}</p>
            </div>
            <StatusBadge value={person.status} />
          </div>
        ))}
        {!staff.length ? <p className="text-sm text-mutedForeground">None assigned.</p> : null}
      </div>
    </div>
  );
}

function OwnerAction({ label, icon: Icon, danger, onClick }: { label: string; icon: typeof ArrowRight; danger?: boolean; onClick: () => void }) {
  return (
    <button className={`inline-flex h-10 items-center gap-2 rounded-2xl border bg-white/80 px-3 text-sm shadow-sm hover:bg-white dark:bg-zinc-900/80 dark:hover:bg-zinc-900 ${danger ? "border-red-200 text-red-700 dark:border-red-900 dark:text-red-300" : ""}`} onClick={onClick}>
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
