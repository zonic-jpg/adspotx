import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET_ENV = process.env["JWT_SECRET"];

// The built-in fallback secret is public (it lives in this repo), so any token
// signed with it can be forged by anyone. Only allow it in local dev and the
// test runner. Every other environment — production, staging, or an unset
// NODE_ENV — MUST supply JWT_SECRET, and the server refuses to start without it.
const NODE_ENV = process.env["NODE_ENV"];
const ALLOW_FALLBACK_SECRET = NODE_ENV === "development" || NODE_ENV === "test";
if (!JWT_SECRET_ENV && !ALLOW_FALLBACK_SECRET) {
  throw new Error(
    "JWT_SECRET environment variable is required (the built-in secret is only allowed when NODE_ENV=development or test)",
  );
}

const JWT_SECRET = JWT_SECRET_ENV ?? "adspot-dev-secret-change-in-prod";

export type AppRole = "reviewer" | "brand" | "admin" | "super_admin";

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  role: AppRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized", message: "Missing or invalid authorization header" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "unauthorized", message: "Invalid or expired token" });
  }
}

/**
 * super_admin implicitly satisfies any role requirement.
 * admin implicitly satisfies reviewer/brand requirements too (they can do anything a lower role can).
 */
export function requireRole(...roles: AppRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
      return;
    }
    const userRole = req.user.role;
    // super_admin bypasses all role checks
    if (userRole === "super_admin") { next(); return; }
    // admin can access any admin-or-below route
    if (userRole === "admin" && roles.includes("admin")) { next(); return; }
    // exact match
    if (roles.includes(userRole)) { next(); return; }
    res.status(403).json({ error: "forbidden", message: "Insufficient permissions" });
  };
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "unauthorized", message: "Not authenticated" });
    return;
  }
  if (req.user.role !== "super_admin") {
    res.status(403).json({ error: "forbidden", message: "Super admin access required" });
    return;
  }
  next();
}
