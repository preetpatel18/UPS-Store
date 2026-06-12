import mongoose, { Schema } from "mongoose";

const userSessionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    userAgent: { type: String, default: "Unknown device" },
    ip: { type: String, default: "" },
    lastSeenAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const UserSession = mongoose.model("UserSession", userSessionSchema);
