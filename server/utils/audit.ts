import { AuditLog } from "../models/AuditLog.js";

export async function audit(action: string, details: { user?: { id: string; name: string }; entity?: string; entityId?: string; store?: string | null | { toString(): string }; metadata?: unknown } = {}) {
  await AuditLog.create({
    action,
    user: details.user?.id,
    userName: details.user?.name ?? "System",
    entity: details.entity,
    entityId: details.entityId,
    store: details.store ? details.store.toString() : null,
    metadata: details.metadata
  });
}
