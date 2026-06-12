import mongoose, { Schema } from "mongoose";

const inventoryCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true }
  },
  { timestamps: true }
);

inventoryCategorySchema.index({ store: 1, name: 1 }, { unique: true });

export const InventoryCategory = mongoose.model("InventoryCategory", inventoryCategorySchema);
