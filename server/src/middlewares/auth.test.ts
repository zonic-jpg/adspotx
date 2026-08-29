import { describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import {
  signToken, verifyToken, requireAuth, requireRole, requireSuperAdmin, type JwtPayload,
} from "./auth";
import type { Request, Response, NextFunction } from "express";

const payload: JwtPayload = { userId: "u1", email: "a@b.co", username: "ada", role: "reviewer" };

function mockRes() {
  const res = { statusCode: 0, body: null as unknown } as unknown as Response & { statusCode: number; body: unknown };
  (res as unknown as { status: (c: number) => typeof res }).status = (c: number) => { res.statusCode = c; return res; };
  (res as unknown as { json: (b: unknown) => typeof res }).json = (b: unknown) => { res.body = b; return res; };
  return res;
}
const asReq = (o: object) => o as unknown as Request;

describe("JWT lifecycle", () => {
  it("signs and verifies a round-trip payload", () => {
    const token = signToken(payload);
    const decoded = verifyToken(token);
    expect(decoded.userId).toBe("u1");
    expect(decoded.role).toBe("reviewer");
  });

  it("rejects a tampered token", () => {
    const token = signToken(payload) + "x";
    expect(() => verifyToken(token)).toThrow();
  });
});

describe("requireAuth", () => {
  it("401s without a bearer header", () => {
    const res = mockRes();
    const next = vi.fn();
    requireAuth(asReq({ headers: {} }), res, next as NextFunction);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("401s on a garbage token", () => {
    const res = mockRes();
    const next = vi.fn();
    requireAuth(asReq({ headers: { authorization: "Bearer nope" } }), res, next as NextFunction);
    expect(res.statusCode).toBe(401);
  });

  it("attaches the user and calls next on a valid token", () => {
    const res = mockRes();
    const next = vi.fn();
    const req = asReq({ headers: { authorization: `Bearer ${signToken(payload)}` } });
    requireAuth(req, res, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
    expect((req as Request).user?.email).toBe("a@b.co");
  });
});

describe("requireRole hierarchy (the access-control business rules)", () => {
  const run = (role: JwtPayload["role"] | null, ...required: Parameters<typeof requireRole>) => {
    const res = mockRes();
    const next = vi.fn();
    requireRole(...required)(asReq(role ? { user: { ...payload, role } } : {}), res, next as NextFunction);
    return { res, allowed: next.mock.calls.length === 1 };
  };

  it("super_admin passes every gate", () => {
    expect(run("super_admin", "admin").allowed).toBe(true);
    expect(run("super_admin", "brand").allowed).toBe(true);
    expect(run("super_admin", "reviewer").allowed).toBe(true);
  });

  it("admin passes admin gates but reviewer cannot reach admin", () => {
    expect(run("admin", "admin").allowed).toBe(true);
    expect(run("reviewer", "admin").allowed).toBe(false);
    expect(run("reviewer", "admin").res.statusCode).toBe(403);
  });

  it("exact-role matches pass; cross-role does not", () => {
    expect(run("brand", "brand").allowed).toBe(true);
    expect(run("brand", "reviewer").allowed).toBe(false);
  });

  it("unauthenticated is 401, not 403", () => {
    const { res, allowed } = run(null, "reviewer");
    expect(allowed).toBe(false);
    expect(res.statusCode).toBe(401);
  });
});

describe("requireSuperAdmin", () => {
  it("only super_admin passes — admin is refused", () => {
    const res = mockRes();
    const next = vi.fn();
    requireSuperAdmin(asReq({ user: { ...payload, role: "admin" } }), res, next as NextFunction);
    expect(res.statusCode).toBe(403);
    const res2 = mockRes();
    requireSuperAdmin(asReq({ user: { ...payload, role: "super_admin" } }), res2, next as NextFunction);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe("password hashing", () => {
  it("bcrypt hash verifies the original and rejects a wrong password", async () => {
    const hash = await bcrypt.hash("correct-horse", 12);
    expect(await bcrypt.compare("correct-horse", hash)).toBe(true);
    expect(await bcrypt.compare("wrong-horse", hash)).toBe(false);
    expect(hash.startsWith("$2")).toBe(true); // bcrypt format, cost embedded
  });
});
