import { useEffect, useMemo, useState } from "react";
import { addDays, addMonths, addWeeks, format, isSameDay, isSameMonth, isSameWeek, parseISO, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Trash2, Users } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import { Card, CardTitle } from "../components/Card";
import { StatusBadge } from "../components/StatusBadge";
import type { Role } from "../data/operations";
import { apiFetch, type SessionUser } from "../lib/api";
import { cn } from "../lib/utils";

type CalendarEvent = {
  _id: string;
  title: string;
  type: "Shift" | "Time Off" | "Availability";
  employee?: string;
  employeeName?: string;
  date: string;
  start?: string;
  end?: string;
  comments?: string;
};

type TimeOffRequest = {
  _id: string;
  employeeName: string;
  date: string;
  start: string;
  end: string;
  reason: string;
  status: "Pending" | "Approved" | "Denied";
};

type DragSelection = {
  date: string;
  startIndex: number;
  endIndex: number;
};

type EventLayout = {
  style: React.CSSProperties;
  narrow: boolean;
};

const SLOT_START_HOUR = 8;
const SLOT_END_HOUR = 20;
const SLOT_MINUTES = 30;
const SLOT_HEIGHT = 32;
const SLOT_COUNT = ((SLOT_END_HOUR - SLOT_START_HOUR) * 60) / SLOT_MINUTES;
const slots = Array.from({ length: SLOT_COUNT }, (_, index) => index);
const employeeColors = [
  { swatch: "bg-emerald-500", availability: "border-emerald-500/55 bg-emerald-200/55 text-emerald-950 dark:bg-emerald-900/45 dark:text-emerald-100", shift: "border-emerald-800 bg-emerald-700 text-white" },
  { swatch: "bg-sky-500", availability: "border-sky-500/55 bg-sky-200/55 text-sky-950 dark:bg-sky-900/45 dark:text-sky-100", shift: "border-sky-800 bg-sky-700 text-white" },
  { swatch: "bg-amber-500", availability: "border-amber-500/55 bg-amber-200/55 text-amber-950 dark:bg-amber-900/45 dark:text-amber-100", shift: "border-amber-800 bg-amber-700 text-white" },
  { swatch: "bg-rose-500", availability: "border-rose-500/55 bg-rose-200/55 text-rose-950 dark:bg-rose-900/45 dark:text-rose-100", shift: "border-rose-800 bg-rose-700 text-white" },
  { swatch: "bg-cyan-500", availability: "border-cyan-500/55 bg-cyan-200/55 text-cyan-950 dark:bg-cyan-900/45 dark:text-cyan-100", shift: "border-cyan-800 bg-cyan-700 text-white" },
  { swatch: "bg-lime-500", availability: "border-lime-500/55 bg-lime-200/55 text-lime-950 dark:bg-lime-900/45 dark:text-lime-100", shift: "border-lime-800 bg-lime-700 text-white" }
];

export function Calendar() {
  const { role } = useOutletContext<{ role: Role }>();
  const canManage = role === "Manager" || role === "Administrator";
  const [requests, setRequests] = useState<TimeOffRequest[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [employees, setEmployees] = useState<SessionUser[]>([]);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [drag, setDrag] = useState<DragSelection | null>(null);
  const [comments, setComments] = useState("");
  const [notice, setNotice] = useState("");

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekDates = useMemo(() => new Set(weekDays.map((day) => format(day, "yyyy-MM-dd"))), [weekDays]);
  const weekEvents = events.filter((event) => weekDates.has(event.date));
  const shifts = weekEvents.filter((event) => event.type === "Shift" && event.start && event.end);
  const availability = weekEvents.filter((event) => event.type === "Availability" && event.start && event.end);

  useEffect(() => {
    void loadCalendar();
  }, [canManage]);

  async function loadCalendar() {
    try {
      const [calendarEvents, timeOffRequests] = await Promise.all([
        apiFetch<CalendarEvent[]>("/calendar-events"),
        apiFetch<TimeOffRequest[]>("/time-off-requests")
      ]);
      setEvents(calendarEvents);
      setRequests(timeOffRequests);
      if (canManage) {
        const users = await apiFetch<SessionUser[]>("/users");
        setEmployees(users.filter((user) => user.role === "Employee"));
      }
    } catch (error) {
      setNotice(getError(error, "Could not load calendar."));
    }
  }

  function toggleEmployee(id: string) {
    setSelectedEmployees((current) => current.includes(id) ? current.filter((employeeId) => employeeId !== id) : [...current, id]);
  }

  function beginDrag(date: string, startIndex: number) {
    if (canManage && selectedEmployees.length === 0) {
      setNotice("Select at least one employee before painting a scheduled shift.");
      return;
    }
    setNotice("");
    setDrag({ date, startIndex, endIndex: startIndex });
  }

  function extendDrag(date: string, endIndex: number, buttons: number) {
    if (!drag || drag.date !== date || buttons !== 1) return;
    setDrag({ ...drag, endIndex });
  }

  async function finishDrag() {
    if (!drag) return;
    const selection = drag;
    setDrag(null);
    const times = selectionTimes(selection);
    try {
      if (canManage) {
        const created = await apiFetch<CalendarEvent[]>("/calendar-events/shifts/batch", {
          method: "POST",
          body: JSON.stringify({ employees: selectedEmployees, date: selection.date, ...times, comments })
        });
        setEvents(await apiFetch<CalendarEvent[]>("/calendar-events"));
        setNotice(`${created.length} shift${created.length === 1 ? "" : "s"} scheduled.`);
        return;
      }
      const created = await apiFetch<CalendarEvent>("/calendar-events", {
        method: "POST",
        body: JSON.stringify({ title: "Available to work", type: "Availability", date: selection.date, ...times, comments })
      });
      setEvents(await apiFetch<CalendarEvent[]>("/calendar-events"));
      setNotice("Availability added. Drag another time block or remove one with its trash button.");
    } catch (error) {
      setNotice(getError(error, canManage ? "Could not schedule shift." : "Could not save availability."));
    }
  }

  async function deleteShift(event: CalendarEvent) {
    if (!window.confirm(`Remove ${event.employeeName}'s ${event.start}-${event.end} shift?`)) return;
    try {
      await apiFetch(`/calendar-events/shifts/${event._id}`, { method: "DELETE" });
      setEvents((current) => current.filter((item) => item._id !== event._id));
      setNotice("Scheduled shift removed.");
    } catch (error) {
      setNotice(getError(error, "Could not remove shift."));
    }
  }

  async function deleteAvailability(event: CalendarEvent) {
    if (!window.confirm(`Remove ${event.start}-${event.end} availability?`)) return;
    try {
      await apiFetch(`/calendar-events/availability/${event._id}`, { method: "DELETE" });
      setEvents((current) => current.filter((item) => item._id !== event._id));
      setNotice("Availability removed.");
    } catch (error) {
      setNotice(getError(error, "Could not remove availability."));
    }
  }

  async function setRequestStatus(id: string, status: TimeOffRequest["status"]) {
    if (!canManage) return;
    try {
      const updated = await apiFetch<TimeOffRequest>(`/time-off-requests/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setRequests((current) => current.map((request) => request._id === id ? updated : request));
      setEvents(await apiFetch<CalendarEvent[]>("/calendar-events"));
    } catch (error) {
      setNotice(getError(error, "Could not update request."));
    }
  }

  return (
    <div className={cn("grid gap-4", canManage ? "xl:grid-cols-[minmax(0,1fr)_320px]" : "xl:grid-cols-[minmax(0,1fr)_340px]")}>
      <div className="space-y-4">
        <Card>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <CardTitle
              title={canManage ? "Weekly Schedule" : "My Weekly Availability"}
              detail={canManage ? "Employee colors show requested availability. Select employees and drag to schedule their shifts." : "Drag across the hours you want to work. Remove a block if your availability changes."}
            />
            <WeekNavigation weekStart={weekStart} setWeekStart={setWeekStart} />
          </div>
          <p className="mb-3 text-sm font-medium">{format(weekStart, "MMM d")} - {format(addDays(weekStart, 6), "MMM d, yyyy")}</p>
          <ScheduleBoard
            availability={availability}
            canDeleteAvailability={!canManage}
            canDeleteShifts={canManage}
            drag={drag}
            shifts={shifts}
            weekDays={weekDays}
            beginDrag={beginDrag}
            deleteAvailability={(event) => void deleteAvailability(event)}
            deleteShift={(event) => void deleteShift(event)}
            extendDrag={extendDrag}
            finishDrag={() => void finishDrag()}
          />
          {notice ? <p className="mt-3 rounded-xl border bg-white/70 px-4 py-3 text-sm shadow-sm dark:bg-zinc-900/70">{notice}</p> : null}
        </Card>
        <label className="block rounded-xl border bg-white/60 p-3 shadow-sm dark:bg-zinc-900/60">
          <span className="mb-1.5 block text-xs font-medium text-mutedForeground">{canManage ? "Shift notes (optional)" : "Availability notes (optional)"}</span>
          <input className="h-10 w-full rounded-xl border bg-white/80 px-3 text-sm shadow-sm dark:bg-zinc-900/80" placeholder={canManage ? "Closing shift, training, front counter..." : "Class ends at 2 PM, available to close..."} value={comments} onChange={(event) => setComments(event.target.value)} />
        </label>
        {canManage ? <AvailabilityList events={availability} /> : <ScheduleSummary availability={availability} shifts={shifts} />}
      </div>

      <div className="space-y-4">
        {canManage ? (
          <Card>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2"><Users className="h-4 w-4" /><h2 className="text-sm font-semibold">Employees</h2></div>
              {selectedEmployees.length ? <button className="text-xs text-mutedForeground hover:text-foreground" onClick={() => setSelectedEmployees([])}>Clear</button> : null}
            </div>
            <p className="mb-3 text-xs text-mutedForeground">{selectedEmployees.length} selected</p>
            <div className="space-y-2">
              {employees.map((employee) => {
                const selected = selectedEmployees.includes(employee.id);
                const color = employeeColor(employee.id);
                return (
                  <button key={employee.id} className={cn("flex w-full items-center gap-3 rounded-xl border bg-white/65 px-3 py-2.5 text-left shadow-sm transition dark:bg-zinc-900/65", selected && "border-zinc-950 bg-zinc-950 text-white dark:border-white dark:bg-white dark:text-zinc-950")} onClick={() => toggleEmployee(employee.id)}>
                    <span className={cn("h-3 w-3 shrink-0 rounded-full", color.swatch)} />
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-md border text-xs", selected ? "border-white/50 bg-white/15 dark:border-zinc-900/30 dark:bg-zinc-900/10" : "bg-white/70 dark:bg-zinc-900/70")}>{selected ? "✓" : ""}</span>
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{employee.name}</span><span className={cn("mt-0.5 block truncate text-xs", selected ? "text-white/70 dark:text-zinc-700" : "text-mutedForeground")}>{employee.department ?? "Operations"}</span></span>
                  </button>
                );
              })}
            </div>
          </Card>
        ) : null}
        <TimeOffQueue canManage={canManage} requests={requests} setRequestStatus={(id, status) => void setRequestStatus(id, status)} />
      </div>
    </div>
  );
}

function ScheduleBoard({ availability, beginDrag, canDeleteAvailability, canDeleteShifts, deleteAvailability, deleteShift, drag, extendDrag, finishDrag, shifts, weekDays }: {
  availability: CalendarEvent[];
  beginDrag: (date: string, index: number) => void;
  canDeleteAvailability: boolean;
  canDeleteShifts: boolean;
  deleteAvailability: (event: CalendarEvent) => void;
  deleteShift: (event: CalendarEvent) => void;
  drag: DragSelection | null;
  extendDrag: (date: string, index: number, buttons: number) => void;
  finishDrag: () => void;
  shifts: CalendarEvent[];
  weekDays: Date[];
}) {
  return (
    <div className="thin-scrollbar select-none overflow-x-auto [overflow-anchor:none]" onDragStart={(event) => event.preventDefault()}>
      <div className="min-w-[920px] [overflow-anchor:none]">
        <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b">
          <div />
          {weekDays.map((day) => <div key={day.toISOString()} className="border-l px-2 py-3 text-center"><p className="text-xs text-mutedForeground">{format(day, "EEE")}</p><p className={cn("mx-auto mt-1 flex h-7 w-fit min-w-7 items-center justify-center rounded-full px-1 text-sm font-semibold", isSameDay(day, new Date()) && "border-2 border-primary")}>{format(day, "MMM d")}</p></div>)}
        </div>
        <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))]">
          <div className="relative" style={{ height: SLOT_COUNT * SLOT_HEIGHT }}>
            {slots.map((index) => <span key={index} className="absolute right-3 -translate-y-2 text-xs text-mutedForeground" style={{ top: index * SLOT_HEIGHT }}>{index % 2 === 0 ? slotLabel(index) : ""}</span>)}
          </div>
          {weekDays.map((day) => {
            const date = format(day, "yyyy-MM-dd");
            const dayAvailability = availability.filter((event) => event.date === date);
            const dayShifts = shifts.filter((event) => event.date === date);
            const availabilityLayouts = eventLayouts(dayAvailability);
            const shiftLayouts = eventLayouts(dayShifts);
            return (
              <div key={date} className="relative border-l" style={{ height: SLOT_COUNT * SLOT_HEIGHT }} onMouseLeave={(event) => extendDrag(date, SLOT_COUNT - 1, event.buttons)} onMouseUp={finishDrag}>
                {slots.map((index) => (
                  <div key={index} className={cn("h-8 border-b border-dashed transition hover:bg-zinc-100/80 dark:hover:bg-zinc-900/80", index % 2 === 0 && "border-zinc-300 dark:border-zinc-700")} onMouseDown={(event) => { event.preventDefault(); beginDrag(date, index); }} onMouseEnter={(event) => extendDrag(date, index, event.buttons)} />
                ))}
                {dayAvailability.map((event) => {
                  const color = employeeColor(event.employee);
                  const layout = availabilityLayouts.get(event._id);
                  return (
                    <div key={event._id} className={cn("pointer-events-none absolute z-10 overflow-hidden rounded-lg border px-1.5 py-1 shadow-sm", color.availability)} style={layout?.style} title={`${event.employeeName ?? "Available"} · ${event.start}-${event.end}`}>
                      <p className={cn("text-[10px] font-semibold", layout?.narrow ? "max-h-full overflow-hidden pt-5 [text-orientation:mixed] [writing-mode:vertical-rl]" : "truncate", canDeleteAvailability && !layout?.narrow && "pr-5")}>{event.employeeName ?? "Available"}</p>
                      {!layout?.narrow ? <p className="truncate text-[9px] opacity-75">{event.start}-{event.end}</p> : null}
                      {canDeleteAvailability ? <button className="pointer-events-auto absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-white/55 hover:bg-white" aria-label="Remove availability" title="Remove availability" onClick={() => deleteAvailability(event)}><Trash2 className="h-3 w-3" /></button> : null}
                    </div>
                  );
                })}
                {dayShifts.map((event) => {
                  const color = employeeColor(event.employee);
                  const layout = shiftLayouts.get(event._id);
                  return (
                    <div key={event._id} className={cn("pointer-events-none absolute z-20 overflow-hidden rounded-lg border px-1.5 py-1 shadow-soft", color.shift)} style={layout?.style} title={`${event.employeeName ?? "Shift"} · ${event.start}-${event.end}`}>
                      <p className={cn("text-[10px] font-semibold", layout?.narrow ? "max-h-full overflow-hidden pt-5 [text-orientation:mixed] [writing-mode:vertical-rl]" : "truncate", canDeleteShifts && !layout?.narrow && "pr-5")}>{event.employeeName ?? "Shift"}</p>
                      {!layout?.narrow ? <p className="truncate text-[9px] text-white/75">{event.start}-{event.end}</p> : null}
                      {canDeleteShifts ? <button className="pointer-events-auto absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-white/15 hover:bg-white/30" aria-label="Delete scheduled shift" title="Delete scheduled shift" onClick={() => deleteShift(event)}><Trash2 className="h-3 w-3" /></button> : null}
                    </div>
                  );
                })}
                {drag?.date === date ? <div className="pointer-events-none absolute inset-x-1 z-30 rounded-lg border-2 border-dashed border-zinc-950 bg-zinc-400/35 dark:border-white dark:bg-white/20" style={selectionPosition(drag)} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function WeekNavigation({ setWeekStart, weekStart }: { setWeekStart: React.Dispatch<React.SetStateAction<Date>>; weekStart: Date }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => startOfMonth(weekStart));
  const calendarStart = startOfWeek(startOfMonth(pickerMonth), { weekStartsOn: 1 });
  const calendarDays = Array.from({ length: 42 }, (_, index) => addDays(calendarStart, index));

  useEffect(() => {
    if (!pickerOpen) setPickerMonth(startOfMonth(weekStart));
  }, [pickerOpen, weekStart]);

  return (
    <div className="relative flex items-center gap-2">
      <button className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Previous week" onClick={() => setWeekStart((date) => addWeeks(date, -1))}><ChevronLeft className="h-4 w-4" /></button>
      <button className="flex h-9 items-center gap-2 rounded-xl border bg-white/80 px-3 text-xs shadow-sm dark:bg-zinc-900/80" title="Choose a week" aria-expanded={pickerOpen} onClick={() => setPickerOpen((open) => !open)}>
        <CalendarDays className="h-4 w-4" />
        <span>{format(weekStart, "MMM yyyy")}</span>
      </button>
      <button className="flex h-9 w-9 items-center justify-center rounded-xl border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Next week" onClick={() => setWeekStart((date) => addWeeks(date, 1))}><ChevronRight className="h-4 w-4" /></button>
      {pickerOpen ? (
        <div className="absolute right-0 top-11 z-50 w-72 rounded-xl border bg-white p-3 shadow-soft dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between gap-2">
            <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Previous month" onClick={() => setPickerMonth((month) => addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-sm font-semibold">{format(pickerMonth, "MMMM yyyy")}</p>
            <button className="flex h-8 w-8 items-center justify-center rounded-lg border bg-white/80 shadow-sm dark:bg-zinc-900/80" aria-label="Next month" onClick={() => setPickerMonth((month) => addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mb-1 grid grid-cols-7 text-center text-[10px] uppercase text-mutedForeground">
            {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => (
              <button
                key={day.toISOString()}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg text-xs shadow-none",
                  !isSameMonth(day, pickerMonth) && "text-mutedForeground/50",
                  isSameWeek(day, weekStart, { weekStartsOn: 1 }) && "bg-muted",
                  isSameDay(day, weekStart) && "bg-primary text-primaryForeground",
                  isSameDay(day, new Date()) && "rounded-full ring-2 ring-primary ring-offset-2 ring-offset-white dark:ring-offset-zinc-900"
                )}
                onClick={() => {
                  setWeekStart(startOfWeek(day, { weekStartsOn: 1 }));
                  setPickerOpen(false);
                }}
              >
                {format(day, "d")}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AvailabilityList({ events }: { events: CalendarEvent[] }) {
  return (
    <Card>
      <CardTitle title="Availability This Week" detail="Soft colors are employee requests. Strong colors on the grid are scheduled shifts." />
      <div className="flex flex-wrap gap-2">
        {events.map((event) => <span key={event._id} className={cn("rounded-xl border px-3 py-2 text-xs shadow-sm", employeeColor(event.employee).availability)}>{event.employeeName} · {event.date} · {event.start}-{event.end}</span>)}
        {events.length === 0 ? <p className="text-sm text-mutedForeground">No availability requests this week.</p> : null}
      </div>
    </Card>
  );
}

function ScheduleSummary({ availability, shifts }: { availability: CalendarEvent[]; shifts: CalendarEvent[] }) {
  return (
    <Card>
      <CardTitle title="This Week" detail={`${availability.length} availability block${availability.length === 1 ? "" : "s"} · ${shifts.length} scheduled shift${shifts.length === 1 ? "" : "s"}`} />
      <p className="text-sm text-mutedForeground">Your soft-colored blocks are requests. Strong-colored blocks are shifts scheduled by management.</p>
    </Card>
  );
}

function TimeOffQueue({ canManage, requests, setRequestStatus }: { canManage: boolean; requests: TimeOffRequest[]; setRequestStatus: (id: string, status: TimeOffRequest["status"]) => void }) {
  return (
    <Card>
      <CardTitle title={canManage ? "Time-Off Queue" : "My Time-Off Requests"} detail="Approved requests automatically appear on calendar" />
      <div className="space-y-3">
        {requests.map((request) => (
          <div key={request._id} className="rounded-xl border bg-white/50 p-3 shadow-sm dark:bg-zinc-900/50">
            <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-medium">{request.employeeName}</p><p className="text-xs text-mutedForeground">{request.date} · {request.start}-{request.end}</p></div><StatusBadge value={request.status} /></div>
            <p className="mt-3 text-sm">{request.reason}</p>
            {canManage ? <div className="mt-3 flex gap-2"><button className={timeOffActionClass(request.status === "Approved", "approved")} onClick={() => setRequestStatus(request._id, "Approved")}>Approve</button><button className={timeOffActionClass(request.status === "Denied", "denied")} onClick={() => setRequestStatus(request._id, "Denied")}>Deny</button></div> : null}
          </div>
        ))}
        {requests.length === 0 ? <p className="py-6 text-center text-sm text-mutedForeground">No time-off requests.</p> : null}
      </div>
    </Card>
  );
}

function selectionPosition(selection: DragSelection) {
  const start = Math.min(selection.startIndex, selection.endIndex);
  const end = Math.max(selection.startIndex, selection.endIndex) + 1;
  return { top: start * SLOT_HEIGHT, height: Math.max(SLOT_HEIGHT, (end - start) * SLOT_HEIGHT) };
}

function eventLayouts(events: CalendarEvent[]) {
  const layouts = new Map<string, EventLayout>();
  const sorted = [...events].sort((a, b) => timeMinutes(a.start!) - timeMinutes(b.start!) || timeMinutes(a.end!) - timeMinutes(b.end!));
  let group: CalendarEvent[] = [];
  let groupEnd = -1;

  function layoutGroup() {
    if (group.length === 0) return;
    const laneEnds: number[] = [];
    const assignments = group.map((event) => {
      const start = timeMinutes(event.start!);
      const end = timeMinutes(event.end!);
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = end;
      return { event, lane };
    });
    const laneCount = laneEnds.length;
    for (const { event, lane } of assignments) {
      const width = 100 / laneCount;
      layouts.set(event._id, {
        narrow: laneCount > 1,
        style: {
          ...eventPosition(event.start!, event.end!),
          left: `calc(${lane * width}% + 4px)`,
          width: `calc(${width}% - 8px)`
        }
      });
    }
  }

  for (const event of sorted) {
    const start = timeMinutes(event.start!);
    const end = timeMinutes(event.end!);
    if (group.length > 0 && start >= groupEnd) {
      layoutGroup();
      group = [];
      groupEnd = -1;
    }
    group.push(event);
    groupEnd = Math.max(groupEnd, end);
  }
  layoutGroup();
  return layouts;
}

function eventPosition(start: string, end: string) {
  const visibleStart = Math.max(SLOT_START_HOUR * 60, timeMinutes(start));
  const visibleEnd = Math.min(SLOT_END_HOUR * 60, timeMinutes(end));
  return {
    top: ((visibleStart - SLOT_START_HOUR * 60) / SLOT_MINUTES) * SLOT_HEIGHT,
    height: Math.max(SLOT_HEIGHT, ((visibleEnd - visibleStart) / SLOT_MINUTES) * SLOT_HEIGHT)
  };
}

function selectionTimes(selection: DragSelection) {
  const start = Math.min(selection.startIndex, selection.endIndex);
  const end = Math.max(selection.startIndex, selection.endIndex) + 1;
  return { start: slotTime(start), end: slotTime(end) };
}

function slotTime(index: number) {
  const minutes = SLOT_START_HOUR * 60 + index * SLOT_MINUTES;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function slotLabel(index: number) {
  return format(parseISO(`2000-01-01T${slotTime(index)}`), "h a");
}

function timeMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function employeeColor(employeeId?: string) {
  const hash = Array.from(employeeId ?? "employee").reduce((total, character) => total + character.charCodeAt(0), 0);
  return employeeColors[hash % employeeColors.length];
}

function timeOffActionClass(selected: boolean, action: "approved" | "denied") {
  return cn(
    "h-8 rounded-xl border px-3 text-xs shadow-sm",
    !selected && "bg-white/70 dark:bg-zinc-900/70",
    selected && action === "approved" && "border-emerald-700 bg-emerald-600 text-white",
    selected && action === "denied" && "border-red-700 bg-red-600 text-white"
  );
}

function getError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
