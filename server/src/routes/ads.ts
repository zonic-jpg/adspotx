import { Router } from "express";
import { db } from "@workspace/db";
import { adsTable, brandsTable, questionsTable } from "@workspace/db/schema";
import { eq, and, count } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { validateParams, validateQuery, paramSchemas, querySchemas } from "../middlewares/validate";
import { logEventSafe, EVENT_TYPES } from "../lib/events";
import { getMockAdDetail, getMockAdFeed, reviewerMockEnabled } from "../lib/reviewer-mock-store";
import { normalizeAdForPlayback } from "../lib/asset-normalize";

const router = Router();

router.get("/ads", requireAuth, validateQuery(querySchemas.adFeed), async (req, res) => {
  try {
    const { limit, offset } = res.locals["parsedQuery"] as { limit: number; offset: number };

    if (reviewerMockEnabled()) {
      res.json(getMockAdFeed(limit, offset));
      return;
    }

    const [ads, [{ total }]] = await Promise.all([
      db
        .select({
          id: adsTable.id,
          title: adsTable.title,
          description: adsTable.description,
          assetUrl: adsTable.assetUrl,
          assetType: adsTable.assetType,
          minWatchSeconds: adsTable.minWatchSeconds,
          pointReward: adsTable.pointReward,
          multiplierFactor: adsTable.multiplierFactor,
          status: adsTable.status,
          brandId: adsTable.brandId,
          brandName: brandsTable.companyName,
          createdAt: adsTable.createdAt,
        })
        .from(adsTable)
        .leftJoin(brandsTable, eq(adsTable.brandId, brandsTable.id))
        .where(eq(adsTable.status, "active"))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(adsTable).where(eq(adsTable.status, "active")),
    ]);

    const adsWithQuestionCount = await Promise.all(
      ads.map(async (ad) => {
        const [{ qCount }] = await db
          .select({ qCount: count() })
          .from(questionsTable)
          .where(eq(questionsTable.adId, ad.id));
        return normalizeAdForPlayback({ ...ad, questionCount: qCount });
      })
    );

    await logEventSafe({
      eventType: EVENT_TYPES.AD_FEED_VIEWED,
      actorId: req.user!.userId,
      entityType: "ad_feed",
      entityId: null,
      metadata: { limit, offset, total: Number(total) },
    });

    res.json({ ads: adsWithQuestionCount, total: Number(total), offset, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch ads" });
  }
});

router.get("/ads/:adId", requireAuth, validateParams(paramSchemas.adId), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);

    if (reviewerMockEnabled()) {
      const mockAd = getMockAdDetail(adId);
      if (!mockAd) {
        res.status(404).json({ error: "not_found", message: "Ad not found" });
        return;
      }
      res.json(mockAd);
      return;
    }

    const [ad] = await db
      .select({
        id: adsTable.id,
        title: adsTable.title,
        description: adsTable.description,
        assetUrl: adsTable.assetUrl,
        assetType: adsTable.assetType,
        minWatchSeconds: adsTable.minWatchSeconds,
        pointReward: adsTable.pointReward,
        multiplierFactor: adsTable.multiplierFactor,
        proverbQuestion: adsTable.proverbQuestion,
        proverbAnswer: adsTable.proverbAnswer,
        proverbBonusPoints: adsTable.proverbBonusPoints,
        brandId: adsTable.brandId,
        brandName: brandsTable.companyName,
      })
      .from(adsTable)
      .leftJoin(brandsTable, eq(adsTable.brandId, brandsTable.id))
      .where(and(eq(adsTable.id, adId), eq(adsTable.status, "active")))
      .limit(1);

    if (!ad) {
      res.status(404).json({ error: "not_found", message: "Ad not found" });
      return;
    }

    const questions = await db
      .select()
      .from(questionsTable)
      .where(eq(questionsTable.adId, adId))
      .orderBy(questionsTable.sortOrder);

    await logEventSafe({
      eventType: EVENT_TYPES.AD_VIEWED,
      actorId: req.user!.userId,
      entityType: "ad",
      entityId: adId,
      metadata: { title: ad.title },
    });

    res.json(normalizeAdForPlayback({ ...ad, questions }));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch ad" });
  }
});

export default router;
