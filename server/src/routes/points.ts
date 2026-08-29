import { Router } from "express";
import { db } from "@workspace/db";
import { pointsLedgerTable } from "@workspace/db/schema";
import { eq, sql, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateQuery, querySchemas } from "../middlewares/validate";
import { logEventSafe, EVENT_TYPES } from "../lib/events";
import { getMockLedger, getMockPointsBalance, reviewerMockEnabled } from "../lib/reviewer-mock-store";

const router = Router();

router.get("/points/balance", requireAuth, requireRole("reviewer"), async (req, res) => {
  try {
    const userId = req.user!.userId;

    if (reviewerMockEnabled()) {
      res.json(getMockPointsBalance(userId));
      return;
    }

    const result = await db.execute(
      sql`SELECT 
        COALESCE(SUM(amount), 0) as balance,
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_earned
      FROM points_ledger WHERE user_id = ${userId}`
    );

    const row = result.rows[0] as { balance: string; total_earned: string };

    await logEventSafe({
      eventType: EVENT_TYPES.POINTS_BALANCE_VIEWED,
      actorId: userId,
      entityType: "user",
      entityId: userId,
      metadata: { balance: Number(row.balance) },
    });

    res.json({
      userId,
      balance: Number(row.balance),
      totalEarned: Number(row.total_earned),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch balance" });
  }
});

router.get(
  "/points/ledger",
  requireAuth,
  requireRole("reviewer"),
  validateQuery(querySchemas.pointsLedger),
  async (req, res) => {
    try {
      const userId = req.user!.userId;
      const { limit, offset } = res.locals["parsedQuery"] as { limit: number; offset: number };

      if (reviewerMockEnabled()) {
        res.json(getMockLedger(limit, offset));
        return;
      }

      const [entries, [{ total }]] = await Promise.all([
        db
          .select()
          .from(pointsLedgerTable)
          .where(eq(pointsLedgerTable.userId, userId))
          .orderBy(sql`created_at DESC`)
          .limit(limit)
          .offset(offset),
        db.select({ total: count() }).from(pointsLedgerTable).where(eq(pointsLedgerTable.userId, userId)),
      ]);

      await logEventSafe({
        eventType: EVENT_TYPES.POINTS_LEDGER_VIEWED,
        actorId: userId,
        entityType: "user",
        entityId: userId,
        metadata: { limit, offset, total: Number(total) },
      });

      res.json({ entries, total: Number(total), offset, limit });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal_error", message: "Failed to fetch ledger" });
    }
  }
);

export default router;
