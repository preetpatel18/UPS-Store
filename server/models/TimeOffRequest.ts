import mongoose, { Schema } from "mongoose";

const timeOffRequestSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeName: { type: String, required: true },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    date: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    reason: { type: String, required: true },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["Pending", "Approved", "Denied"], default: "Pending" },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

export const TimeOffRequest = mongoose.model("TimeOffRequest", timeOffRequestSchema);
