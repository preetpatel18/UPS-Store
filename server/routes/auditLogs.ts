import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { AuditLog } from "../models/AuditLog.js";
import { storeFilter } from "../utils/tenancy.js";

const router = Router();

router.get("/", requireAuth, requireRole("Administrator"), async (req, res) => {
  const logs = await AuditLog.find(storeFilter(req)).sort({ createdAt: -1 }).limit(200);
  return res.json(logs);
});

export default router;
