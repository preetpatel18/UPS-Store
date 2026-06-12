import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { InventoryCategory } from "../models/InventoryCategory.js";
import { InventoryItem } from "../models/InventoryItem.js";
import { audit } from "../utils/audit.js";
import { storeFilter, storeValue } from "../utils/tenancy.js";

const router = Router();
const inventoryId = z.string().refine((id) => mongoose.isValidObjectId(id), "Invalid inventory item");

function uniqueCategoryNames(names: string[]) {
  const categories = new Map<string, string>();
  for (const name of names) {
    const trimmed = name?.trim();
    if (trimmed && !categories.has(trimmed.toLowerCase())) categories.set(trimmed.toLowerCase(), trimmed);
  }
  return Array.from(categories.values()).sort((a, b) => a.localeCompare(b));
}

function exactCategoryName(name: string) {
  return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const items = await InventoryItem.find(storeFilter(req)).sort({ name: 1 });
  return res.json(items);
});

router.get("/categories", requireAuth, async (req: AuthRequest, res) => {
  const [saved, used] = await Promise.all([
    InventoryCategory.find(storeFilter(req)).sort({ name: 1 }),
    InventoryItem.find(storeFilter(req)).distinct("category")
  ]);
  const names = uniqueCategoryNames([...saved.map((category) => category.name), ...used, "Uncategorized"]);
  return res.json(names);
});

router.post("/categories", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter a category name." });
  }

  const name = parsed.data.name.trim();
  const existing = await InventoryCategory.findOne({ name: exactCategoryName(name), ...storeFilter(req) });
  if (existing) {
    return res.json({ name: existing.name });
  }
  try {
    const category = await InventoryCategory.create({ name, store: storeValue(req) });
    await audit("Inventory category created", { user: { id: req.user!.id, name: req.user!.name }, entity: "InventoryCategory", entityId: category.id, store: category.store?.toString() });
    return res.status(201).json({ name: category.name });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "That inventory tab already exists." });
    }
    return res.status(500).json({ message: "Could not create inventory tab." });
  }
});

router.delete("/categories/:name", requireAuth, async (req: AuthRequest, res) => {
  const name = decodeURIComponent(String(req.params.name));
  if (name.toLowerCase() === "uncategorized") {
    return res.status(400).json({ message: "The Uncategorized tab cannot be removed." });
  }

  const deleted = await InventoryItem.deleteMany({ category: exactCategoryName(name), ...storeFilter(req) });
  await InventoryCategory.deleteMany({ name: exactCategoryName(name), ...storeFilter(req) });
  await audit("Inventory category deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "InventoryCategory", store: storeValue(req), metadata: { name, deletedItems: deleted.deletedCount } });
  return res.status(204).send();
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    sku: z.string().optional(),
    category: z.string().default("Uncategorized"),
    quantity: z.number().min(0).default(0),
    price: z.number().min(0).nullable().default(null),
    threshold: z.number().min(0).default(5),
    lowStockEnabled: z.boolean().default(true)
  }).safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid inventory item", issues: parsed.error.flatten() });
  }

  try {
    const item = await InventoryItem.create({
      ...parsed.data,
      store: storeValue(req),
      sku: parsed.data.sku?.trim() || undefined,
      category: parsed.data.category.trim() || "Uncategorized"
    });
    await audit("Inventory item created", { user: { id: req.user!.id, name: req.user!.name }, entity: "InventoryItem", entityId: item.id, store: item.store?.toString() });
    return res.status(201).json(item);
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "That SKU already exists." });
    }
    return res.status(500).json({ message: "Could not create inventory item." });
  }
});

router.patch("/:id/adjust", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ amount: z.number() }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid adjustment amount" });
  }

  const item = await InventoryItem.findOne({ _id: req.params.id, ...storeFilter(req) });
  if (!item) {
    return res.status(404).json({ message: "Inventory item not found" });
  }

  const before = item.quantity;
  item.quantity = Math.max(0, item.quantity + parsed.data.amount);
  item.history.push({ action: "Adjustment", quantityBefore: before, quantityAfter: item.quantity, user: req.user!.id } as never);
  await item.save();

  await audit("Inventory adjusted", { user: { id: req.user!.id, name: req.user!.name }, entity: "InventoryItem", entityId: item.id, store: item.store?.toString(), metadata: { before, after: item.quantity } });
  return res.json(item);
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    name: z.string().min(2).optional(),
    sku: z.string().optional(),
    category: z.string().optional(),
    quantity: z.number().min(0).optional(),
    price: z.number().min(0).nullable().optional(),
    threshold: z.number().min(0).optional(),
    lowStockEnabled: z.boolean().optional()
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid inventory update", issues: parsed.error.flatten() });
  }

  const item = await InventoryItem.findOne({ _id: req.params.id, ...storeFilter(req) });
  if (!item) {
    return res.status(404).json({ message: "Inventory item not found" });
  }

  const before = item.quantity;
  if (parsed.data.name !== undefined) item.name = parsed.data.name;
  if (parsed.data.sku !== undefined) item.sku = parsed.data.sku.trim() || undefined;
  if (parsed.data.category !== undefined) item.category = parsed.data.category.trim() || "Uncategorized";
  if (parsed.data.price !== undefined) item.price = parsed.data.price;
  if (parsed.data.threshold !== undefined) item.threshold = parsed.data.threshold;
  if (parsed.data.lowStockEnabled !== undefined) item.lowStockEnabled = parsed.data.lowStockEnabled;
  if (parsed.data.quantity !== undefined && parsed.data.quantity !== item.quantity) {
    item.quantity = parsed.data.quantity;
    item.history.push({ action: "Count updated", quantityBefore: before, quantityAfter: item.quantity, user: req.user!.id } as never);
  }
  try {
    await item.save();
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: "That SKU already exists." });
    }
    return res.status(500).json({ message: "Could not update inventory item." });
  }

  await audit("Inventory item updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "InventoryItem", entityId: item.id, store: item.store?.toString() });
  return res.json(item);
});

router.patch("/count/batch", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({
    counts: z.array(z.object({ id: inventoryId, quantity: z.number().min(0) })).min(1)
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Enter valid inventory counts." });
  }

  const updated = [];
  for (const count of parsed.data.counts) {
    const item = await InventoryItem.findOne({ _id: count.id, ...storeFilter(req) });
    if (!item) continue;
    const before = item.quantity;
    if (before !== count.quantity) {
      item.quantity = count.quantity;
      item.history.push({ action: "Inventory count", quantityBefore: before, quantityAfter: count.quantity, user: req.user!.id } as never);
      await item.save();
      await audit("Inventory count updated", { user: { id: req.user!.id, name: req.user!.name }, entity: "InventoryItem", entityId: item.id, store: item.store?.toString(), metadata: { before, after: item.quantity } });
    }
    updated.push(item);
  }
  return res.json(updated);
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const item = await InventoryItem.findOneAndDelete({ _id: req.params.id, ...storeFilter(req) });
  if (!item) {
    return res.status(404).json({ message: "Inventory item not found" });
  }

  await audit("Inventory item deleted", { user: { id: req.user!.id, name: req.user!.name }, entity: "InventoryItem", entityId: item.id, store: item.store?.toString() });
  return res.status(204).send();
});

export default router;
