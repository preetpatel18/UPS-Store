import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { User, type UserRole } from "../models/User.js";
import { UserSession } from "../models/UserSession.js";

type TokenPayload = {
  id: string;
  sid?: string;
};

export type AuthRequest = Request & {
  user?: {
    id: string;
    name: string;
    username?: string;
    email: string;
    role: UserRole;
    department?: string;
    profilePicture?: string;
    store?: string;
    storeName?: string;
  };
  sessionId?: string;
};

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  void verifyRequest(req, res, next);
}

export function requireRole(minRole: UserRole) {
  const order: Record<UserRole, number> = { Employee: 0, Manager: 1, Administrator: 2, Owner: 3 };

  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (order[req.user.role] < order[minRole]) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    return next();
  };
}

async function verifyRequest(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET ?? "dev-secret") as TokenPayload;
    if (!payload.id || !payload.sid) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const [user, session] = await Promise.all([
      User.findById(payload.id).select("-passwordHash"),
      UserSession.findOne({ _id: payload.sid, user: payload.id })
    ]);

    if (!user || user.status === "Inactive" || user.status === "Disabled" || !session || session.revokedAt || session.expiresAt <= new Date()) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    session.lastSeenAt = new Date();
    await session.save();

    req.sessionId = session.id;
    req.user = {
      id: user.id,
      name: user.name,
      username: user.username ?? undefined,
      email: user.email ?? "",
      role: user.role,
      department: user.department ?? undefined,
      profilePicture: user.profilePicture ?? undefined,
      store: user.store?.toString(),
      storeName: user.storeName ?? undefined
    };
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}
