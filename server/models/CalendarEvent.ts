import mongoose, { Schema } from "mongoose";

const calendarEventSchema = new Schema(
  {
    title: { type: String, required: true },
    type: { type: String, enum: ["Shift", "Time Off", "Availability"], default: "Shift" },
    employee: { type: Schema.Types.ObjectId, ref: "User" },
    employeeName: String,
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    timeOffRequest: { type: Schema.Types.ObjectId, ref: "TimeOffRequest" },
    date: { type: String, required: true },
    start: String,
    end: String,
    comments: String
  },
  { timestamps: true }
);

export const CalendarEvent = mongoose.model("CalendarEvent", calendarEventSchema);
