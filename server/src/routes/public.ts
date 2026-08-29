import { Router } from "express";
import { db } from "@workspace/db";
import {
  adsTable, brandsTable, usersTable, reviewSessionsTable,
  pointsLedgerTable, adPackagesTable, platformSettingsTable,
} from "@workspace/db/schema";
import { eq, sql, and, not, like } from "drizzle-orm";
import { logger } from "../lib/logger";
import { respondIfDatabaseUnavailable } from "../lib/handle-db-error";

const router = Router();

// ── Helper: read demo_mode from platform_settings ─────────────────────────────
// Default: true (include demo data) — safe before settings are seeded.
async function isDemoMode(): Promise<boolean> {
  try {
    const [row] = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "demo_mode"))
      .limit(1);
    return row?.value !== "false";
  } catch {
    return true; // fail-open: never break public routes due to missing setting
  }
}

// GET /public/videos — weighted random active video ads (no auth)
router.get("/public/videos", async (req, res) => {
  try {
    const rawLimit = req.query["limit"];
    const limit = Math.min(Math.max(1, parseInt(String(rawLimit ?? "8"), 10) || 8), 20);

    const demoMode = await isDemoMode();

    // When demo_mode=false, exclude ads owned by .demo-email brands
    const whereClause = demoMode
      ? and(
          eq(adsTable.status, "active"),
          sql`${adsTable.assetType} IN ('vimeo', 'youtube')`
        )
      : and(
          eq(adsTable.status, "active"),
          sql`${adsTable.assetType} IN ('vimeo', 'youtube')`,
          not(like(usersTable.email, "%.demo"))
        );

    const ads = await db
      .select({
        id: adsTable.id,
        title: adsTable.title,
        description: adsTable.description,
        assetUrl: adsTable.assetUrl,
        assetType: adsTable.assetType,
        minWatchSeconds: adsTable.minWatchSeconds,
        pointReward: adsTable.pointReward,
        multiplierFactor: adsTable.multiplierFactor,
        brandId: adsTable.brandId,
        brandName: brandsTable.companyName,
        brandLogoUrl: brandsTable.logoUrl,
        ownerEmail: usersTable.email,
      })
      .from(adsTable)
      .innerJoin(brandsTable, eq(adsTable.brandId, brandsTable.id))
      .innerJoin(usersTable, eq(brandsTable.userId, usersTable.id))
      .where(whereClause)
      .orderBy(sql`RANDOM()`)
      .limit(limit * 3); // over-fetch for weighted sampling

    // Apply weighted sampling based on multiplierFactor (proxy for weight)
    const weighted: typeof ads = [];
    const pool = [...ads];

    while (weighted.length < Math.min(limit, pool.length) && pool.length > 0) {
      const totalWeight = pool.reduce(
        (sum, a) => sum + parseFloat(String(a.multiplierFactor)), 0
      );
      let rand = Math.random() * totalWeight;
      let idx = 0;
      for (let i = 0; i < pool.length; i++) {
        rand -= parseFloat(String(pool[i]!.multiplierFactor));
        if (rand <= 0) { idx = i; break; }
      }
      weighted.push(pool[idx]!);
      pool.splice(idx, 1);
    }

    const videos = weighted.map((ad) => ({
      id: ad.id,
      title: ad.title,
      description: ad.description ?? null,
      videoId: ad.assetUrl,
      assetType: ad.assetType,
      vimeoId: ad.assetType === "vimeo" ? ad.assetUrl : null,
      brandName: ad.brandName,
      brandLogoUrl: ad.brandLogoUrl ?? null,
      minWatchSeconds: ad.minWatchSeconds,
      pointReward: ad.pointReward,
      weight: Math.round(parseFloat(String(ad.multiplierFactor)) * 10),
    }));

    res.json({ videos, total: videos.length });
  } catch (err) {
    logger.error({ err }, "Failed to fetch public videos");
    if (respondIfDatabaseUnavailable(res, err, "Failed to fetch videos")) return;
    res.status(500).json({ error: "internal_error", message: "Failed to fetch videos" });
  }
});

// GET /public/stats — platform stats for landing page (no auth)
router.get("/public/stats", async (req, res) => {
  try {
    const demoMode = await isDemoMode();

    if (demoMode) {
      // Include all data (demo + production)
      const [reviewerCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(eq(usersTable.role, "reviewer"));

      const [brandCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(brandsTable);

      const [completedCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewSessionsTable)
        .where(eq(reviewSessionsTable.status, "completed"));

      const [pointsSum] = await db
        .select({ total: sql<number>`coalesce(sum(amount), 0)::int` })
        .from(pointsLedgerTable)
        .where(sql`amount > 0`);

      const [activeAdsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(adsTable)
        .where(eq(adsTable.status, "active"));

      const totalPoints = pointsSum?.total ?? 0;
      const totalCompleted = completedCount?.count ?? 0;

      res.json({
        totalReviewers: reviewerCount?.count ?? 0,
        totalBrands: brandCount?.count ?? 0,
        totalAdsCompleted: totalCompleted,
        totalPointsAwarded: totalPoints,
        activeAds: activeAdsCount?.count ?? 0,
        avgPointsPerAd: totalCompleted > 0 ? Math.round(totalPoints / totalCompleted) : 0,
      });
    } else {
      // Production only — exclude .demo email users
      const [reviewerCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(and(eq(usersTable.role, "reviewer"), not(like(usersTable.email, "%.demo"))));

      const [brandCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(brandsTable)
        .innerJoin(usersTable, eq(brandsTable.userId, usersTable.id))
        .where(not(like(usersTable.email, "%.demo")));

      const [completedCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reviewSessionsTable)
        .innerJoin(usersTable, eq(reviewSessionsTable.userId, usersTable.id))
        .where(
          and(
            eq(reviewSessionsTable.status, "completed"),
            not(like(usersTable.email, "%.demo"))
          )
        );

      const [pointsSum] = await db
        .select({ total: sql<number>`coalesce(sum(pl.amount), 0)::int` })
        .from(pointsLedgerTable)
        .innerJoin(usersTable, eq(pointsLedgerTable.userId, usersTable.id))
        .where(and(sql`${pointsLedgerTable.amount} > 0`, not(like(usersTable.email, "%.demo"))));

      const [activeAdsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(adsTable)
        .innerJoin(brandsTable, eq(adsTable.brandId, brandsTable.id))
        .innerJoin(usersTable, eq(brandsTable.userId, usersTable.id))
        .where(and(eq(adsTable.status, "active"), not(like(usersTable.email, "%.demo"))));

      const totalPoints = pointsSum?.total ?? 0;
      const totalCompleted = completedCount?.count ?? 0;

      res.json({
        totalReviewers: reviewerCount?.count ?? 0,
        totalBrands: brandCount?.count ?? 0,
        totalAdsCompleted: totalCompleted,
        totalPointsAwarded: totalPoints,
        activeAds: activeAdsCount?.count ?? 0,
        avgPointsPerAd: totalCompleted > 0 ? Math.round(totalPoints / totalCompleted) : 0,
      });
    }
  } catch (err) {
    logger.error({ err }, "Failed to fetch public stats");
    if (respondIfDatabaseUnavailable(res, err, "Failed to fetch stats")) return;
    res.status(500).json({ error: "internal_error", message: "Failed to fetch stats" });
  }
});

// GET /public/packages — active pricing packages (no auth)
router.get("/public/packages", async (req, res) => {
  try {
    const packages = await db
      .select()
      .from(adPackagesTable)
      .where(eq(adPackagesTable.active, true))
      .orderBy(adPackagesTable.price);

    res.json({
      packages: packages.map((p) => ({
        ...p,
        price: parseFloat(String(p.price)),
      })),
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch public packages");
    if (respondIfDatabaseUnavailable(res, err, "Failed to fetch packages")) return;
    res.status(500).json({ error: "internal_error", message: "Failed to fetch packages" });
  }
});

export default router;
