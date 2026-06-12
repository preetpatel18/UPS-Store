import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { TimeOffRequest } from "../models/TimeOffRequest.js";
import { CalendarEvent } from "../models/CalendarEvent.js";
import { audit } from "../utils/audit.js";
import { notifyRoles, notifyUsers } from "../utils/notifications.js";
import { storeFilter, storeValue } from "../utils/tenancy.js";

const router = Router();

const createSchema = z.object({
  date: z.string(),
  start: z.string(),
  end: z.string(),
  reason: z.string().min(2),
  notes: z.string().optional()
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const query = req.user?.role === "Employee" ? { employee: req.user.id, ...storeFilter(req) } : storeFilter(req);
  const requests = await TimeOffRequest.find(query).sort({ createdAt: -1 });
  return res.json(requests);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid time-off request", issues: parsed.error.flatten() });
  }

  const request = await TimeOffRequest.create({
    ...parsed.data,
    employee: req.user!.id,
    employeeName: req.user!.name,
    store: storeValue(req)
  });

  await audit("Time-off request submitted", { user: { id: req.user!.id, name: req.user!.name }, entity: "TimeOffRequest", entityId: request.id, store: request.store?.toString() });
  await notifyRoles(["Manager", "Administrator"], {
    title: "New time-off request",
    body: `${request.employeeName} requested ${request.date} off.`,
    type: "Request",
    store: request.store,
    link: "/requests-off"
  }, req.user!.id);
  return res.status(201).json(request);
});

router.patch("/:id/status", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["Pending", "Approved", "Denied"]) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid request status" });
  }

  const request = await TimeOffRequest.findOneAndUpdate({ _id: req.params.id, ...storeFilter(req) }, { status: parsed.data.status, reviewedBy: req.user!.id }, { new: true });

  if (!request) {
    return res.status(404).json({ message: "Request not found" });
  }

  await CalendarEvent.deleteMany({
    type: "Time Off",
    ...storeFilter(req),
    $or: [
      { timeOffRequest: request._id },
      {
        timeOffRequest: { $exists: false },
        employee: request.employee,
        date: request.date,
        start: request.start,
        end: request.end
      }
    ]
  });

  if (request.status === "Approved") {
    await CalendarEvent.create({
      title: `${request.employeeName} time off`,
      type: "Time Off",
      store: request.store,
      employee: request.employee,
      employeeName: request.employeeName,
      timeOffRequest: request._id,
      date: request.date,
      start: request.start,
      end: request.end,
      comments: request.reason
    });
  }

  await audit(`Time-off request ${request.status.toLowerCase()}`, { user: { id: req.user!.id, name: req.user!.name }, entity: "TimeOffRequest", entityId: request.id, store: request.store?.toString() });
  await notifyUsers([request.employee], {
    title: `Time-off request ${request.status.toLowerCase()}`,
    body: `${request.date} · ${request.start}-${request.end}`,
    type: "Request",
    link: "/requests-off"
  });
  return res.json(request);
});

export default router;
