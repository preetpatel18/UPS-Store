import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { InventoryItem } from "../models/InventoryItem.js";
import { PrintJob } from "../models/PrintJob.js";
import { ProblemLog } from "../models/ProblemLog.js";
import { User } from "../models/User.js";
import { storeFilter } from "../utils/tenancy.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const query = String(req.query.q ?? "").trim();
  if (query.length < 2) {
    return res.json([]);
  }

  const pattern = new RegExp(escapeRegex(query), "i");
  const employeePrintQuery = req.user!.role === "Employee" ? { createdBy: req.user!.id } : {};
  const [problems, printJobs, inventory, users] = await Promise.all([
    ProblemLog.find({ ...storeFilter(req), $or: [{ category: pattern }, { description: pattern }, { status: pattern }, { priority: pattern }] }).limit(5),
    PrintJob.find({ ...storeFilter(req), ...employeePrintQuery, $or: [{ customer: pattern }, { type: pattern }, { description: pattern }, { status: pattern }] }).limit(5),
    InventoryItem.find({ ...storeFilter(req), $or: [{ name: pattern }, { sku: pattern }, { category: pattern }] }).limit(5),
    req.user!.role === "Employee"
      ? []
      : User.find({ ...storeFilter(req), $or: [{ name: pattern }, { username: pattern }, { department: pattern }, { role: pattern }, { storeName: pattern }] }).limit(5)
  ]);

  return res.json([
    ...problems.map((problem) => ({ id: problem.id, title: problem.category, detail: problem.description || `${problem.priority} priority problem`, type: "Problem", link: "/problem-log" })),
    ...printJobs.map((job) => ({ id: job.id, title: job.customer, detail: job.type, type: "Print Job", link: "/print-jobs" })),
    ...inventory.map((item) => ({ id: item.id, title: item.name, detail: `${item.category} · ${item.quantity} in stock`, type: "Inventory", link: "/inventory" })),
    ...users.map((user) => ({ id: user.id, title: user.name, detail: `${user.role} · ${user.department}`, type: "Staff", link: "/management/staff" }))
  ]);
});

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default router;
