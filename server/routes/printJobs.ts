import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { PrintJob } from "../models/PrintJob.js";
import { audit } from "../utils/audit.js";
import { notifyRoles } from "../utils/notifications.js";
import { storeFilter, storeValue } from "../utils/tenancy.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const query = req.user?.role === "Employee"
    ? { createdBy: req.user.id, status: { $ne: "Completed" }, ...storeFilter(req) }
    : { status: { $ne: "Completed" }, ...storeFilter(req) };
  const jobs = await PrintJob.find(query).sort({ due: 1 });
  return res.json(jobs);
});

router.get("/completed", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const jobs = await PrintJob.find({ status: "Completed", ...storeFilter(req) }).sort({ updatedAt: -1 });
  return res.json(jobs);
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    customer: z.string().optional(),
    type: z.string().optional(),
    description: z.string().optional(),
    pricingInfo: z.string().optional(),
    due: z.string().optional(),
    status: z.enum(["Waiting", "Processing", "Ready", "Completed"]).default("Waiting")
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid print job", issues: parsed.error.flatten() });
  }

  const job = await PrintJob.create({
    customer: parsed.data.customer?.trim() || "Walk-in customer",
    store: storeValue(req),
    type: parsed.data.type?.trim() || "Print job",
    description: parsed.data.description ?? "",
    pricingInfo: parsed.data.pricingInfo ?? "",
    due: parsed.data.due ?? "",
    status: parsed.data.status,
    createdBy: req.user!.id,
    createdByName: req.user!.name
  });
  await audit("Print job created", { user: { id: req.user!.id, name: req.user!.name }, entity: "PrintJob", entityId: job.id, store: job.store?.toString() });
  await notifyRoles(["Manager", "Administrator"], {
    title: "New print job",
    body: `${job.customer} · ${job.type}`,
    type: "Info",
    store: job.store,
    link: "/print-jobs"
  }, req.user!.id);
  return res.status(201).json(job);
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    customer: z.string().optional(),
    type: z.string().optional(),
    status: z.enum(["Waiting", "Processing", "Ready", "Completed"]).optional(),
    description: z.string().optional(),
    pricingInfo: z.string().optional(),
    due: z.string().optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid print job update" });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.customer !== undefined) update.customer = parsed.data.customer.trim() || "Walk-in customer";
  if (parsed.data.type !== undefined) update.type = parsed.data.type.trim() || "Print job";
  if (parsed.data.status) update.status = parsed.data.status;
  if (parsed.data.description !== undefined) update.description = parsed.data.description;
  if (parsed.data.pricingInfo !== undefined) update.pricingInfo = parsed.data.pricingInfo;
  if (parsed.data.due !== undefined) update.due = parsed.data.due;

  const query = req.user?.role === "Employee" ? { _id: req.params.id, createdBy: req.user.id, ...storeFilter(req) } : { _id: req.params.id, ...storeFilter(req) };
  const job = await PrintJob.findOneAndUpdate(query, update, { new: true });
  if (!job) {
    return res.status(404).json({ message: "Print job not found" });
  }

  await audit("Print job updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "PrintJob", entityId: job.id, store: job.store?.toString() });
  return res.json(job);
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const query = req.user?.role === "Employee" ? { _id: req.params.id, createdBy: req.user.id, ...storeFilter(req) } : { _id: req.params.id, ...storeFilter(req) };
  const job = await PrintJob.findOneAndDelete(query);
  if (!job) {
    return res.status(404).json({ message: "Print job not found" });
  }

  await audit("Print job deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "PrintJob", entityId: job.id, store: job.store?.toString() });
  return res.status(204).send();
});

export default router;
