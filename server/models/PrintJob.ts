import mongoose, { Schema } from "mongoose";

const printJobSchema = new Schema(
  {
    customer: { type: String, default: "Walk-in customer" },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    type: { type: String, default: "Print job" },
    description: { type: String, default: "" },
    pricingInfo: { type: String, default: "" },
    status: { type: String, enum: ["Waiting", "Processing", "Ready", "Completed"], default: "Waiting" },
    due: { type: String, default: "" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
    createdByName: { type: String, default: "" }
  },
  { timestamps: true }
);

export const PrintJob = mongoose.model("PrintJob", printJobSchema);
