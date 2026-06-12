import { useEffect, useState } from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleDot, Plus, Save, Trash2, X } from "lucide-react";
import { Card, CardTitle } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import { apiFetch } from "../lib/api";
import { cn } from "../lib/utils";

type PrintJob = {
  _id: string;
  customer: string;
  type: string;
  description: string;
  pricingInfo?: string;
  status: "Waiting" | "Processing" | "Ready" | "Completed";
  due: string;
  createdByName?: string;
};

type PrintJobEdit = Pick<PrintJob, "customer" | "type" | "description" | "pricingInfo" | "due">;

function getEditableJob(job: PrintJob): PrintJobEdit {
  return {
    customer: job.customer,
    type: job.type,
    description: job.description,
    pricingInfo: job.pricingInfo ?? "",
    due: job.due
  };
}

export function PrintJobs() {
  const [jobs, setJobs] = useState<PrintJob[]>([]);
  const [edits, setEdits] = useState<Record<string, PrintJobEdit>>({});
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState({ customer: "", type: "", description: "", pricingInfo: "", due: "" });

  useEffect(() => {
    void loadJobs();
  }, []);

  async function loadJobs() {
    const data = await apiFetch<PrintJob[]>("/print-jobs");
    setJobs(data);
  }

  async function setStatus(id: string, status: PrintJob["status"]) {
    if (status === "Completed" && !window.confirm("Are you sure this print job is completed?")) {
      return;
    }

    const updated = await apiFetch<PrintJob>(`/print-jobs/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    setJobs((current) => status === "Completed"
      ? current.filter((item) => item._id !== id)
      : current.map((item) => (item._id === id ? updated : item)));
    setNotice(status === "Completed" ? "Print job completed and moved to the Management archive." : `Print job marked ${status.toLowerCase()}.`);
  }

  async function createJob() {
    try {
      const created = await apiFetch<PrintJob>("/print-jobs", {
        method: "POST",
        body: JSON.stringify(draft)
      });
      setJobs((current) => [created, ...current]);
      setDraft({ customer: "", type: "", description: "", pricingInfo: "", due: "" });
      setNotice("Print job created and saved to MongoDB.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create print job.");
    }
  }

  function updateEdit(job: PrintJob, field: keyof PrintJobEdit, value: string) {
    setEdits((current) => ({
      ...current,
      [job._id]: { ...(current[job._id] ?? getEditableJob(job)), [field]: value }
    }));
  }

  async function saveJob(job: PrintJob) {
    try {
      const updated = await apiFetch<PrintJob>(`/print-jobs/${job._id}`, {
        method: "PATCH",
        body: JSON.stringify(edits[job._id] ?? getEditableJob(job))
      });
      setJobs((current) => current.map((item) => (item._id === job._id ? updated : item)));
      setEdits((current) => ({ ...current, [job._id]: getEditableJob(updated) }));
      setNotice("Print job details saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save print job.");
    }
  }

  async function deleteJob(job: PrintJob) {
    if (!window.confirm(`Delete the print job for ${job.customer}? This cannot be undone.`)) {
      return;
    }

    try {
      await apiFetch(`/print-jobs/${job._id}`, { method: "DELETE" });
      setJobs((current) => current.filter((item) => item._id !== job._id));
      setNotice("Print job deleted.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not delete print job.");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle title="Create Print Job" detail="Capture what the customer needs, pricing info, and due date" />
        <div className="grid gap-3 md:grid-cols-6">
          <PrintJobField className="md:col-span-2" label="Customer">
            <input className={inputClass} placeholder="Optional" value={draft.customer} onChange={(event) => setDraft({ ...draft, customer: event.target.value })} />
          </PrintJobField>
          <PrintJobField className="md:col-span-2" label="Job type">
            <input className={inputClass} placeholder="Optional" value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })} />
          </PrintJobField>
          <div className="md:col-span-2">
            <PrintJobDatePicker label="Due date" value={draft.due} onChange={(due) => setDraft({ ...draft, due })} />
          </div>
          <PrintJobField className="md:col-span-3" label="Description">
            <textarea className={textareaClass} placeholder="Sizes, paper, quantity, finishing, notes..." value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </PrintJobField>
          <PrintJobField className="md:col-span-3" label="Pricing info">
            <textarea className={textareaClass} placeholder="Quoted price, deposit, balance, payment notes..." value={draft.pricingInfo} onChange={(event) => setDraft({ ...draft, pricingInfo: event.target.value })} />
          </PrintJobField>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft md:col-span-2" onClick={createJob}><Plus className="h-4 w-4" /> Create Print Job</button>
        </div>
        {notice ? <p className="mt-3 text-sm text-mutedForeground">{notice}</p> : null}
      </Card>

      <Card>
        <CardTitle title="Print Jobs" detail="No assignment workflow. Just customer specs, pricing, due date, and status." />
        <div className="grid gap-4 lg:grid-cols-2">
          {jobs.map((job) => (
            <div key={job._id} className="rounded-2xl border bg-white/55 p-4 shadow-sm dark:bg-zinc-900/55">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><p className="text-sm font-semibold">{job.customer}</p>{job.createdByName ? <p className="mt-1 text-xs text-mutedForeground">Created by {job.createdByName}</p> : null}</div>
                <StatusBadge value={job.status} />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <PrintJobField label="Customer">
                  <input className={inputClass} value={(edits[job._id] ?? getEditableJob(job)).customer} onChange={(event) => updateEdit(job, "customer", event.target.value)} />
                </PrintJobField>
                <PrintJobField label="Job type">
                  <input className={inputClass} value={(edits[job._id] ?? getEditableJob(job)).type} onChange={(event) => updateEdit(job, "type", event.target.value)} />
                </PrintJobField>
                <PrintJobField label="Description">
                  <textarea className={textareaClass} placeholder="Add job description" value={(edits[job._id] ?? getEditableJob(job)).description} onChange={(event) => updateEdit(job, "description", event.target.value)} />
                </PrintJobField>
                <PrintJobField label="Pricing info">
                  <textarea className={textareaClass} placeholder="Add pricing info" value={(edits[job._id] ?? getEditableJob(job)).pricingInfo} onChange={(event) => updateEdit(job, "pricingInfo", event.target.value)} />
                </PrintJobField>
                <div className="sm:col-span-2">
                  <PrintJobDatePicker label="Due date" value={(edits[job._id] ?? getEditableJob(job)).due} onChange={(due) => updateEdit(job, "due", due)} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {(["Waiting", "Processing", "Ready", "Completed"] as PrintJob["status"][]).map((status) => (
                  <button
                    key={status}
                    className={cn(
                      "inline-flex h-8 items-center gap-2 rounded-xl border px-3 text-xs shadow-sm",
                      job.status === status ? "bg-primary text-primaryForeground" : "bg-white/70 dark:bg-zinc-900/70"
                    )}
                    onClick={() => setStatus(job._id, status)}
                  >
                    {status === "Completed" ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDot className="h-3.5 w-3.5" />}
                    {status}
                  </button>
                ))}
                <button className="inline-flex h-8 items-center gap-2 rounded-xl border bg-white/70 px-3 text-xs shadow-sm dark:bg-zinc-900/70" onClick={() => saveJob(job)}>
                  <Save className="h-3.5 w-3.5" /> Save
                </button>
                <button className="inline-flex h-8 items-center gap-2 rounded-xl border border-red-200 bg-white/70 px-3 text-xs text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/70 dark:text-red-300" onClick={() => deleteJob(job)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

const inputClass = "h-10 w-full rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80";
const textareaClass = "min-h-24 w-full rounded-xl border bg-white/80 p-3 text-sm shadow-sm dark:bg-zinc-900/80";

function PrintJobField({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  return (
    <label className={className}>
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{label} <span className="font-normal">(optional)</span></span>
      {children}
    </label>
  );
}

function PrintJobDatePicker({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  const selectedDate = value ? parseISO(value) : null;
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const calendarStart = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
  const days = Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));

  useEffect(() => {
    if (selectedDate) setVisibleMonth(startOfMonth(selectedDate));
  }, [value]);

  return (
    <div className="relative">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{label} <span className="font-normal">(optional)</span></span>
      <button className="flex h-10 w-full items-center justify-between gap-3 rounded-xl border bg-white/80 px-3 text-left text-sm shadow-sm dark:bg-zinc-900/80" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className={cn(!selectedDate && "text-mutedForeground")}>{selectedDate ? format(selectedDate, "MMM d, yyyy") : "Select a due date"}</span>
        <CalendarDays className="h-4 w-4 shrink-0" />
      </button>
      {open ? (
        <div className="absolute left-0 top-[4.25rem] z-50 w-72 rounded-xl border bg-white p-3 shadow-soft dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Previous month" onClick={() => setVisibleMonth((month) => addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-sm font-semibold">{format(visibleMonth, "MMMM yyyy")}</p>
            <div className="flex gap-1">
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Next month" onClick={() => setVisibleMonth((month) => addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button>
              <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Close calendar" onClick={() => setOpen(false)}><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase text-mutedForeground">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => (
              <button
                key={day.toISOString()}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs shadow-none",
                  !isSameMonth(day, visibleMonth) && "text-mutedForeground/50",
                  selectedDate && isSameDay(day, selectedDate) && "bg-primary text-primaryForeground",
                  isSameDay(day, new Date()) && "rounded-full ring-1 ring-primary"
                )}
                onClick={() => {
                  onChange(format(day, "yyyy-MM-dd"));
                  setOpen(false);
                }}
              >
                {format(day, "d")}
              </button>
            ))}
          </div>
          <div className="mt-3 flex justify-between gap-2 border-t pt-3">
            <button className="h-8 rounded-lg border bg-white/80 px-3 text-xs shadow-sm dark:bg-zinc-900/80" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
            <button className="h-8 rounded-lg border bg-white/80 px-3 text-xs shadow-sm dark:bg-zinc-900/80" onClick={() => { onChange(format(new Date(), "yyyy-MM-dd")); setOpen(false); }}>Today</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
