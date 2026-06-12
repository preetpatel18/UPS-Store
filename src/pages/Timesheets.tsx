import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  parseISO,
  startOfMonth,
  startOfWeek
} from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Coffee, Download, Pencil, Plus, Save, Send, Trash2, X } from "lucide-react";
import { Card, CardTitle } from "../components/Card";
import { type Role } from "../data/operations";
import { apiFetch, type SessionUser } from "../lib/api";
import { exportCsv } from "../lib/utils";

type TimesheetRow = {
  _id: string;
  employeeName: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  breakIn: string | null;
  breakOut: string | null;
  breakTime: string;
  totalHours: number;
  department: string;
  status: string;
};

const controlClass = "h-11 w-full rounded-2xl border bg-white/80 px-3 text-sm shadow-sm outline-none transition hover:bg-white focus:ring-2 focus:ring-ring dark:bg-zinc-900/80 dark:hover:bg-zinc-900";
const timeControlClass = `${controlClass} font-medium tabular-nums`;
const readonlyControlClass = "h-11 w-full rounded-2xl border bg-white/55 px-3 text-sm font-medium tabular-nums text-mutedForeground shadow-sm outline-none dark:bg-zinc-900/55";

export function Timesheets() {
  const { role } = useOutletContext<{ role: Role }>();
  const canReview = role !== "Employee";
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [employee, setEmployee] = useState("All");
  const [department, setDepartment] = useState("All");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [users, setUsers] = useState<SessionUser[]>([]);
  const [editing, setEditing] = useState<TimesheetRow | null>(null);
  const [adjustmentMessage, setAdjustmentMessage] = useState("");
  const [manualEntry, setManualEntry] = useState({
    employee: "",
    date: "",
    clockIn: "",
    clockOut: "",
    breakIn: "",
    breakOut: "",
    breakTime: "0m",
    totalHours: 0
  });
  const [notice, setNotice] = useState("");
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const matchesEmployee = !canReview || employee === "All" || row.employeeName === employee;
      const matchesDepartment = !canReview || department === "All" || row.department === department;
      const matchesStart = !startDate || row.date >= startDate;
      const matchesEnd = !endDate || row.date <= endDate;
      return matchesEmployee && matchesDepartment && matchesStart && matchesEnd;
    });
  }, [canReview, department, employee, endDate, rows, startDate]);
  const clockedIn = rows.some((row) => row.status === "Active");
  const activeRow = rows.find((row) => row.status === "Active");
  const breakActive = Boolean(activeRow?.breakIn && !activeRow?.breakOut);
  const totalFilteredHours = filtered.reduce((sum, row) => sum + row.totalHours, 0);
  const employeeOptions = Array.from(new Set((users.length ? users.map((user) => user.name) : rows.map((row) => row.employeeName)))).sort();
  const departmentOptions = Array.from(new Set((users.length ? users.map((user) => user.department ?? "Operations") : rows.map((row) => row.department)))).sort();

  useEffect(() => {
    void loadTimesheets();
    if (canReview) {
      void apiFetch<SessionUser[]>("/users")
        .then((staff) => setUsers(staff.filter((user) => user.role === "Employee")))
        .catch((error) => {
          setUsers([]);
          setNotice(getError(error, "Could not load employee accounts."));
        });
    }
  }, [canReview]);

  async function loadTimesheets() {
    try {
      const data = await apiFetch<TimesheetRow[]>("/timesheets");
      setRows(data);
    } catch (error) {
      setRows([]);
      setNotice(getError(error, "Could not load timesheets."));
    }
  }

  async function toggleClock() {
    if (!clockedIn) {
      const created = await apiFetch<TimesheetRow>("/timesheets/clock-in", { method: "POST" });
      setRows((current) => [created, ...current]);
      setNotice(`Clocked in at ${created.clockIn}.`);
      return;
    }

    const updated = await apiFetch<TimesheetRow>("/timesheets/clock-out", { method: "POST" });
    setRows((current) => current.map((row) => (row._id === updated._id ? updated : row)));
    setNotice(`Clocked out at ${updated.clockOut}.`);
  }

  async function toggleBreak() {
    const updated = await apiFetch<TimesheetRow>(breakActive ? "/timesheets/break-out" : "/timesheets/break-in", { method: "POST" });
    setRows((current) => current.map((row) => (row._id === updated._id ? updated : row)));
    setNotice(breakActive ? `Break ended at ${updated.breakOut}.` : `Break started at ${updated.breakIn}.`);
  }

  async function sendAdjustmentRequest() {
    if (!adjustmentMessage.trim()) {
      setNotice("Write what needs to be adjusted before sending.");
      return;
    }

    const target = activeRow ?? filtered[0];
    await apiFetch("/timesheets/adjustment-request", {
      method: "POST",
      body: JSON.stringify({ timesheetId: target?._id, message: adjustmentMessage })
    });
    setAdjustmentMessage("");
    setNotice("Adjustment request sent to managers and administrators.");
    await loadTimesheets();
  }

  async function addManualEntry() {
    if (!manualEntry.employee || !manualEntry.date || !manualEntry.clockIn || !manualEntry.clockOut) {
      setNotice("Select an employee, date, clock-in time, and clock-out time.");
      return;
    }
    if (Boolean(manualEntry.breakIn) !== Boolean(manualEntry.breakOut)) {
      setNotice("Enter both optional break times or leave both blank.");
      return;
    }

    const created = await apiFetch<TimesheetRow>("/timesheets", {
      method: "POST",
      body: JSON.stringify(manualEntry)
    });
    setRows((current) => [created, ...current]);
    setManualEntry({ employee: "", date: "", clockIn: "", clockOut: "", breakIn: "", breakOut: "", breakTime: "0m", totalHours: 0 });
    setNotice("Employee time entry added.");
  }

  async function deleteEntry(id: string) {
    if (!window.confirm("Delete this timesheet entry?")) return;
    await apiFetch(`/timesheets/${id}`, { method: "DELETE" });
    setRows((current) => current.filter((row) => row._id !== id));
    setNotice("Timesheet entry deleted.");
  }

  async function saveAdjustment() {
    if (!editing) return;
    const updated = await apiFetch<TimesheetRow>(`/timesheets/${editing._id}`, {
      method: "PATCH",
      body: JSON.stringify({
        date: editing.date,
        clockIn: editing.clockIn,
        clockOut: editing.clockOut,
        breakIn: editing.breakIn,
        breakOut: editing.breakOut,
        breakTime: editing.breakTime,
        totalHours: editing.totalHours
      })
    });
    setRows((current) => current.map((row) => row._id === updated._id ? updated : row));
    setEditing(null);
    setNotice(`${updated.employeeName}'s timesheet was adjusted.`);
  }

  function exportFilteredCsv() {
    const rowsForCsv = filtered.map(({ employeeName: name, date, clockIn, clockOut, breakIn, breakOut, breakTime, totalHours }) => ({
      "Employee Name": name,
      Date: date,
      "Clock In": clockIn,
      "Clock Out": clockOut ?? "Active",
      "Break In": breakIn ?? "",
      "Break Out": breakOut ?? "",
      "Break Time": breakTime,
      "Total Hours": totalHours
    }));

    exportCsv("timesheets.csv", [
      ...rowsForCsv,
      {
        "Employee Name": "TOTAL",
        Date: startDate || "All",
        "Clock In": "",
        "Clock Out": "",
        "Break In": "",
        "Break Out": "",
        "Break Time": "",
        "Total Hours": Number(totalFilteredHours.toFixed(2))
      }
    ]);
  }

  return (
    <div className="space-y-4">
      <Card className="relative z-30 overflow-visible">
        <CardTitle title={canReview ? "Timesheet Timeline" : "My Timesheet Timeline"} detail={canReview ? "Choose an employee or all staff, then select the duration to review/export" : "Choose the duration for your own entries"} />
        <div className="grid gap-4 md:grid-cols-4">
          {canReview ? (
            <>
              <TimeField label="Employee">
                <select className={controlClass} value={employee} onChange={(event) => setEmployee(event.target.value)}>
                  <option value="All">All employees</option>
                  {employeeOptions.map((name) => <option key={name}>{name}</option>)}
                </select>
              </TimeField>
              <TimeField label="Department">
                <select className={controlClass} value={department} onChange={(event) => setDepartment(event.target.value)}>
                  <option value="All">All departments</option>
                  {departmentOptions.map((item) => <option key={item}>{item}</option>)}
                </select>
              </TimeField>
            </>
          ) : (
            <div className="flex h-11 items-center self-end rounded-2xl border bg-white/80 px-3 text-sm text-mutedForeground shadow-sm dark:bg-zinc-900/80 md:col-span-2">
              Showing only your timesheets
            </div>
          )}
          <DateRangePicker startDate={startDate} endDate={endDate} onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }} />
        </div>
      </Card>
      <div className="flex flex-wrap gap-2">
        {!canReview ? (
          <>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={toggleClock}><Plus className="h-4 w-4" /> {clockedIn ? "Clock Out" : "Clock In"}</button>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white/70 px-3 text-sm shadow-sm disabled:opacity-50 dark:bg-zinc-900/70" onClick={toggleBreak} disabled={!clockedIn}>
              <Coffee className="h-4 w-4" /> {breakActive ? "Break Out" : "Break In"}
            </button>
          </>
        ) : null}
        <button className="inline-flex h-10 items-center gap-2 rounded-xl border bg-white/70 px-3 text-sm shadow-sm dark:bg-zinc-900/70" onClick={exportFilteredCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> CSV
        </button>
      </div>
      {!canReview ? (
        <Card>
          <CardTitle title="Adjustment Request" detail="Tell managers/admins exactly what needs to be fixed" />
          <div className="flex flex-col gap-3 md:flex-row">
            <textarea className="min-h-20 flex-1 rounded-xl border bg-white/80 p-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder="Example: I forgot to clock out yesterday at 5:30 PM, please adjust that shift." value={adjustmentMessage} onChange={(event) => setAdjustmentMessage(event.target.value)} />
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft md:self-start" onClick={sendAdjustmentRequest}>
              <Send className="h-4 w-4" /> Send
            </button>
          </div>
        </Card>
      ) : null}
      {canReview ? (
        <Card className="relative z-0">
          <CardTitle title="Add Employee Time" detail="Manager/Admin correction tool" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <TimeField label="Employee">
              <select className={controlClass} value={manualEntry.employee} onChange={(event) => setManualEntry({ ...manualEntry, employee: event.target.value })}>
                <option value="">Select employee</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </TimeField>
            <TimeField label="Date">
              <input className={timeControlClass} type="date" value={manualEntry.date} onChange={(event) => setManualEntry({ ...manualEntry, date: event.target.value })} />
            </TimeField>
            <TimeField label="Clock in *">
              <input className={timeControlClass} type="time" value={manualEntry.clockIn} onChange={(event) => setManualEntry(withCalculatedHours({ ...manualEntry, clockIn: event.target.value }))} />
            </TimeField>
            <TimeField label="Clock out *">
              <input className={timeControlClass} type="time" value={manualEntry.clockOut} onChange={(event) => setManualEntry(withCalculatedHours({ ...manualEntry, clockOut: event.target.value }))} />
            </TimeField>
            <TimeField label="Break in (optional)">
              <input className={timeControlClass} type="time" value={manualEntry.breakIn} onChange={(event) => setManualEntry(withCalculatedHours({ ...manualEntry, breakIn: event.target.value }))} />
            </TimeField>
            <TimeField label="Break out (optional)">
              <input className={timeControlClass} type="time" value={manualEntry.breakOut} onChange={(event) => setManualEntry(withCalculatedHours({ ...manualEntry, breakOut: event.target.value }))} />
            </TimeField>
            <TimeField label="Total hours">
              <input className={readonlyControlClass} value={manualEntry.totalHours.toFixed(2)} readOnly />
            </TimeField>
            <button className="h-11 self-end rounded-2xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={addManualEntry}>Add Time</button>
          </div>
        </Card>
      ) : null}
      {notice ? <p className="rounded-xl border bg-white/70 px-4 py-3 text-sm shadow-sm dark:bg-zinc-900/70">{notice}</p> : null}
      <Card>
        <CardTitle title={canReview ? "Timesheet Review" : "My Timesheets"} detail={`${filtered.length} entries · ${totalFilteredHours.toFixed(2)} total hours`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b text-xs uppercase text-mutedForeground">
              <tr>{["Employee Name", "Date", "Clock In", "Clock Out", "Break In", "Break Out", "Break Time", "Total Hours", "Department", canReview ? "Actions" : ""].filter(Boolean).map((head) => <th key={head} className="py-3 pr-4 font-medium">{head}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row._id} className="border-b last:border-0">
                  <td className="py-3 pr-4 font-medium">{row.employeeName}</td>
                  <td className="py-3 pr-4">{row.date}</td>
                  <td className="py-3 pr-4">{row.clockIn}</td>
                  <td className="py-3 pr-4">{row.clockOut ?? "Active"}</td>
                  <td className="py-3 pr-4">{row.breakIn ?? ""}</td>
                  <td className="py-3 pr-4">{row.breakOut ?? ""}</td>
                  <td className="py-3 pr-4">{row.breakTime}</td>
                  <td className="py-3 pr-4">{row.totalHours}</td>
                  <td className="py-3 pr-4">{row.department}</td>
                  {canReview ? (
                    <td className="py-3 pr-4">
                      <div className="flex gap-2">
                        <button className="flex h-8 w-8 items-center justify-center rounded-xl border bg-white/70 shadow-sm dark:bg-zinc-900/70" aria-label={`Adjust ${row.employeeName}'s timesheet`} title="Adjust timesheet" onClick={() => setEditing({ ...row })}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 bg-white/70 text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-900/70 dark:text-red-300" aria-label={`Delete ${row.employeeName}'s timesheet`} title="Delete timesheet" onClick={() => deleteEntry(row._id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              <tr className="bg-muted/60 font-semibold">
                <td className="py-3 pr-4">Total</td>
                <td className="py-3 pr-4" colSpan={6}>{startDate || "All dates"} to {endDate || "All dates"}</td>
                <td className="py-3 pr-4">{totalFilteredHours.toFixed(2)}</td>
                <td className="py-3 pr-4" />
                {canReview ? <td className="py-3 pr-4" /> : null}
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      {editing ? (
        <EditTimesheetModal entry={editing} onChange={setEditing} onClose={() => setEditing(null)} onSave={() => void saveAdjustment()} />
      ) : null}
    </div>
  );
}

function EditTimesheetModal({ entry, onChange, onClose, onSave }: { entry: TimesheetRow; onChange: (entry: TimesheetRow) => void; onClose: () => void; onSave: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-sm">
      <section className="w-full max-w-3xl rounded-xl border bg-white p-4 shadow-soft dark:bg-zinc-900">
        <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
          <div>
            <h2 className="text-sm font-semibold">Adjust Timesheet</h2>
            <p className="mt-1 text-xs text-mutedForeground">{entry.employeeName}</p>
          </div>
          <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Close adjustment" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <TimeField label="Date"><input className={timeControlClass} type="date" value={entry.date} onChange={(event) => onChange({ ...entry, date: event.target.value })} /></TimeField>
          <TimeField label="Clock in"><input className={timeControlClass} type="time" value={entry.clockIn} onChange={(event) => onChange(withRecalculatedHours({ ...entry, clockIn: event.target.value }))} /></TimeField>
          <TimeField label="Clock out"><input className={timeControlClass} type="time" value={entry.clockOut ?? ""} onChange={(event) => onChange(withRecalculatedHours({ ...entry, clockOut: event.target.value || null }))} /></TimeField>
          <TimeField label="Break time"><input className={readonlyControlClass} value={entry.breakTime} readOnly /></TimeField>
          <TimeField label="Break in"><input className={timeControlClass} type="time" value={entry.breakIn ?? ""} onChange={(event) => onChange(withRecalculatedHours({ ...entry, breakIn: event.target.value || null }))} /></TimeField>
          <TimeField label="Break out"><input className={timeControlClass} type="time" value={entry.breakOut ?? ""} onChange={(event) => onChange(withRecalculatedHours({ ...entry, breakOut: event.target.value || null }))} /></TimeField>
          <TimeField label="Total hours"><input className={readonlyControlClass} value={entry.totalHours.toFixed(2)} readOnly /></TimeField>
        </div>
        <button className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-3 text-sm text-primaryForeground shadow-soft" onClick={onSave}><Save className="h-4 w-4" /> Save Adjustment</button>
      </section>
    </div>
  );
}

function TimeField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{label}</span>
      {children}
    </label>
  );
}

function DateRangePicker({ startDate, endDate, onChange }: { startDate: string; endDate: string; onChange: (start: string, end: string) => void }) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => startDate ? parseISO(startDate) : new Date());
  const start = startDate ? parseISO(startDate) : null;
  const end = endDate ? parseISO(endDate) : null;
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(visibleMonth)),
    end: endOfWeek(endOfMonth(visibleMonth))
  });
  const label = start
    ? `${format(start, "MMM d, yyyy")} ${end ? `- ${format(end, "MMM d, yyyy")}` : "- Select end date"}`
    : "Select date range";

  function selectDay(day: Date) {
    const value = format(day, "yyyy-MM-dd");
    if (!start || end || isBefore(day, start)) {
      onChange(value, "");
      return;
    }
    onChange(startDate, value);
  }

  return (
    <div className="relative md:col-span-2">
      <span className="mb-1.5 block text-xs font-medium text-mutedForeground">Duration</span>
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between gap-3 rounded-2xl border bg-white/80 px-3 text-left text-sm shadow-sm outline-none transition hover:bg-white focus:ring-2 focus:ring-ring dark:bg-zinc-900/80 dark:hover:bg-zinc-900"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex min-w-0 items-center gap-2">
          <CalendarDays className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[4.75rem] z-[100] w-[min(24rem,calc(100vw-2rem))] rounded-2xl border bg-white p-3 shadow-soft dark:bg-zinc-900 sm:left-auto sm:right-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <button type="button" className="grid h-9 w-9 place-items-center rounded-xl border bg-white/80 p-0 shadow-sm dark:bg-zinc-900/80" aria-label="Previous month" onClick={() => setVisibleMonth((month) => addMonths(month, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold">{format(visibleMonth, "MMMM yyyy")}</p>
            <button type="button" className="grid h-9 w-9 place-items-center rounded-xl border bg-white/80 p-0 shadow-sm dark:bg-zinc-900/80" aria-label="Next month" onClick={() => setVisibleMonth((month) => addMonths(month, 1))}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase text-mutedForeground">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 text-center text-xs">
            {calendarDays.map((day) => {
              const selectedEdge = Boolean((start && isSameDay(day, start)) || (end && isSameDay(day, end)));
              const withinRange = Boolean(start && end && isWithinInterval(day, { start, end }));
              const today = isSameDay(day, new Date());
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  className={[
                    "mx-auto grid h-9 w-9 place-items-center rounded-xl shadow-none transition",
                    !isSameMonth(day, visibleMonth) ? "text-mutedForeground/45" : "",
                    withinRange ? "bg-accent" : "hover:bg-accent",
                    selectedEdge ? "bg-primary text-primaryForeground hover:bg-primary" : "",
                    today && !selectedEdge ? "ring-1 ring-primary" : ""
                  ].join(" ")}
                  onClick={() => selectDay(day)}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t pt-3">
            <button type="button" className="h-8 rounded-lg border bg-white/80 px-3 text-xs shadow-sm dark:bg-zinc-900/80" onClick={() => onChange("", "")}>Clear</button>
            <button type="button" className="h-8 rounded-lg bg-primary px-3 text-xs text-primaryForeground shadow-sm" onClick={() => setOpen(false)}>Done</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function withCalculatedHours<T extends { clockIn: string; clockOut: string; breakIn: string; breakOut: string; totalHours: number }>(entry: T) {
  const shiftMinutes = minutesBetween(entry.clockIn, entry.clockOut);
  const breakMinutes = minutesBetween(entry.breakIn, entry.breakOut);
  return { ...entry, totalHours: Number((Math.max(0, shiftMinutes - breakMinutes) / 60).toFixed(2)) };
}

function withRecalculatedHours<T extends { clockIn: string; clockOut: string | null; breakIn: string | null; breakOut: string | null; breakTime: string; totalHours: number }>(entry: T) {
  const breakMinutes = minutesBetween(entry.breakIn ?? "", entry.breakOut ?? "");
  const shiftMinutes = minutesBetween(entry.clockIn, entry.clockOut ?? "");
  return {
    ...entry,
    breakTime: `${breakMinutes}m`,
    totalHours: Number((Math.max(0, shiftMinutes - breakMinutes) / 60).toFixed(2))
  };
}

function minutesBetween(start: string, end: string) {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

function getError(error: unknown, fallback: string) {
  return error instanceof Error && error.message !== "Failed to fetch"
    ? error.message
    : `${fallback} The API server is unavailable.`;
}
