import { Router } from "express";
import { db } from "@workspace/db";
import { adRewardsTable, rewardClaimsTable, adsTable, brandsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { z } from "zod/v4";
import { randomBytes } from "crypto";

const router = Router();

function generateRedemptionCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

// POST /brands/ads/:adId/rewards — brand creates an incentive for their ad
router.post("/brands/ads/:adId/rewards", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);
    const schema = z.object({
      type: z.enum(["wildcard", "general"]),
      title: z.string().min(1).max(100),
      description: z.string().min(1).max(500),
      rewardValueText: z.string().min(1).max(200),
      discountCode: z.string().max(50).optional(),
      maxClaims: z.number().int().positive().optional(),
    });

    const parsed = schema.parse(req.body);

    // Verify this brand owns the ad
    const [brand] = await db
      .select({ id: brandsTable.id })
      .from(brandsTable)
      .where(eq(brandsTable.userId, req.user!.userId))
      .limit(1);

    if (!brand) {
      res.status(404).json({ error: "not_found", message: "Brand profile not found" });
      return;
    }

    const [ad] = await db.select({ id: adsTable.id }).from(adsTable)
      .where(and(eq(adsTable.id, adId), eq(adsTable.brandId, brand.id))).limit(1);

    if (!ad) {
      res.status(403).json({ error: "forbidden", message: "Ad not found or not owned by brand" });
      return;
    }

    const [reward] = await db.insert(adRewardsTable).values({
      adId,
      type: parsed.type,
      title: parsed.title,
      description: parsed.description,
      rewardValueText: parsed.rewardValueText,
      discountCode: parsed.discountCode ?? null,
      maxClaims: parsed.type === "wildcard" ? (parsed.maxClaims ?? 1) : null,
    }).returning();

    res.status(201).json({ reward });
  } catch (err) {
    if (err && typeof err === "object" && "issues" in err) {
      res.status(400).json({ error: "validation_error", message: "Invalid reward data", details: (err as { issues: unknown }).issues });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create reward" });
  }
});

// GET /brands/ads/:adId/rewards — brand sees all rewards for their ad
router.get("/brands/ads/:adId/rewards", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);
    const [brand] = await db.select({ id: brandsTable.id }).from(brandsTable)
      .where(eq(brandsTable.userId, req.user!.userId)).limit(1);

    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand not found" }); return; }

    const rewards = await db.select().from(adRewardsTable).where(eq(adRewardsTable.adId, adId));
    res.json({ rewards });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Failed to fetch rewards" });
  }
});

// DELETE /brands/rewards/:rewardId — brand deactivates a reward
router.delete("/brands/rewards/:rewardId", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    const rewardId = String(req.params["rewardId"]);
    await db.update(adRewardsTable).set({ isActive: false }).where(eq(adRewardsTable.id, rewardId));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Failed to deactivate reward" });
  }
});

// GET /ads/:adId/reward — reviewer sees the active reward for an ad (if any)
router.get("/ads/:adId/reward", requireAuth, async (req, res) => {
  try {
    const adId = String(req.params["adId"]);

    const [reward] = await db.select().from(adRewardsTable)
      .where(and(eq(adRewardsTable.adId, adId), eq(adRewardsTable.isActive, true)))
      .limit(1);

    if (!reward) { res.json({ reward: null }); return; }

    // Check if this user already claimed it
    const [existing] = await db.select().from(rewardClaimsTable)
      .where(and(eq(rewardClaimsTable.rewardId, reward.id), eq(rewardClaimsTable.userId, req.user!.userId)))
      .limit(1);

    const spotsLeft = reward.type === "wildcard" && reward.maxClaims !== null
      ? Math.max(0, reward.maxClaims - reward.claimsCount)
      : null;

    const available = !existing && (reward.type === "general" || (spotsLeft !== null && spotsLeft > 0));

    res.json({
      reward: {
        id: reward.id,
        type: reward.type,
        title: reward.title,
        description: reward.description,
        rewardValueText: reward.rewardValueText,
        discountCode: existing ? reward.discountCode : null,
        spotsLeft,
        alreadyClaimed: !!existing,
        claimedCode: existing?.redemptionCode ?? null,
        available,
      }
    });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Failed to fetch reward" });
  }
});

// POST /rewards/:rewardId/claim — reviewer claims a reward after review
router.post("/rewards/:rewardId/claim", requireAuth, requireRole("reviewer"), async (req, res) => {
  try {
    const rewardId = String(req.params["rewardId"]);

    const [reward] = await db.select().from(adRewardsTable)
      .where(and(eq(adRewardsTable.id, rewardId), eq(adRewardsTable.isActive, true))).limit(1);

    if (!reward) { res.status(404).json({ error: "not_found", message: "Reward not found" }); return; }

    // Check for duplicate claim
    const [existing] = await db.select().from(rewardClaimsTable)
      .where(and(eq(rewardClaimsTable.rewardId, rewardId), eq(rewardClaimsTable.userId, req.user!.userId))).limit(1);

    if (existing) {
      res.status(409).json({ error: "already_claimed", message: "You have already claimed this reward", code: existing.redemptionCode });
      return;
    }

    // Check wildcard slots
    if (reward.type === "wildcard" && reward.maxClaims !== null && reward.claimsCount >= reward.maxClaims) {
      res.status(410).json({ error: "no_slots", message: "All wildcard slots have been claimed" });
      return;
    }

    const redemptionCode = `ADS-${generateRedemptionCode()}-${generateRedemptionCode()}`;

    const [claim] = await db.insert(rewardClaimsTable).values({
      rewardId,
      userId: req.user!.userId,
      redemptionCode,
    }).returning();

    // Increment claim count
    await db.update(adRewardsTable)
      .set({ claimsCount: sql`${adRewardsTable.claimsCount} + 1` })
      .where(eq(adRewardsTable.id, rewardId));

    res.status(201).json({
      claim: {
        id: claim.id,
        redemptionCode: claim.redemptionCode,
        rewardTitle: reward.title,
        rewardValueText: reward.rewardValueText,
        discountCode: reward.discountCode,
        claimedAt: claim.claimedAt,
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to claim reward" });
  }
});

// GET /me/rewards — reviewer's claimed rewards
router.get("/me/rewards", requireAuth, async (req, res) => {
  try {
    const claims = await db
      .select({
        id: rewardClaimsTable.id,
        redemptionCode: rewardClaimsTable.redemptionCode,
        claimedAt: rewardClaimsTable.claimedAt,
        rewardTitle: adRewardsTable.title,
        rewardValueText: adRewardsTable.rewardValueText,
        discountCode: adRewardsTable.discountCode,
        rewardType: adRewardsTable.type,
        adId: adRewardsTable.adId,
      })
      .from(rewardClaimsTable)
      .innerJoin(adRewardsTable, eq(rewardClaimsTable.rewardId, adRewardsTable.id))
      .where(eq(rewardClaimsTable.userId, req.user!.userId))
      .orderBy(sql`${rewardClaimsTable.claimedAt} DESC`);

    res.json({ claims });
  } catch {
    res.status(500).json({ error: "internal_error", message: "Failed to fetch rewards" });
  }
});

export default router;
