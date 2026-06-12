import mongoose, { Schema } from "mongoose";

const inventoryItemSchema = new Schema(
  {
    name: { type: String, required: true },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    sku: { type: String, sparse: true, default: undefined },
    category: { type: String, default: "Uncategorized" },
    quantity: { type: Number, default: 0, min: 0 },
    price: { type: Number, default: null, min: 0 },
    threshold: { type: Number, default: 5 },
    lowStockEnabled: { type: Boolean, default: true },
    history: [
      {
        action: String,
        quantityBefore: Number,
        quantityAfter: Number,
        user: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now }
      }
    ]
  },
  { timestamps: true }
);

inventoryItemSchema.index({ store: 1, sku: 1 }, { unique: true, sparse: true });

export const InventoryItem = mongoose.model("InventoryItem", inventoryItemSchema);
