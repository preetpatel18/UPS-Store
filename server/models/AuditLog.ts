import mongoose, { Schema } from "mongoose";

const auditLogSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User" },
    userName: { type: String, default: "System" },
    action: { type: String, required: true },
    entity: String,
    entityId: String,
    store: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    metadata: Schema.Types.Mixed
  },
  { timestamps: true }
);

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
