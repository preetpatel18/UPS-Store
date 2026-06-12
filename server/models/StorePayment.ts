import mongoose, { Schema } from "mongoose";

const storePaymentSchema = new Schema(
  {
    store: { type: Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    paymentType: { type: String, enum: ["One-Time Purchase", "Monthly Subscription"], required: true },
    amount: { type: Number, default: 0 },
    dueDate: { type: String, default: "" },
    status: { type: String, enum: ["Paid", "Due Soon", "Overdue", "Cancelled"], default: "Due Soon" },
    notes: { type: String, default: "" }
  },
  { timestamps: true }
);

export const StorePayment = mongoose.model("StorePayment", storePaymentSchema);
