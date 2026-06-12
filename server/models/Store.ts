import mongoose, { Schema } from "mongoose";

const storeSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, lowercase: true, trim: true },
    databaseName: { type: String, required: true, unique: true, lowercase: true, trim: true },
    storeNumber: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },
    status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
    websiteStatus: { type: String, enum: ["Active", "Pending", "Suspended", "Cancelled"], default: "Pending" },
    paymentType: { type: String, enum: ["One-Time Purchase", "Monthly Subscription"], default: "Monthly Subscription" },
    priceSold: { type: Number, default: 0 },
    monthlySubscriptionPrice: { type: Number, default: 0 },
    nextDueDate: { type: String, default: "" },
    paymentStatus: { type: String, enum: ["Paid", "Due Soon", "Overdue", "Cancelled"], default: "Due Soon" },
    notes: { type: String, default: "" },
    ownerAdmin: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const Store = mongoose.model("Store", storeSchema);
