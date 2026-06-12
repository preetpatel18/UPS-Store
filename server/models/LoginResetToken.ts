import mongoose, { Schema } from "mongoose";

const loginResetTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    purpose: { type: String, enum: ["PasswordReset"], default: "PasswordReset" },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    usedAt: { type: Date, default: null },
    requestedIp: { type: String, default: "" }
  },
  { timestamps: true }
);

export const LoginResetToken = mongoose.model("LoginResetToken", loginResetTokenSchema);
