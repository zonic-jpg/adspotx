import { Router } from "express";
import { db } from "@workspace/db";
import { fraudFlagsTable, fraudRulesTable, usersTable } from "@workspace/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

// Flagged users with cumulative open score.
router.get("/fraud/flags", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const rows = await db.select({
      userId: fraudFlagsTable.userId,
      totalScore: sql<number>`sum(${fraudFlagsTable.score})`,
      openCount: sql<number>`count(*) filter (where ${fraudFlagsTable.status} = 'open')`,
      lastReason: sql<string>`max(${fraudFlagsTable.reason})`,
    }).from(fraudFlagsTable).groupBy(fraudFlagsTable.userId).orderBy(desc(sql`sum(${fraudFlagsTable.score})`));
    res.json({ flagged: rows });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to load flags" }); }
});

// Full flag history for one user.
router.get("/fraud/flags/:userId", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const rows = await db.select().from(fraudFlagsTable)
      .where(eq(fraudFlagsTable.userId, String(req.params.userId))).orderBy(desc(fraudFlagsTable.createdAt));
    res.json({ flags: rows });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to load history" }); }
});

router.post("/fraud/flags/:id/dismiss", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await db.update(fraudFlagsTable).set({ status: "dismissed", reviewedBy: req.user!.userId, reviewedAt: new Date() })
      .where(eq(fraudFlagsTable.id, String(req.params.id)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to dismiss" }); }
});

router.post("/fraud/users/:userId/suspend", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await db.update(usersTable).set({ suspended: true }).where(eq(usersTable.id, String(req.params.userId)));
    await db.update(fraudFlagsTable).set({ status: "actioned", reviewedBy: req.user!.userId, reviewedAt: new Date() })
      .where(and(eq(fraudFlagsTable.userId, String(req.params.userId)), eq(fraudFlagsTable.status, "open")));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to suspend" }); }
});

router.post("/fraud/users/:userId/unsuspend", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    await db.update(usersTable).set({ suspended: false }).where(eq(usersTable.id, String(req.params.userId)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to unsuspend" }); }
});

// Fraud rules (weights + thresholds).
router.get("/fraud/rules", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const [row] = await db.select().from(fraudRulesTable).limit(1);
    res.json({ rules: row ?? null });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to load rules" }); }
});

const rulesSchema = z.object({
  sameDeviceScore: z.number().int(), sameIpScore: z.number().int(),
  excessiveDailyScore: z.number().int(), suspiciousPatternScore: z.number().int(),
  warnThreshold: z.number().int(), reviewThreshold: z.number().int(),
  autoSuspendThreshold: z.number().int(), maxDailyEarnings: z.number().int(),
}).partial();

router.put("/fraud/rules", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const parsed = rulesSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad_request", message: parsed.error.message });
    const [existing] = await db.select().from(fraudRulesTable).limit(1);
    if (existing) {
      const [row] = await db.update(fraudRulesTable).set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(fraudRulesTable.id, existing.id)).returning();
      return res.json({ rules: row });
    }
    const [row] = await db.insert(fraudRulesTable).values(parsed.data as typeof fraudRulesTable.$inferInsert).returning();
    res.json({ rules: row });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to save rules" }); }
});

export default router;
