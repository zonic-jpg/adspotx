import { Router } from "express";
import { db } from "@workspace/db";
import { referralsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { ensureReferralCode } from "../lib/referrals";

const router = Router();

// Get (or lazily create) my shareable referral code + my referral list.
router.get("/referrals/me", requireAuth, requireRole("reviewer"), async (req, res) => {
  try {
    const userId = req.user!.userId;
    const code = await ensureReferralCode(userId);
    const list = await db.select().from(referralsTable)
      .where(eq(referralsTable.referrerId, userId)).orderBy(desc(referralsTable.createdAt));
    const earned = list.filter((r) => r.status === "rewarded").reduce((n, r) => n + r.rewardPoints, 0);
    res.json({ code, referrals: list, totalEarned: earned, qualified: list.filter((r) => r.status === "rewarded").length });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to load referrals" }); }
});

export default router;
