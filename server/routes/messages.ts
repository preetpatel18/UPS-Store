import { Router, type NextFunction, type Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { Conversation } from "../models/Conversation.js";
import { Message } from "../models/Message.js";
import { User } from "../models/User.js";
import { audit } from "../utils/audit.js";
import { notifyUsers } from "../utils/notifications.js";
import { storeFilter, storeValue } from "../utils/tenancy.js";

const router = Router();
const asyncRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };

const attachmentSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  url: z.string().min(1)
});
const memberIdsSchema = z.array(z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid staff member"));

async function findConversationForUser(id: string, userId: string, req?: AuthRequest) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Conversation.findOne({ _id: id, members: userId, ...(req ? storeFilter(req) : {}) });
}

async function findMessage(id: string | string[]) {
  return mongoose.isValidObjectId(id) ? Message.findById(id) : null;
}

async function canAccessMessage(message: any, userId: string) {
  if (message.conversation) {
    return Boolean(await Conversation.findOne({ _id: message.conversation, members: userId }));
  }
  return message.from.toString() === userId
    || message.recipients.length === 0
    || message.recipients.some((recipient: any) => recipient.toString() === userId);
}

async function listConversations(req: AuthRequest) {
  return Conversation.find({ members: req.user!.id, hiddenFor: { $ne: req.user!.id }, ...storeFilter(req) })
    .populate("members", "name username email role status profilePicture storeName store")
    .sort({ updatedAt: -1 });
}

router.get("/", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const messages = await Message.find({
    ...storeFilter(req),
    $or: [{ from: req.user!.id }, { recipients: req.user!.id }, { recipients: { $size: 0 } }]
  }).sort({ createdAt: -1 });
  return res.json(messages);
}));

router.get("/conversations", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  return res.json(await listConversations(req));
}));

router.post("/conversations", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const parsed = z.object({
    name: z.string().optional(),
    members: memberIdsSchema.default([])
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid conversation details" });
  }

  const requestedIds = Array.from(new Set([req.user!.id, ...parsed.data.members]));
  const members = await User.find({ _id: { $in: requestedIds }, status: { $ne: "Inactive" }, ...storeFilter(req) }).select("_id name");
  if (members.length !== requestedIds.length || members.length < 2) {
    return res.status(400).json({ message: "Select at least one valid active coworker." });
  }

  const conversation = await Conversation.create({
    name: parsed.data.name?.trim() || members.map((member) => member.name).join(", "),
    store: storeValue(req),
    members: members.map((member) => member._id),
    createdBy: req.user!.id
  });
  await audit("Conversation created", { user: { id: req.user!.id, name: req.user!.name }, entity: "Conversation", entityId: conversation.id, store: conversation.store?.toString() });
  const populated = await Conversation.findById(conversation.id).populate("members", "name username email role status profilePicture storeName store");
  return res.status(201).json(populated);
}));

router.patch("/conversations/:id", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const parsed = z.object({
    name: z.string().optional(),
    members: memberIdsSchema.optional()
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid conversation update" });
  }

  const conversation = await findConversationForUser(String(req.params.id), req.user!.id, req);
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  if (parsed.data.name !== undefined) {
    conversation.name = parsed.data.name.trim();
  }
  if (parsed.data.members !== undefined) {
    const requestedIds = Array.from(new Set([req.user!.id, ...parsed.data.members]));
    const members = await User.find({ _id: { $in: requestedIds }, status: { $ne: "Inactive" }, ...storeFilter(req) }).select("_id");
    if (members.length !== requestedIds.length || members.length < 2) {
      return res.status(400).json({ message: "A conversation must include you and at least one valid active coworker." });
    }
    conversation.members = members.map((member) => member._id) as never;
    conversation.hiddenFor = conversation.hiddenFor.filter((memberId) => requestedIds.includes(memberId.toString())) as never;
  }
  await conversation.save();

  await audit("Conversation updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "Conversation", entityId: conversation.id, store: conversation.store?.toString() });
  const populated = await Conversation.findById(conversation.id).populate("members", "name username email role status profilePicture storeName store");
  return res.json(populated);
}));

router.delete("/conversations/:id", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const conversation = await findConversationForUser(String(req.params.id), req.user!.id, req);
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  await Conversation.findByIdAndUpdate(conversation.id, { $addToSet: { hiddenFor: req.user!.id } });
  await audit("Conversation removed", { user: { id: req.user!.id, name: req.user!.name }, entity: "Conversation", entityId: conversation.id, store: conversation.store?.toString() });
  return res.status(204).send();
}));

router.get("/conversations/:id/messages", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const conversation = await findConversationForUser(String(req.params.id), req.user!.id, req);
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const messages = await Message.find({ conversation: conversation.id }).sort({ createdAt: 1 });
  return res.json(messages);
}));

router.post("/conversations/:id/messages", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const parsed = z.object({
    body: z.string().default(""),
    attachments: z.array(attachmentSchema).default([])
  }).safeParse(req.body);
  if (!parsed.success || (!parsed.data.body.trim() && parsed.data.attachments.length === 0)) {
    return res.status(400).json({ message: "Write a message or attach a file." });
  }

  const conversation = await findConversationForUser(String(req.params.id), req.user!.id, req);
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const sender = await User.findById(req.user!.id).select("profilePicture");
  const message = await Message.create({
    conversation: conversation.id,
    store: conversation.store,
    from: req.user!.id,
    fromName: req.user!.name,
    fromProfilePicture: sender?.profilePicture ?? "",
    recipients: conversation.members.filter((memberId) => memberId.toString() !== req.user!.id),
    body: parsed.data.body,
    attachments: parsed.data.attachments,
    readBy: [req.user!.id]
  });
  await Conversation.findByIdAndUpdate(conversation.id, {
    $set: { updatedAt: new Date() },
    $pull: { hiddenFor: { $in: conversation.members } }
  });
  await audit("Chat message sent", { user: { id: req.user!.id, name: req.user!.name }, entity: "Message", entityId: message.id, store: message.store?.toString() });
  await notifyUsers(message.recipients, {
    title: `Message from ${req.user!.name}`,
    body: parsed.data.body.trim() || `${parsed.data.attachments.length} attachment${parsed.data.attachments.length === 1 ? "" : "s"}`,
    type: "Message",
    link: "/messages"
  });
  return res.status(201).json(message);
}));

router.post("/", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const parsed = z.object({
    recipients: z.array(z.string()).default([]),
    subject: z.string().min(2),
    body: z.string().min(1),
    attachments: z.array(attachmentSchema).optional()
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid message", issues: parsed.error.flatten() });
  }

  const message = await Message.create({ ...parsed.data, store: storeValue(req), from: req.user!.id, fromName: req.user!.name });
  await audit("Message sent", { user: { id: req.user!.id, name: req.user!.name }, entity: "Message", entityId: message.id, store: message.store?.toString() });
  await notifyUsers(parsed.data.recipients, {
    title: `Message from ${req.user!.name}`,
    body: parsed.data.subject,
    type: "Message",
    link: "/messages"
  });
  return res.status(201).json(message);
}));

router.patch("/:id/read", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const message = await findMessage(req.params.id);
  if (!message || !await canAccessMessage(message, req.user!.id)) {
    return res.status(404).json({ message: "Message not found" });
  }
  if (!message.readBy.some((userId) => userId.toString() === req.user!.id)) {
    message.readBy.push(req.user!.id as never);
  }
  await message.save();
  return res.json(message);
}));

router.patch("/:id/reactions", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const parsed = z.object({ emoji: z.string().min(1).max(8) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Select a valid reaction." });
  }

  const message = await findMessage(req.params.id);
  if (!message?.conversation || !await findConversationForUser(message.conversation.toString(), req.user!.id, req)) {
    return res.status(404).json({ message: "Message not found" });
  }

  const reaction = message.reactions.find((item) => item.emoji === parsed.data.emoji);
  if (reaction) {
    const reacted = reaction.users.some((userId) => userId.toString() === req.user!.id);
    reaction.users = reacted
      ? reaction.users.filter((userId) => userId.toString() !== req.user!.id) as never
      : [...reaction.users, req.user!.id] as never;
    if (reaction.users.length === 0) {
      message.reactions = message.reactions.filter((item) => item.emoji !== parsed.data.emoji) as never;
    }
  } else {
    message.reactions.push({ emoji: parsed.data.emoji, users: [req.user!.id] } as never);
  }
  await message.save();
  return res.json(message);
}));

router.delete("/:id", requireAuth, asyncRoute(async (req: AuthRequest, res) => {
  const message = await findMessage(req.params.id);
  if (!message || !await canAccessMessage(message, req.user!.id)) {
    return res.status(404).json({ message: "Message not found" });
  }
  if (message.from.toString() !== req.user!.id && req.user!.role === "Employee") {
    return res.status(403).json({ message: "You can only delete messages you sent." });
  }

  await message.deleteOne();
  await audit("Chat message deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "Message", entityId: message.id, store: message.store?.toString() });
  return res.status(204).send();
}));

export default router;
