import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { User } from "../models/User.js";
import { UserSession } from "../models/UserSession.js";
import { LoginResetToken } from "../models/LoginResetToken.js";
import { syncRoleProfile } from "../models/RoleProfiles.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { audit } from "../utils/audit.js";
import { notifyUsers } from "../utils/notifications.js";
import { clearLoginFailures, getLoginLockSeconds, loginAttemptKey, recordFailedLogin, validatePasswordStrength } from "../utils/security.js";

const router = Router();
const SESSION_DAYS = 7;

const loginSchema = z.object({
  identifier: z.string().optional(),
  email: z.string().optional(),
  password: z.string().min(1)
}).refine((data) => Boolean(data.identifier || data.email));

const notificationPreferencesSchema = z.object({
  inApp: z.boolean().optional(),
  messages: z.boolean().optional(),
  requests: z.boolean().optional(),
  operations: z.boolean().optional(),
  security: z.boolean().optional()
});

const profileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8)
});

const forgotPasswordSchema = z.object({
  identifier: z.string().min(3)
});

const resetPasswordSchema = z.object({
  token: z.string().min(24),
  password: z.string().min(8)
});

function signUser(user: ReturnType<typeof serializeUser>, sessionId: string) {
  return jwt.sign({ ...user, sid: sessionId }, process.env.JWT_SECRET ?? "dev-secret", { expiresIn: `${SESSION_DAYS}d` });
}

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
    status: user.status,
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

router.post("/signup", async (_req, res) => {
  return res.status(403).json({ message: "Staff accounts are created by a manager or administrator." });
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid login details" });
  }

  const identifier = (parsed.data.identifier ?? parsed.data.email ?? "").trim().toLowerCase();
  const attemptKey = loginAttemptKey(identifier, clientIp(req));
  const lockedFor = getLoginLockSeconds(attemptKey);
  if (lockedFor) {
    return res.status(429).json({ message: `Too many login attempts. Try again in ${lockedFor} seconds.` });
  }

  const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
  if (!user || user.status === "Inactive" || user.status === "Disabled") {
    recordFailedLogin(attemptKey);
    return res.status(401).json({ message: "Invalid username/email or password." });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    recordFailedLogin(attemptKey);
    return res.status(401).json({ message: "Invalid username/email or password." });
  }

  clearLoginFailures(attemptKey);
  user.lastLogin = new Date();
  await user.save();
  await syncRoleProfile(user);

  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await UserSession.create({
    user: user.id,
    userAgent: req.headers["user-agent"] ?? "Unknown device",
    ip: clientIp(req),
    expiresAt
  });

  await audit("User logged in", { user: { id: user.id, name: user.name }, entity: "UserSession", entityId: session.id });
  await notifyUsers([user._id], {
    title: "New sign-in",
    body: `${deviceLabel(session.userAgent)} signed in.`,
    type: "Info",
    category: "security",
    link: "/settings"
  });

  const payload = serializeUser(user);
  return res.json({ user: payload, token: signUser(payload, session.id) });
});

router.post("/logout", requireAuth, async (req: AuthRequest, res) => {
  if (req.sessionId) {
    await UserSession.findByIdAndUpdate(req.sessionId, { revokedAt: new Date() });
  }
  return res.status(204).send();
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.id).select("-passwordHash");
  return res.json({ user: serializeUser(user) });
});

router.patch("/me", requireAuth, async (req: AuthRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid profile details." });
  }
  const update = {
    ...(parsed.data.name ? { name: parsed.data.name.trim() } : {}),
    ...(parsed.data.email ? { email: parsed.data.email.trim().toLowerCase() } : {})
  };
  const user = await User.findByIdAndUpdate(req.user!.id, update, { new: true }).select("-passwordHash");
  await syncRoleProfile(user);
  await audit("Profile updated", { user: { id: req.user!.id, name: user!.name }, entity: "User", entityId: req.user!.id });
  return res.json({ user: serializeUser(user) });
});

router.get("/sessions", requireAuth, async (req: AuthRequest, res) => {
  const sessions = await UserSession.find({ user: req.user!.id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ lastSeenAt: -1 });
  return res.json(sessions.map((session) => ({
    id: session.id,
    current: session.id === req.sessionId,
    device: deviceLabel(session.userAgent),
    ip: session.ip,
    lastSeenAt: session.lastSeenAt,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt
  })));
});

router.delete("/sessions/:id", requireAuth, async (req: AuthRequest, res) => {
  const session = await UserSession.findOneAndUpdate(
    { _id: req.params.id, user: req.user!.id },
    { revokedAt: new Date() },
    { new: true }
  );
  if (!session) {
    return res.status(404).json({ message: "Session not found" });
  }
  return res.status(204).send();
});

router.patch("/preferences", requireAuth, async (req: AuthRequest, res) => {
  const parsed = notificationPreferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid notification preferences" });
  }

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    { $set: Object.fromEntries(Object.entries(parsed.data).map(([key, value]) => [`notificationPreferences.${key}`, value])) },
    { new: true }
  ).select("-passwordHash");

  await audit("Notification preferences updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "User", entityId: req.user!.id });
  return res.json({ user: serializeUser(user) });
});

router.patch("/password", requireAuth, async (req: AuthRequest, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter your current password and a new password." });
  }

  const user = await User.findById(req.user!.id);
  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }
  const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Current password is incorrect." });
  }
  const passwordCheck = validatePasswordStrength(parsed.data.newPassword);
  if (!passwordCheck.valid) {
    return res.status(400).json({ message: passwordCheck.issues.join(" ") });
  }

  user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await user.save();
  await LoginResetToken.updateMany({ user: user._id, usedAt: null }, { usedAt: new Date() });
  await audit("Password changed", { user: { id: user.id, name: user.name }, entity: "User", entityId: user.id });
  return res.json({ message: "Password changed." });
});

router.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter your username or email." });
  }

  const identifier = parsed.data.identifier.trim().toLowerCase();
  const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
  const generic = { message: "If that account exists, a secure password reset link has been created." };
  if (!user || user.status === "Inactive" || user.status === "Disabled") {
    return res.json(generic);
  }

  const token = crypto.randomBytes(32).toString("hex");
  await LoginResetToken.create({
    user: user._id,
    tokenHash: hashResetToken(token),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    requestedIp: clientIp(req)
  });
  await audit("Password reset requested", { user: { id: user.id, name: user.name }, entity: "User", entityId: user.id });

  return res.json({
    ...generic,
    ...(process.env.NODE_ENV === "production" ? {} : { resetToken: token })
  });
});

router.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter a valid reset token and new password." });
  }

  const reset = await LoginResetToken.findOne({
    tokenHash: hashResetToken(parsed.data.token),
    usedAt: null,
    expiresAt: { $gt: new Date() }
  });
  if (!reset) {
    return res.status(400).json({ message: "Reset link is invalid or expired." });
  }

  const user = await User.findById(reset.user);
  if (!user || user.status === "Inactive" || user.status === "Disabled") {
    return res.status(400).json({ message: "Reset link is invalid or expired." });
  }
  const passwordCheck = validatePasswordStrength(parsed.data.password);
  if (!passwordCheck.valid) {
    return res.status(400).json({ message: passwordCheck.issues.join(" ") });
  }

  user.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await user.save();
  reset.usedAt = new Date();
  await reset.save();
  await UserSession.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
  await audit("Password reset completed", { user: { id: user.id, name: user.name }, entity: "User", entityId: user.id });
  return res.json({ message: "Password reset. Sign in with the new password." });
});

function clientIp(req: { ip?: string; headers: Record<string, unknown>; socket?: { remoteAddress?: string } }) {
  const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "";
}

function deviceLabel(userAgent = "") {
  if (/iphone|android/i.test(userAgent)) return "Mobile browser";
  if (/ipad|tablet/i.test(userAgent)) return "Tablet browser";
  if (/chrome/i.test(userAgent)) return "Chrome browser";
  if (/safari/i.test(userAgent)) return "Safari browser";
  if (/firefox/i.test(userAgent)) return "Firefox browser";
  if (/edge/i.test(userAgent)) return "Edge browser";
  return "Browser";
}

function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export default router;
