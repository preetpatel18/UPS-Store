import { Router, type NextFunction, type Response } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { Timesheet } from "../models/Timesheet.js";
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";
import { User } from "../models/User.js";
import { audit } from "../utils/audit.js";
import { notifyRoles } from "../utils/notifications.js";
import { storeFilter, storeValue } from "../utils/tenancy.js";

const router = Router();

const manualSchema = z.object({
  employee: z.string().optional(),
  employeeName: z.string().optional(),
  department: z.string().optional(),
  date: z.string().min(1),
  clockIn: z.string().min(1),
  clockOut: z.string().min(1),
  breakIn: z.string().optional(),
  breakOut: z.string().optional()
}).refine((data) => Boolean(data.breakIn) === Boolean(data.breakOut), {
  message: "Enter both optional break times or leave both empty.",
  path: ["breakOut"]
});

const editSchema = z.object({
  date: z.string().min(1).optional(),
  clockIn: z.string().min(1).optional(),
  clockOut: z.string().nullable().optional(),
  breakIn: z.string().nullable().optional(),
  breakOut: z.string().nullable().optional(),
  breakTime: z.string().optional(),
  totalHours: z.number().min(0).optional()
});

function requireEmployee(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== "Employee") {
    return res.status(403).json({ message: "Clock actions are only available to employees." });
  }
  return next();
}

function currentTime() {
  return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function minutesBetween(start?: string | null, end?: string | null) {
  if (!start || !end) return 0;
  const [startHour, startMinute] = start.split(":").map(Number);
  const [endHour, endMinute] = end.split(":").map(Number);
  return Math.max(0, endHour * 60 + endMinute - (startHour * 60 + startMinute));
}

function storedBreakMinutes(value?: string | null) {
  const minutes = Number.parseInt(value ?? "0", 10);
  return Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
}

function calculateTotalHours(clockIn?: string | null, clockOut?: string | null, breakIn?: string | null, breakOut?: string | null, accumulatedBreakMinutes?: number) {
  const shiftMinutes = minutesBetween(clockIn, clockOut);
  const breakMinutes = accumulatedBreakMinutes ?? minutesBetween(breakIn, breakOut);
  return Number((Math.max(0, shiftMinutes - breakMinutes) / 60).toFixed(2));
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const employeeIds = req.user?.role === "Employee"
    ? [req.user.id]
    : await User.find({ role: "Employee", ...storeFilter(req) }).distinct("_id");
  const query = { employee: { $in: employeeIds }, ...storeFilter(req) };
  const rows = await Timesheet.find(query).sort({ createdAt: -1 });
  return res.json(rows);
});

router.post("/clock-in", requireAuth, requireEmployee, async (req: AuthRequest, res) => {
  const existing = await Timesheet.findOne({ employee: req.user!.id, status: "Active" });
  if (existing) {
    return res.status(409).json({ message: "You are already clocked in", timesheet: existing });
  }

  const now = new Date();
  const row = await Timesheet.create({
    employee: req.user!.id,
    employeeName: req.user!.name,
    store: storeValue(req),
    department: req.user!.department ?? "Operations",
    date: now.toISOString().slice(0, 10),
    clockIn: currentTime(),
    status: "Active"
  });

  await audit("Clocked in", { user: { id: req.user!.id, name: req.user!.name }, entity: "Timesheet", entityId: row.id, store: row.store?.toString() });
  return res.status(201).json(row);
});

router.post("/clock-out", requireAuth, requireEmployee, async (req: AuthRequest, res) => {
  const row = await Timesheet.findOne({ employee: req.user!.id, status: "Active" }).sort({ createdAt: -1 });
  if (!row) {
    return res.status(404).json({ message: "No active clock-in found" });
  }

  const now = new Date();
  row.clockOut = currentTime();
  let breakMinutes = storedBreakMinutes(row.breakTime);
  if (row.breakIn && !row.breakOut) {
    row.breakOut = row.clockOut;
    breakMinutes += minutesBetween(row.breakIn, row.breakOut);
  }
  row.breakTime = `${breakMinutes}m`;
  row.totalHours = calculateTotalHours(row.clockIn, row.clockOut, row.breakIn, row.breakOut, breakMinutes);
  row.status = "Completed";
  await row.save();

  await audit("Clocked out", { user: { id: req.user!.id, name: req.user!.name }, entity: "Timesheet", entityId: row.id, store: row.store?.toString() });
  return res.json(row);
});

router.post("/break-in", requireAuth, requireEmployee, async (req: AuthRequest, res) => {
  const row = await Timesheet.findOne({ employee: req.user!.id, status: "Active" }).sort({ createdAt: -1 });
  if (!row) {
    return res.status(404).json({ message: "No active timesheet found" });
  }
  if (row.breakIn && !row.breakOut) {
    return res.status(409).json({ message: "Break is already active" });
  }

  row.breakIn = currentTime();
  row.breakOut = null;
  await row.save();

  await audit("Break started", { user: { id: req.user!.id, name: req.user!.name }, entity: "Timesheet", entityId: row.id, store: row.store?.toString() });
  return res.json(row);
});

router.post("/break-out", requireAuth, requireEmployee, async (req: AuthRequest, res) => {
  const row = await Timesheet.findOne({ employee: req.user!.id, status: "Active" }).sort({ createdAt: -1 });
  if (!row) {
    return res.status(404).json({ message: "No active timesheet found" });
  }
  if (!row.breakIn) {
    return res.status(409).json({ message: "Break has not been started" });
  }

  row.breakOut = currentTime();
  row.breakTime = `${storedBreakMinutes(row.breakTime) + minutesBetween(row.breakIn, row.breakOut)}m`;
  await row.save();

  await audit("Break ended", { user: { id: req.user!.id, name: req.user!.name }, entity: "Timesheet", entityId: row.id, store: row.store?.toString() });
  return res.json(row);
});

router.post("/adjustment-request", requireAuth, requireEmployee, async (req: AuthRequest, res) => {
  const parsed = z.object({
    timesheetId: z.string().optional(),
    message: z.string().min(3)
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Tell your manager what needs to be adjusted." });
  }

  let row = null;
  if (parsed.data.timesheetId) {
    row = await Timesheet.findOne({ _id: parsed.data.timesheetId, employee: req.user!.id });
    if (row) {
      row.status = "Adjustment Requested";
      await row.save();
    }
  }

  const recipients = await User.find({ role: { $in: ["Manager", "Administrator"] }, ...storeFilter(req) }).select("_id");
  const conversation = await Conversation.create({
    name: `Timesheet adjustment · ${req.user!.name}`,
    store: storeValue(req),
    members: [req.user!.id, ...recipients.map((user) => user._id)],
    createdBy: req.user!.id
  });
  const created = await Message.create({
    conversation: conversation.id,
    store: storeValue(req),
    from: req.user!.id,
    fromName: req.user!.name,
    recipients: recipients.map((user) => user._id),
    subject: `Timesheet adjustment request from ${req.user!.name}`,
    body: `${parsed.data.message}${row ? `\n\nTimesheet: ${row.date} ${row.clockIn}-${row.clockOut ?? "Active"}` : ""}`
  });

  await audit("Timesheet adjustment requested", { user: { id: req.user!.id, name: req.user!.name }, entity: "Message", entityId: created.id, store: storeValue(req) });
  await notifyRoles(["Manager", "Administrator"], {
    title: "Timesheet adjustment requested",
    body: `${req.user!.name} sent a timesheet correction request.`,
    type: "Request",
    store: storeValue(req),
    link: "/messages"
  }, req.user!.id);
  return res.status(201).json({ message: "Adjustment request sent to managers and administrators", timesheet: row, notification: created });
});

router.post("/", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid timesheet", issues: parsed.error.flatten() });
  }

  const employee = parsed.data.employee ? await User.findOne({ _id: parsed.data.employee, role: "Employee", ...storeFilter(req) }) : null;
  if (!employee || employee.role !== "Employee") {
    return res.status(400).json({ message: "Select a valid employee account" });
  }

  const row = await Timesheet.create({
    ...parsed.data,
    employee: employee.id,
    employeeName: employee.name,
    store: employee.store ?? storeValue(req),
    department: employee.department ?? parsed.data.department ?? "Operations",
    breakIn: parsed.data.breakIn || null,
    breakOut: parsed.data.breakOut || null,
    breakTime: `${minutesBetween(parsed.data.breakIn, parsed.data.breakOut)}m`,
    totalHours: calculateTotalHours(parsed.data.clockIn, parsed.data.clockOut, parsed.data.breakIn, parsed.data.breakOut),
    status: "Completed"
  });
  await audit("Timesheet created manually", { user: { id: req.user!.id, name: req.user!.name }, entity: "Timesheet", entityId: row.id, store: row.store?.toString() });
  return res.status(201).json(row);
});

router.patch("/:id", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const parsed = editSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid timesheet adjustment", issues: parsed.error.flatten() });
  }

  const row = await Timesheet.findOne({ _id: req.params.id, ...storeFilter(req) });
  if (!row) {
    return res.status(404).json({ message: "Timesheet not found" });
  }

  const before = {
    date: row.date,
    clockIn: row.clockIn,
    clockOut: row.clockOut,
    breakIn: row.breakIn,
    breakOut: row.breakOut,
    breakTime: row.breakTime,
    totalHours: row.totalHours
  };
  if (parsed.data.date !== undefined) row.date = parsed.data.date;
  if (parsed.data.clockIn !== undefined) row.clockIn = parsed.data.clockIn;
  if (parsed.data.clockOut !== undefined) row.clockOut = parsed.data.clockOut || null;
  if (parsed.data.breakIn !== undefined) row.breakIn = parsed.data.breakIn || null;
  if (parsed.data.breakOut !== undefined) row.breakOut = parsed.data.breakOut || null;
  row.breakTime = `${minutesBetween(row.breakIn, row.breakOut)}m`;
  row.totalHours = calculateTotalHours(row.clockIn, row.clockOut, row.breakIn, row.breakOut);
  row.status = row.clockOut ? "Completed" : "Active";
  await row.save();

  await audit("Timesheet adjusted", { user: { id: req.user!.id, name: req.user!.name }, entity: "Timesheet", entityId: row.id, store: row.store?.toString(), metadata: { before, after: parsed.data } });
  return res.json(row);
});

router.delete("/:id", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const row = await Timesheet.findOneAndDelete({ _id: req.params.id, ...storeFilter(req) });
  if (!row) {
    return res.status(404).json({ message: "Timesheet not found" });
  }

  await audit("Timesheet deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "Timesheet", entityId: row.id, store: row.store?.toString() });
  return res.status(204).send();
});

export default router;
