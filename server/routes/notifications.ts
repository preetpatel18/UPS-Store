import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { Notification } from "../models/Notification.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const notifications = await Notification.find({ recipient: req.user!.id }).sort({ createdAt: -1 }).limit(40);
  return res.json(notifications);
});

router.patch("/read-all", requireAuth, async (req: AuthRequest, res) => {
  await Notification.updateMany({ recipient: req.user!.id, read: false }, { read: true });
  return res.json({ ok: true });
});

router.patch("/:id/read", requireAuth, async (req: AuthRequest, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user!.id },
    { read: true },
    { new: true }
  );
  if (!notification) {
    return res.status(404).json({ message: "Notification not found" });
  }
  return res.json(notification);
});

export default router;
