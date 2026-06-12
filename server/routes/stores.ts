import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { Store } from "../models/Store.js";
import { User } from "../models/User.js";
import { UserSession } from "../models/UserSession.js";
import { OwnerProfile, AdminProfile, ManagerProfile, EmployeeProfile } from "../models/RoleProfiles.js";
import { Timesheet } from "../models/Timesheet.js";
import { TimeOffRequest } from "../models/TimeOffRequest.js";
import { InventoryItem } from "../models/InventoryItem.js";
import { InventoryCategory } from "../models/InventoryCategory.js";
import { ProblemLog } from "../models/ProblemLog.js";
import { PrintJob } from "../models/PrintJob.js";
import { Message } from "../models/Message.js";
import { Conversation } from "../models/Conversation.js";
import { CalendarEvent } from "../models/CalendarEvent.js";
import { Notification } from "../models/Notification.js";
import { AuditLog } from "../models/AuditLog.js";
import { audit } from "../utils/audit.js";
import { bootstrapStoreDatabase, dropStoreDatabase, storeDatabaseName } from "../utils/storeDatabases.js";

const router = Router();

function serializeStaff(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email ?? "",
    username: user.username ?? "",
    role: user.role,
    status: normalizeStaffStatus(user.status),
    lastLogin: user.lastLogin ?? null,
    store: user.store?.toString() ?? "",
    storeName: user.storeName ?? ""
  };
}

function normalizeStaffStatus(status?: string) {
  if (status === "Inactive" || status === "Disabled") return "Disabled";
  if (status === "Pending" || status === "Scheduled") return "Pending";
  return "Active";
}

function serializeStore(store: any, admins: any[], managers: any[], employees = 0) {
  return {
    id: store.id,
    name: store.name,
    code: store.code,
    databaseName: storeDatabaseName(store),
    storeNumber: store.storeNumber ?? "",
    address: store.address ?? "",
    status: store.status,
    websiteStatus: store.websiteStatus ?? store.status ?? "Pending",
    paymentType: store.paymentType ?? "Monthly Subscription",
    priceSold: store.priceSold ?? 0,
    monthlySubscriptionPrice: store.monthlySubscriptionPrice ?? 0,
    nextDueDate: store.nextDueDate ?? "",
    paymentStatus: store.paymentStatus ?? "Due Soon",
    notes: store.notes ?? "",
    ownerAdmin: store.ownerAdmin?.toString() ?? "",
    assignedAdmins: admins.map(serializeStaff),
    assignedManagers: managers.map(serializeStaff),
    admins: admins.length,
    managers: managers.length,
    employees,
    createdAt: store.createdAt,
    updatedAt: store.updatedAt
  };
}

router.get("/", requireAuth, requireRole("Owner"), async (_req, res) => {
  const stores = await Store.find().sort({ name: 1 });
  const rows = await Promise.all(stores.map(async (store) => {
    const [admins, managers, employees] = await Promise.all([
      User.find({ store: store._id, role: "Administrator" }).select("-passwordHash").sort({ name: 1 }),
      User.find({ store: store._id, role: "Manager" }).select("-passwordHash").sort({ name: 1 }),
      User.countDocuments({ store: store._id, role: "Employee" })
    ]);
    if (!store.databaseName) {
      store.databaseName = storeDatabaseName(store);
      await store.save();
    }
    await bootstrapStoreDatabase(store, [...admins, ...managers]);
    return serializeStore(store, admins, managers, employees);
  }));
  return res.json(rows);
});

router.patch("/:id", requireAuth, requireRole("Owner"), async (req: AuthRequest, res) => {
  const parsed = z.object({
    name: z.string().min(2).optional(),
    code: z.string().min(2).optional(),
    storeNumber: z.string().optional(),
    address: z.string().optional(),
    status: z.enum(["Active", "Inactive"]).optional(),
    websiteStatus: z.enum(["Active", "Pending", "Suspended", "Cancelled"]).optional(),
    paymentType: z.enum(["One-Time Purchase", "Monthly Subscription"]).optional(),
    priceSold: z.coerce.number().min(0).optional(),
    monthlySubscriptionPrice: z.coerce.number().min(0).optional(),
    nextDueDate: z.string().optional(),
    paymentStatus: z.enum(["Paid", "Due Soon", "Overdue", "Cancelled"]).optional(),
    notes: z.string().optional()
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid store update" });
  }

  const update = {
    ...parsed.data,
    ...(parsed.data.code ? { code: parsed.data.code.trim().toLowerCase() } : {})
  };
  const store = await Store.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!store) {
    return res.status(404).json({ message: "Store not found" });
  }
  const [admins, managers, employees] = await Promise.all([
    User.find({ store: store._id, role: "Administrator" }).select("-passwordHash").sort({ name: 1 }),
    User.find({ store: store._id, role: "Manager" }).select("-passwordHash").sort({ name: 1 }),
    User.countDocuments({ store: store._id, role: "Employee" })
  ]);
  if (!store.databaseName) {
    store.databaseName = storeDatabaseName(store);
    await store.save();
  }
  await bootstrapStoreDatabase(store, [...admins, ...managers]);
  await audit("Store configuration updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "Store", entityId: store.id, store: store.id });
  return res.json(serializeStore(store, admins, managers, employees));
});

router.delete("/:id", requireAuth, requireRole("Owner"), async (req: AuthRequest, res) => {
  const store = await Store.findById(req.params.id);
  if (!store) {
    return res.status(404).json({ message: "Store not found" });
  }

  const users = await User.find({ store: store._id }).select("_id");
  const userIds = users.map((user) => user._id);

  await Promise.all([
    UserSession.deleteMany({ user: { $in: userIds } }),
    OwnerProfile.deleteMany({ assignedStoreId: store._id }),
    AdminProfile.deleteMany({ assignedStoreId: store._id }),
    ManagerProfile.deleteMany({ assignedStoreId: store._id }),
    EmployeeProfile.deleteMany({ assignedStoreId: store._id }),
    User.deleteMany({ store: store._id }),
    Timesheet.deleteMany({ store: store._id }),
    TimeOffRequest.deleteMany({ store: store._id }),
    InventoryItem.deleteMany({ store: store._id }),
    InventoryCategory.deleteMany({ store: store._id }),
    ProblemLog.deleteMany({ store: store._id }),
    PrintJob.deleteMany({ store: store._id }),
    Message.deleteMany({ store: store._id }),
    Conversation.deleteMany({ store: store._id }),
    CalendarEvent.deleteMany({ store: store._id }),
    Notification.deleteMany({ store: store._id }),
    AuditLog.deleteMany({ store: store._id })
  ]);

  await dropStoreDatabase(store.databaseName ?? storeDatabaseName(store));
  await store.deleteOne();
  await audit("UPS Store deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "Store", entityId: store.id, store: store.id });
  return res.status(204).send();
});

export default router;
