import mongoose, { Schema } from "mongoose";

const timesheetSchema = new Schema(
  {
    employee: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employeeName: { type: String, required: true },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    department: { type: String, required: true },
    date: { type: String, required: true },
    clockIn: { type: String, required: true },
    clockOut: { type: String, default: null },
    breakIn: { type: String, default: null },
    breakOut: { type: String, default: null },
    breakTime: { type: String, default: "0m" },
    totalHours: { type: Number, default: 0 },
    status: { type: String, enum: ["Active", "Completed", "Adjustment Requested"], default: "Active" }
  },
  { timestamps: true }
);

export const Timesheet = mongoose.model("Timesheet", timesheetSchema);
