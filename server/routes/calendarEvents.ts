import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { CalendarEvent } from "../models/CalendarEvent.js";
import { User } from "../models/User.js";
import { audit } from "../utils/audit.js";
import { notifyUsers } from "../utils/notifications.js";
import { storeFilter, storeValue } from "../utils/tenancy.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  await normalizeConnectedRanges();
  const query = req.user?.role === "Employee" ? { employee: req.user.id, ...storeFilter(req) } : storeFilter(req);
  const events = await CalendarEvent.find(query).sort({ date: 1 });
  return res.json(events);
});

router.post("/shifts/batch", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const parsed = z.object({
    employees: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1),
    date: z.string().min(1),
    start: z.string().min(1),
    end: z.string().min(1),
    comments: z.string().optional()
  }).refine((data) => data.end > data.start, {
    message: "Shift end time must be after its start time.",
    path: ["end"]
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Select employees and drag a valid shift time.", issues: parsed.error.flatten() });
  }

  const employees = await User.find({ _id: { $in: parsed.data.employees }, role: "Employee", ...storeFilter(req) });
  if (employees.length !== new Set(parsed.data.employees).size) {
    return res.status(400).json({ message: "Select valid employee accounts." });
  }

  const shifts = [];
  for (const employee of employees) {
    shifts.push(await mergeCalendarRange({
      title: `${employee.name} shift`,
      type: "Shift",
      store: employee.store ?? storeValue(req),
      employee: employee.id,
      employeeName: employee.name,
      date: parsed.data.date,
      start: parsed.data.start,
      end: parsed.data.end,
      comments: parsed.data.comments
    }));
  }

  await audit("Schedule shifts created", {
    user: { id: req.user!.id, name: req.user!.name },
    entity: "CalendarEvent",
    metadata: { employeeCount: shifts.length, date: parsed.data.date, start: parsed.data.start, end: parsed.data.end }
  });
  await notifyUsers(employees.map((employee) => employee._id), {
    title: "New shift scheduled",
    body: `${parsed.data.date} · ${parsed.data.start}-${parsed.data.end}`,
    type: "Info",
    link: "/calendar"
  });
  return res.status(201).json(shifts);
});

router.delete("/shifts/:id", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const shift = await CalendarEvent.findOneAndDelete({ _id: req.params.id, type: "Shift", ...storeFilter(req) });
  if (!shift) {
    return res.status(404).json({ message: "Shift not found." });
  }

  await audit("Schedule shift deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "CalendarEvent", entityId: shift.id, store: shift.store?.toString() });
  return res.status(204).send();
});

router.delete("/availability/:id", requireAuth, async (req: AuthRequest, res) => {
  const query = req.user!.role === "Employee"
    ? { _id: req.params.id, type: "Availability", employee: req.user!.id, ...storeFilter(req) }
    : { _id: req.params.id, type: "Availability", ...storeFilter(req) };
  const availability = await CalendarEvent.findOneAndDelete(query);
  if (!availability) {
    return res.status(404).json({ message: "Availability request not found." });
  }

  await audit("Availability deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "CalendarEvent", entityId: availability.id, store: availability.store?.toString() });
  return res.status(204).send();
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    title: z.string().min(2),
    type: z.enum(["Shift", "Time Off", "Availability"]).default("Shift"),
    employee: z.string().optional(),
    employeeName: z.string().optional(),
    date: z.string(),
    start: z.string().optional(),
    end: z.string().optional(),
    comments: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid calendar event", issues: parsed.error.flatten() });
  }

  if (req.user!.role === "Employee" && parsed.data.type !== "Availability") {
    return res.status(403).json({ message: "Employees can only submit availability from the calendar" });
  }
  if (!parsed.data.start || !parsed.data.end || parsed.data.end <= parsed.data.start) {
    return res.status(400).json({ message: "Select a valid start and end time." });
  }

  const employee = parsed.data.employee ?? req.user!.id;
  const employeeName = parsed.data.employeeName ?? req.user!.name;
  const event = parsed.data.type === "Availability"
    ? await mergeCalendarRange({ ...parsed.data, type: "Availability", store: storeValue(req), employee, employeeName, start: parsed.data.start, end: parsed.data.end })
    : await CalendarEvent.create({ ...parsed.data, store: storeValue(req), employee, employeeName });
  await audit("Calendar event created", { user: { id: req.user!.id, name: req.user!.name }, entity: "CalendarEvent", entityId: event.id, store: event.store?.toString() });
  return res.status(201).json(event);
});

async function normalizeConnectedRanges() {
  const events = await CalendarEvent.find({ type: { $in: ["Shift", "Availability"] }, employee: { $exists: true }, start: { $exists: true }, end: { $exists: true } })
    .sort({ employee: 1, type: 1, date: 1, start: 1, end: 1 });
  const groups = new Map<string, typeof events>();
  for (const event of events) {
    const key = `${event.store?.toString() ?? "global"}-${event.employee?.toString()}-${event.type}-${event.date}`;
    const group = groups.get(key) ?? [];
    group.push(event);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    let current = group[0];
    for (const event of group.slice(1)) {
      if (current.end! >= event.start!) {
        current.end = maxTime(current.end!, event.end!);
        current.start = minTime(current.start!, event.start!);
        current.comments = mergeComments(current.comments, event.comments);
        await current.save();
        await CalendarEvent.deleteOne({ _id: event._id });
      } else {
        current = event;
      }
    }
  }
}

async function mergeCalendarRange(data: {
  title: string;
  type: "Shift" | "Availability";
  store?: unknown;
  employee: string;
  employeeName: string;
  date: string;
  start: string;
  end: string;
  comments?: string;
}) {
  const candidates = await CalendarEvent.find({
    type: data.type,
    store: data.store ?? null,
    employee: data.employee,
    date: data.date
  }).sort({ start: 1 });
  let start = data.start;
  let end = data.end;
  const connected: typeof candidates = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const event of candidates) {
      if (connected.includes(event) || event.start! > end || event.end! < start) continue;
      connected.push(event);
      start = minTime(start, event.start!);
      end = maxTime(end, event.end!);
      changed = true;
    }
  }
  if (connected.length === 0) {
    return CalendarEvent.create({ ...data, comments: data.comments?.trim() });
  }

  const [event, ...duplicates] = connected;
  event.title = data.title;
  event.employeeName = data.employeeName;
  event.start = start;
  event.end = end;
  event.comments = connected.reduce((comments, connectedEvent) => mergeComments(comments, connectedEvent.comments), data.comments?.trim());
  await event.save();
  if (duplicates.length) {
    await CalendarEvent.deleteMany({ _id: { $in: duplicates.map((duplicate) => duplicate._id) } });
  }
  return event;
}

function minTime(first: string, second: string) {
  return first <= second ? first : second;
}

function maxTime(first: string, second: string) {
  return first >= second ? first : second;
}

function mergeComments(first?: string | null, second?: string | null) {
  const comments = [first?.trim(), second?.trim()].filter(Boolean);
  return Array.from(new Set(comments)).join(" · ") || undefined;
}

export default router;
