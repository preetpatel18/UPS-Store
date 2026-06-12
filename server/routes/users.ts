import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { User, type UserRole } from "../models/User.js";
import { Store } from "../models/Store.js";
import { syncRoleProfile } from "../models/RoleProfiles.js";
import { audit } from "../utils/audit.js";
import { validatePasswordStrength } from "../utils/security.js";
import { isOwner, requireStore, storeFilter } from "../utils/tenancy.js";
import { bootstrapStoreDatabase, storeDatabaseName } from "../utils/storeDatabases.js";

const router = Router();

const createUserSchema = z.object({
  name: z.string().min(2),
  username: z.string().min(3).regex(/^[a-zA-Z0-9._-]+$/),
  password: z.string().min(8),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["Employee", "Manager", "Administrator"]).default("Employee"),
  department: z.string().default("Operations"),
  status: z.enum(["Working", "Scheduled", "Off", "Inactive"]).default("Scheduled"),
  profilePicture: z.string().optional(),
  assignedStoreId: z.string().optional(),
  storeName: z.string().optional(),
  storeCode: z.string().optional(),
  storeNumber: z.string().optional(),
  address: z.string().optional(),
  paymentType: z.enum(["One-Time Purchase", "Monthly Subscription"]).optional(),
  priceSold: z.coerce.number().min(0).optional(),
  monthlySubscriptionPrice: z.coerce.number().min(0).optional(),
  nextDueDate: z.string().optional()
});

const updateUserSchema = z.object({
  name: z.string().min(2).optional(),
  username: z.string().min(3).regex(/^[a-zA-Z0-9._-]+$/).optional(),
  email: z.string().email().optional().or(z.literal("")),
  role: z.enum(["Employee", "Manager", "Administrator"]).optional(),
  department: z.string().optional(),
  status: z.enum(["Active", "Disabled", "Pending", "Working", "Scheduled", "Off", "Inactive"]).optional(),
  password: z.string().min(8).optional(),
  profilePicture: z.string().optional()
});

const resetPasswordSchema = z.object({
  password: z.string().min(8)
});

function serializeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    username: user.username ?? user.email?.split("@")[0] ?? "",
    email: user.email ?? "",
    role: user.role,
    store: user.store?.toString() ?? "",
    storeName: user.storeName ?? "",
    department: user.department,
    status: normalizeStaffStatus(user.status),
    rawStatus: user.status,
    lastLogin: user.lastLogin ?? null,
    profilePicture: user.profilePicture ?? "",
    notificationPreferences: {
      inApp: user.notificationPreferences?.inApp ?? true,
      messages: user.notificationPreferences?.messages ?? true,
      requests: user.notificationPreferences?.requests ?? true,
      operations: user.notificationPreferences?.operations ?? true,
      security: user.notificationPreferences?.security ?? true
    }
  };
}

function normalizeStaffStatus(status?: string) {
  if (status === "Inactive" || status === "Disabled") return "Disabled";
  if (status === "Pending" || status === "Scheduled") return "Pending";
  return "Active";
}

function canManageUser(actorRole: UserRole, targetRole: UserRole, requestedRole?: UserRole) {
  if (actorRole === "Owner") {
    return (targetRole === "Administrator" || targetRole === "Manager")
      && (!requestedRole || requestedRole === "Administrator" || requestedRole === "Manager");
  }
  if (actorRole === "Administrator") {
    return (targetRole === "Manager" || targetRole === "Employee")
      && (!requestedRole || requestedRole === "Manager" || requestedRole === "Employee");
  }
  return targetRole === "Employee" && (!requestedRole || requestedRole === "Employee");
}

router.get("/directory", requireAuth, async (req: AuthRequest, res) => {
  const roleFilter = req.user?.role === "Owner" ? { role: { $in: ["Administrator", "Manager"] } } : {};
  const users = await User.find({ status: { $nin: ["Inactive", "Disabled"] }, ...roleFilter, ...storeFilter(req) }).select("-passwordHash").sort({ storeName: 1, name: 1 });
  return res.json(users.map(serializeUser));
});

router.get("/", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const roleFilter = req.user?.role === "Owner" ? { role: { $in: ["Administrator", "Manager"] } } : {};
  const users = await User.find({ ...storeFilter(req), ...roleFilter }).select("-passwordHash").sort({ storeName: 1, name: 1 });
  return res.json(users.map(serializeUser));
});

router.post("/", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid staff account", issues: parsed.error.flatten() });
  }
  if (req.user!.role === "Manager" && parsed.data.role !== "Employee") {
    return res.status(403).json({ message: "Managers can only create employee accounts." });
  }
  if (req.user!.role === "Owner" && parsed.data.role === "Employee") {
    return res.status(403).json({ message: "Owner accounts can only create administrators and managers." });
  }
  if (req.user!.role === "Administrator" && parsed.data.role === "Administrator") {
    return res.status(403).json({ message: "Only the platform owner can create store administrators." });
  }
  if (parsed.data.role === "Administrator" && req.user!.role !== "Owner") {
    return res.status(403).json({ message: "Only the platform owner can create store administrators." });
  }
  if (parsed.data.role === "Administrator" && req.user!.role === "Owner" && !parsed.data.storeName?.trim() && !parsed.data.assignedStoreId) {
    return res.status(400).json({ message: "Enter the UPS store name or select an existing UPS store for this administrator." });
  }
  const passwordCheck = validatePasswordStrength(parsed.data.password);
  if (!passwordCheck.valid) {
    return res.status(400).json({ message: passwordCheck.issues.join(" ") });
  }

  const username = parsed.data.username.toLowerCase();
  const email = parsed.data.email?.trim().toLowerCase() || `${username}@storeops.local`;
  const existing = await User.findOne({ $or: [{ username }, ...(email ? [{ email }] : [])] });
  if (existing) {
    return res.status(409).json({ message: "Username or email already exists." });
  }

  const { store, storeName } = await resolveTargetStore(req, parsed.data);
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  try {
    const defaultStatus = parsed.data.role === "Employee" ? "Scheduled" : "Active";
    const user = await User.create({ ...parsed.data, username, email, passwordHash, store, storeName, status: parsed.data.status ?? defaultStatus });
    if (parsed.data.role === "Administrator" && store) {
      await Store.findByIdAndUpdate(store, { ownerAdmin: user._id });
    }
    await syncRoleProfile(user);
    const storeRecord = store ? await Store.findById(store) : null;
    if (storeRecord) {
      await bootstrapStoreDatabase(storeRecord, [user]);
    }
    await audit("Staff account created", { user: { id: req.user!.id, name: req.user!.name }, entity: "User", entityId: user.id, store });
    return res.status(201).json(serializeUser(user));
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "Username or email already exists." });
    }
    throw error;
  }
});

router.patch("/:id", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid user update", issues: parsed.error.flatten() });
  }

  const target = await User.findById(req.params.id);
  if (!target) {
    return res.status(404).json({ message: "User not found" });
  }
  if (!canManageUser(req.user!.role, target.role as UserRole, parsed.data.role)) {
    return res.status(403).json({ message: "Managers can only update employee accounts." });
  }
  if (!isOwner(req) && target.store?.toString() !== req.user!.store) {
    return res.status(403).json({ message: "You can only manage users in your own store." });
  }

  const update: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.password) {
    const passwordCheck = validatePasswordStrength(parsed.data.password);
    if (!passwordCheck.valid) {
      return res.status(400).json({ message: passwordCheck.issues.join(" ") });
    }
    update.passwordHash = await bcrypt.hash(parsed.data.password, 12);
    delete update.password;
  }
  if (parsed.data.email !== undefined) {
    update.email = parsed.data.email.trim().toLowerCase() || undefined;
  }
  if (parsed.data.username) {
    update.username = parsed.data.username.toLowerCase();
  }

  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select("-passwordHash");
  await syncRoleProfile(user);
  await audit("User updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "User", entityId: user!.id, store: target.store?.toString() });
  return res.json(serializeUser(user));
});

router.patch("/:id/reset-password", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter a valid temporary password." });
  }

  const target = await User.findById(req.params.id);
  if (!target) {
    return res.status(404).json({ message: "User not found" });
  }
  if (!canManageUser(req.user!.role, target.role as UserRole)) {
    return res.status(403).json({ message: "You cannot reset credentials for this role." });
  }
  if (!isOwner(req) && target.store?.toString() !== req.user!.store) {
    return res.status(403).json({ message: "You can only reset users in your own store." });
  }

  const passwordCheck = validatePasswordStrength(parsed.data.password);
  if (!passwordCheck.valid) {
    return res.status(400).json({ message: passwordCheck.issues.join(" ") });
  }

  target.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await target.save();
  await syncRoleProfile(target);
  await audit("User password reset", { user: { id: req.user!.id, name: req.user!.name }, entity: "User", entityId: target.id, store: target.store?.toString() });
  return res.json({ message: `${target.name}'s temporary password was updated.` });
});

router.delete("/:id", requireAuth, requireRole("Manager"), async (req: AuthRequest, res) => {
  if (req.params.id === req.user!.id) {
    return res.status(400).json({ message: "You cannot remove your own account." });
  }

  const target = await User.findById(req.params.id);
  if (!target) {
    return res.status(404).json({ message: "User not found" });
  }
  if (!canManageUser(req.user!.role, target.role as UserRole)) {
    return res.status(403).json({ message: "Managers can only remove employee accounts." });
  }
  if (!isOwner(req) && target.store?.toString() !== req.user!.store) {
    return res.status(403).json({ message: "You can only remove users in your own store." });
  }

  target.status = "Disabled";
  await target.save();
  await syncRoleProfile(target);
  await audit("Staff account disabled", { user: { id: req.user!.id, name: req.user!.name }, entity: "User", entityId: target.id, store: target.store?.toString() });
  return res.status(204).send();
});

async function resolveTargetStore(req: AuthRequest, data: z.infer<typeof createUserSchema>) {
  if (req.user!.role === "Owner" && data.role === "Administrator") {
    if (data.assignedStoreId) {
      const existingStore = await Store.findById(data.assignedStoreId);
      if (!existingStore) {
        throw new Error("Selected UPS store was not found.");
      }
      return { store: existingStore._id, storeName: existingStore.name };
    }

    const name = data.storeName?.trim();
    if (!name) {
      throw new Error("Enter the UPS store name for this administrator.");
    }
    const code = (data.storeCode?.trim() || slugStoreName(name)).toLowerCase();
    const draft = {
      name,
      code,
      databaseName: storeDatabaseName({ storeNumber: data.storeNumber, code, name }),
      storeNumber: data.storeNumber ?? "",
      address: data.address ?? "",
      paymentType: data.paymentType ?? "Monthly Subscription",
      priceSold: data.priceSold ?? 0,
      monthlySubscriptionPrice: data.monthlySubscriptionPrice ?? 0,
      nextDueDate: data.nextDueDate ?? "",
      websiteStatus: "Pending"
    };
    const store = await Store.create(draft);
    await bootstrapStoreDatabase(store);
    return { store: store._id, storeName: store.name };
  }

  if (req.user!.role === "Owner") {
    if (!data.assignedStoreId) {
      throw new Error("Select a UPS store for this staff member.");
    }
    const store = await Store.findById(data.assignedStoreId);
    if (!store) {
      throw new Error("Selected UPS store was not found.");
    }
    return { store: store._id, storeName: store.name };
  }

  const store = requireStore(req);
  return { store, storeName: req.user!.storeName ?? "" };
}

function slugStoreName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `store-${Date.now()}`;
}

export default router;
