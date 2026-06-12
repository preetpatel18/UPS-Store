import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { Card, CardTitle } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import type { Role } from "../data/operations";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

type TimeOffRequest = {
  _id: string;
  employeeName: string;
  date: string;
  start: string;
  end: string;
  reason: string;
  notes: string;
  status: "Pending" | "Approved" | "Denied";
};

export function RequestsOff() {
  const { role } = useOutletContext<{ role: Role }>();
  const canReview = role === "Manager" || role === "Administrator" || role === "Owner";
  const canSubmitRequest = role === "Employee";
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [form, setForm] = useState({ date: "", start: "", end: "", reason: "", notes: "" });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void loadRequests();
  }, []);

  async function loadRequests() {
    try {
      const data = await apiFetch<TimeOffRequest[]>("/time-off-requests");
      setRequests(data);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load time-off requests.");
    }
  }

  async function submitRequest() {
    if (!form.date || !form.start || !form.end || !form.reason) {
      return;
    }
    try {
      const created = await apiFetch<TimeOffRequest>("/time-off-requests", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setRequests((current) => [created, ...current]);
      setForm({ date: "", start: "", end: "", reason: "", notes: "" });
      setNotice("Time-off request submitted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not submit time-off request.");
    }
  }

  async function updateStatus(id: string, status: TimeOffRequest["status"]) {
    if (!canReview) return;
    try {
      const updated = await apiFetch<TimeOffRequest>(`/time-off-requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setRequests((current) => current.map((request) => (request._id === id ? updated : request)));
      setNotice(`Request marked ${status.toLowerCase()}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update request.");
    }
  }

  return (
    <div className={canReview ? "grid gap-4" : "grid gap-4 xl:grid-cols-[420px_1fr]"}>
      {notice ? <p className="rounded-2xl border bg-white/75 px-4 py-3 text-sm text-mutedForeground shadow-sm dark:bg-zinc-900/75 xl:col-span-2">{notice}</p> : null}
      {canSubmitRequest ? <Card>
        <CardTitle title="Submit Time-Off Request" detail="Notifications are sent automatically" />
        <div className="space-y-3">
          <LabeledControl label="Date">
            <input className={timeControlClass} type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </LabeledControl>
          <div className="grid grid-cols-2 gap-3">
            <LabeledControl label="Start time">
              <input className={timeControlClass} type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} />
            </LabeledControl>
            <LabeledControl label="End time">
              <input className={timeControlClass} type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} />
            </LabeledControl>
          </div>
          <input className={controlClass} placeholder="Reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          <textarea className="min-h-28 w-full rounded-2xl border bg-white/80 p-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring dark:bg-zinc-900/80" placeholder="Optional notes" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
          <button className="h-11 w-full rounded-2xl bg-primary text-sm text-primaryForeground shadow-soft" onClick={submitRequest}>Submit Request</button>
        </div>
      </Card> : null}
      <Card>
        <CardTitle title={canReview ? "Request Queue" : "My Requests"} detail={canReview ? "Managers and administrators approve or deny requests" : "Employees can submit and track status"} />
        <div className={canReview ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "space-y-3"}>
          {requests.map((request) => (
            <div key={request._id} className="rounded-xl border bg-white/50 p-4 shadow-sm dark:bg-zinc-900/50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{request.employeeName}</p>
                  <p className="mt-1 text-sm text-mutedForeground">{request.date} · {request.start}-{request.end}</p>
                </div>
                <StatusBadge value={request.status} />
              </div>
              <p className="mt-3 text-sm">{request.reason}</p>
              <p className="mt-1 text-xs text-mutedForeground">{request.notes}</p>
              {canReview ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button className={timeOffActionClass(request.status === "Approved", "approved")} onClick={() => updateStatus(request._id, "Approved")}>Approve</button>
                  <button className={timeOffActionClass(request.status === "Denied", "denied")} onClick={() => updateStatus(request._id, "Denied")}>Deny</button>
                  <button className={timeOffActionClass(request.status === "Pending", "pending")} onClick={() => updateStatus(request._id, "Pending")}>Request Changes</button>
                </div>
              ) : null}
            </div>
          ))}
          {requests.length === 0 ? (
            <p className={cn("rounded-xl border border-dashed bg-white/45 px-4 py-6 text-center text-sm text-mutedForeground dark:bg-zinc-900/45", canReview && "md:col-span-2 xl:col-span-3")}>
              {canReview ? "No time-off requests are waiting in this store." : "You have not submitted any time-off requests yet."}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function timeOffActionClass(selected: boolean, action: "approved" | "denied" | "pending") {
  return cn(
    "h-9 rounded-xl border px-3 text-xs shadow-sm",
    !selected && "bg-white/70 dark:bg-zinc-900/70",
    selected && action === "approved" && "border-emerald-700 bg-emerald-600 text-white",
    selected && action === "denied" && "border-red-700 bg-red-600 text-white",
    selected && action === "pending" && "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950"
  );
}

const controlClass = "h-11 w-full rounded-2xl border bg-white/80 px-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-ring dark:bg-zinc-900/80";
const timeControlClass = `${controlClass} font-medium tabular-nums`;

function LabeledControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{label}</span>
      {children}
    </label>
  );
}
