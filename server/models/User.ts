import mongoose, { Schema } from "mongoose";

export type UserRole = "Employee" | "Manager" | "Administrator" | "Owner";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    username: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["Employee", "Manager", "Administrator", "Owner"], default: "Employee" },
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    storeName: { type: String, default: "" },
    department: { type: String, default: "Operations" },
    status: { type: String, enum: ["Active", "Disabled", "Pending", "Working", "Scheduled", "Off", "Inactive"], default: "Active" },
    lastLogin: { type: Date, default: null },
    profilePicture: { type: String, default: "" },
    notificationPreferences: {
      inApp: { type: Boolean, default: true },
      messages: { type: Boolean, default: true },
      requests: { type: Boolean, default: true },
      operations: { type: Boolean, default: true },
      security: { type: Boolean, default: true }
    }
  },
  { timestamps: true }
);

export const User = mongoose.model("User", userSchema);
