import type { FilterQuery } from "mongoose";
import type { AuthRequest } from "../middleware/auth.js";

export function isOwner(req: AuthRequest) {
  return req.user?.role === "Owner";
}

export function requireStore(req: AuthRequest) {
  if (isOwner(req)) return null;
  if (!req.user?.store) {
    throw new Error("Your account is not assigned to a store.");
  }
  return req.user.store;
}

export function storeFilter<T = unknown>(req: AuthRequest): FilterQuery<T> {
  if (isOwner(req)) return {};
  return { store: requireStore(req) } as FilterQuery<T>;
}

export function storeValue(req: AuthRequest) {
  return isOwner(req) ? null : requireStore(req);
}
