import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { ProblemLog } from "../models/ProblemLog.js";
import { audit } from "../utils/audit.js";
import { notifyRoles } from "../utils/notifications.js";
import { storeFilter, storeValue } from "../utils/tenancy.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const logs = await ProblemLog.find({ status: { $ne: "Resolved" }, ...storeFilter(req) }).sort({ createdAt: -1 });
  return res.json(logs);
});

router.get("/resolved", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const logs = await ProblemLog.find({ status: "Resolved", ...storeFilter(req) }).sort({ updatedAt: -1 });
  return res.json(logs);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    category: z.string().optional(),
    priority: z.enum(["Low", "Medium", "High"]).default("Medium"),
    description: z.string().optional(),
    photos: z.array(z.string()).optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid problem log", issues: parsed.error.flatten() });
  }

  const log = await ProblemLog.create({
    ...parsed.data,
    category: parsed.data.category?.trim() || "General",
    description: parsed.data.description ?? "",
    store: storeValue(req),
    owner: req.user!.id,
    ownerName: req.user!.name
  });
  await audit("Problem log created", { user: { id: req.user!.id, name: req.user!.name }, entity: "ProblemLog", entityId: log.id, store: log.store?.toString() });
  await notifyRoles(["Manager", "Administrator"], {
    title: `${log.priority} priority problem logged`,
    body: `${log.category}: ${log.description || "No description provided"}`,
    type: "Alert",
    store: log.store,
    link: "/problem-log"
  }, req.user!.id);
  return res.status(201).json(log);
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    status: z.enum(["In Progress", "Resolved"]).optional(),
    priority: z.enum(["Low", "Medium", "High"]).optional(),
    description: z.string().optional(),
    comment: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid problem update" });
  }

  const log = await ProblemLog.findOne({ _id: req.params.id, ...storeFilter(req) });
  if (!log) {
    return res.status(404).json({ message: "Problem log not found" });
  }

  if (parsed.data.description !== undefined) {
    log.description = parsed.data.description;
    log.history.push({ action: "Description updated", status: log.status, user: req.user!.id } as never);
  }

  if (parsed.data.status) {
    log.status = parsed.data.status;
    log.history.push({ action: "Status updated", status: parsed.data.status, user: req.user!.id } as never);
  }

  if (parsed.data.priority && parsed.data.priority !== log.priority) {
    log.priority = parsed.data.priority;
    log.history.push({ action: `Priority changed to ${parsed.data.priority}`, status: log.status, user: req.user!.id } as never);
  }

  const message = parsed.data.comment ?? (parsed.data.description ? "Description updated" : undefined);
  if (message) {
    log.comments.push({ author: req.user!.id, authorName: req.user!.name, message, status: log.status } as never);
  }
  await log.save();

  await audit("Problem log updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "ProblemLog", entityId: log.id, store: log.store?.toString() });
  return res.json(log);
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const log = await ProblemLog.findOneAndDelete({ _id: req.params.id, ...storeFilter(req) });
  if (!log) {
    return res.status(404).json({ message: "Problem log not found" });
  }

  await audit("Problem log deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "ProblemLog", entityId: log.id, store: log.store?.toString() });
  return res.status(204).send();
});

export default router;
