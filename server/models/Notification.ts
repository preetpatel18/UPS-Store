import mongoose, { Schema } from "mongoose";

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    title: { type: String, required: true },
    body: { type: String, default: "" },
    type: { type: String, enum: ["Info", "Request", "Message", "Alert"], default: "Info" },
    category: { type: String, enum: ["messages", "requests", "operations", "security"], default: "operations" },
    link: { type: String, default: "/" },
    read: { type: Boolean, default: false }
  },
  { timestamps: true }
);

export const Notification = mongoose.model("Notification", notificationSchema);
