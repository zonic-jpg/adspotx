import { Router } from "express";
import { db } from "@workspace/db";
import { adsTable, brandsTable, questionsTable, reviewSessionsTable } from "@workspace/db/schema";
import { eq, and, sql, count } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateParams, schemas, paramSchemas } from "../middlewares/validate";
import { logEvent, logEventSafe, EVENT_TYPES } from "../lib/events";
import { openai, isOpenAIConfigured, getOpenAIConfigError } from "@workspace/integrations-openai-ai-server";
import { computeQuestionInsight, sortSurveyInsights } from "../lib/review-scoring";
import { getMockBrandAnalytics, getMockBrandAds, getMockBrandComments, deleteMockBrandAd, reviewerMockEnabled } from "../lib/reviewer-mock-store";
import { normalizeAdAsset } from "../lib/asset-normalize";

const router = Router();

async function getBrandForUser(userId: string) {
  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.userId, userId)).limit(1);
  return brand;
}

function safeAdIds(ids: string[]) {
  return ids.map(id => `'${id.replace(/'/g, "")}'`).join(",");
}

// ─── GET /brands/ads ─────────────────────────────────────────────────────────
router.get("/brands/ads", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    if (reviewerMockEnabled()) {
      res.json(getMockBrandAds());
      return;
    }

    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }

    const ads = await db.select().from(adsTable).where(eq(adsTable.brandId, brand.id)).orderBy(sql`created_at DESC`);

    const adsWithStats = await Promise.all(ads.map(async (ad) => {
      const sr = await db.execute(
        sql`SELECT COUNT(*) as total_views,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_views,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN points_awarded ELSE 0 END), 0) as points_awarded,
            COALESCE(AVG(CASE WHEN status = 'completed' THEN watch_seconds END), 0) as avg_watch_seconds
          FROM review_sessions WHERE ad_id = ${ad.id}`
      );
      const s = sr.rows[0] as { total_views: string; completed_views: string; points_awarded: string; avg_watch_seconds: string };
      const totalViews = Number(s.total_views);
      const completedViews = Number(s.completed_views);

      const rr = await db.execute(
        sql`SELECT COALESCE(AVG(CAST(a.answer_value AS FLOAT)), null) as avg_rating
            FROM answers a
            JOIN review_sessions rs ON rs.id = a.review_session_id
            JOIN questions q ON q.id = a.question_id
            WHERE q.ad_id = ${ad.id} AND q.question_type = 'rating' AND rs.status = 'completed'`
      );
      const avgRatingRow = rr.rows[0] as { avg_rating: string | null };

      return { id: ad.id, title: ad.title, status: ad.status, totalViews, completedViews, completionRate: totalViews > 0 ? completedViews / totalViews : 0, pointsAwarded: Number(s.points_awarded), averageWatchSeconds: Math.round(Number(s.avg_watch_seconds)), averageRating: avgRatingRow.avg_rating ? Math.round(Number(avgRatingRow.avg_rating) * 10) / 10 : null, createdAt: ad.createdAt };
    }));

    await logEventSafe({ eventType: EVENT_TYPES.BRAND_ADS_VIEWED, actorId: req.user!.userId, entityType: "brand", entityId: brand.id, metadata: { adCount: ads.length } });

    res.json({ ads: adsWithStats, total: adsWithStats.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch brand ads" });
  }
});

// ─── POST /brands/ads ────────────────────────────────────────────────────────
router.post("/brands/ads", requireAuth, requireRole("brand"), validateBody(schemas.createAd), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }

    const { title, description, assetUrl, assetType, minWatchSeconds, pointReward, questions: questionsInput, proverbQuestion, proverbAnswer, proverbBonusPoints } = req.body;

    const normalized = normalizeAdAsset(assetUrl, assetType ?? "video");

    const result = await db.transaction(async (tx) => {
      const [ad] = await tx.insert(adsTable).values({
        brandId: brand.id,
        title,
        description: description ?? null,
        assetUrl: normalized.assetUrl,
        assetType: normalized.assetType,
        minWatchSeconds: minWatchSeconds ?? 15,
        pointReward: pointReward ?? 10,
        multiplierFactor: "1.0",
        status: "active",
        proverbQuestion: proverbQuestion?.trim() || null,
        proverbAnswer: proverbAnswer?.trim() || null,
        proverbBonusPoints: proverbBonusPoints ?? 5,
      }).returning();

      let questions: typeof questionsTable.$inferSelect[] = [];
      if (Array.isArray(questionsInput) && questionsInput.length > 0) {
        const limited = questionsInput.slice(0, 10);
        questions = await tx.insert(questionsTable).values(limited.map((q: { questionType: string; questionText: string; sortOrder?: number; options?: string[] }, i: number) => ({ adId: ad.id, questionType: q.questionType as "multiple_choice" | "rating" | "open_text" | "emoji" | "yes_no", questionText: q.questionText, sortOrder: q.sortOrder ?? i, options: q.options ?? null }))).returning();
      }

      await logEvent({ eventType: EVENT_TYPES.AD_CREATED, actorId: req.user!.userId, entityType: "ad", entityId: ad.id, metadata: { brandId: brand.id, title, questionCount: questions.length } }, tx);
      return { ...ad, questions };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to create ad" });
  }
});

// ─── GET /brands/ads/:adId ───────────────────────────────────────────────────
router.get("/brands/ads/:adId", requireAuth, requireRole("brand"), validateParams(paramSchemas.adId), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }
    const adId = String(req.params["adId"]);
    const [ad] = await db.select().from(adsTable).where(and(eq(adsTable.id, adId), eq(adsTable.brandId, brand.id))).limit(1);
    if (!ad) { res.status(404).json({ error: "not_found", message: "Ad not found" }); return; }
    const questions = await db.select().from(questionsTable).where(eq(questionsTable.adId, ad.id)).orderBy(questionsTable.sortOrder);
    await logEventSafe({ eventType: EVENT_TYPES.BRAND_AD_VIEWED, actorId: req.user!.userId, entityType: "ad", entityId: ad.id, metadata: { brandId: brand.id, title: ad.title } });
    res.json({ ...ad, questions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch ad" });
  }
});

// ─── PATCH /brands/ads/:adId ─────────────────────────────────────────────────
router.patch("/brands/ads/:adId", requireAuth, requireRole("brand"), validateParams(paramSchemas.adId), validateBody(schemas.updateAd), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }
    const adId = String(req.params["adId"]);
    const [existing] = await db.select().from(adsTable).where(and(eq(adsTable.id, adId), eq(adsTable.brandId, brand.id))).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found", message: "Ad not found" }); return; }

    const { title, description, status, minWatchSeconds, pointReward } = req.body;
    const updateData: Partial<typeof adsTable.$inferInsert> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (minWatchSeconds !== undefined) updateData.minWatchSeconds = minWatchSeconds;
    if (pointReward !== undefined) updateData.pointReward = pointReward;
    updateData.updatedAt = new Date();

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx.update(adsTable).set(updateData).where(eq(adsTable.id, adId)).returning();
      const changedFields = Object.keys(updateData).filter((k) => k !== "updatedAt");
      await logEvent({ eventType: EVENT_TYPES.AD_UPDATED, actorId: req.user!.userId, entityType: "ad", entityId: existing.id, metadata: { brandId: brand.id, changedFields, updates: updateData } }, tx);
      if (status && status !== existing.status) {
        await logEvent({ eventType: EVENT_TYPES.AD_STATUS_CHANGED, actorId: req.user!.userId, entityType: "ad", entityId: existing.id, metadata: { oldStatus: existing.status, newStatus: status } }, tx);
      }
      const questions = await tx.select().from(questionsTable).where(eq(questionsTable.adId, updated.id)).orderBy(questionsTable.sortOrder);
      return { ...updated, questions };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to update ad" });
  }
});

// ─── DELETE /brands/ads/:adId ────────────────────────────────────────────────
router.delete("/brands/ads/:adId", requireAuth, requireRole("brand"), validateParams(paramSchemas.adId), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);

    if (reviewerMockEnabled()) {
      const result = deleteMockBrandAd(adId, req.user!.userId);
      if (!result) {
        res.status(404).json({ error: "not_found", message: "Ad not found" });
        return;
      }
      res.json({
        deleted: true,
        archived: false,
        message: "Campaign deleted.",
      });
      return;
    }

    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }
    const [existing] = await db.select().from(adsTable).where(and(eq(adsTable.id, adId), eq(adsTable.brandId, brand.id))).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found", message: "Ad not found" }); return; }

    const [{ sessionCount }] = await db
      .select({ sessionCount: count() })
      .from(reviewSessionsTable)
      .where(eq(reviewSessionsTable.adId, adId));

    await db.transaction(async (tx) => {
      if (Number(sessionCount) > 0) {
        await tx.update(adsTable).set({ status: "archived", updatedAt: new Date() }).where(eq(adsTable.id, adId));
        await logEvent({ eventType: EVENT_TYPES.AD_STATUS_CHANGED, actorId: req.user!.userId, entityType: "ad", entityId: adId, metadata: { oldStatus: existing.status, newStatus: "archived", action: "soft_delete" } }, tx);
      } else {
        await tx.delete(questionsTable).where(eq(questionsTable.adId, adId));
        await tx.delete(adsTable).where(eq(adsTable.id, adId));
        await logEvent({ eventType: EVENT_TYPES.AD_UPDATED, actorId: req.user!.userId, entityType: "ad", entityId: adId, metadata: { brandId: brand.id, action: "hard_delete", title: existing.title } }, tx);
      }
    });

    res.json({
      deleted: Number(sessionCount) === 0,
      archived: Number(sessionCount) > 0,
      message: Number(sessionCount) > 0
        ? "Campaign archived — it has review history and cannot be permanently deleted."
        : "Campaign deleted.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to delete ad" });
  }
});

// ─── GET /brands/ads/:adId/stats ─────────────────────────────────────────────
router.get("/brands/ads/:adId/stats", requireAuth, requireRole("brand"), validateParams(paramSchemas.adId), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }
    const adId = String(req.params["adId"]);
    const [ad] = await db.select().from(adsTable).where(and(eq(adsTable.id, adId), eq(adsTable.brandId, brand.id))).limit(1);
    if (!ad) { res.status(404).json({ error: "not_found", message: "Ad not found" }); return; }

    const sr = await db.execute(
      sql`SELECT COUNT(*) as total_views, COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_views,
          COALESCE(AVG(CASE WHEN status = 'completed' THEN watch_seconds END), 0) as avg_watch_seconds,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN points_awarded ELSE 0 END), 0) as total_points_awarded
        FROM review_sessions WHERE ad_id = ${ad.id}`
    );
    const stats = sr.rows[0] as { total_views: string; completed_views: string; avg_watch_seconds: string; total_points_awarded: string };

    const questions = await db.select().from(questionsTable).where(eq(questionsTable.adId, ad.id)).orderBy(questionsTable.sortOrder);
    const questionStats = await Promise.all(questions.map(async (q) => {
      const ar = await db.execute(
        sql`SELECT answer_value, answer_text, COUNT(*) as cnt FROM answers a
            JOIN review_sessions rs ON rs.id = a.review_session_id
            WHERE a.question_id = ${q.id} AND rs.status = 'completed'
            GROUP BY answer_value, answer_text`
      );
      const answers = ar.rows as Array<{ answer_value: string | null; answer_text: string | null; cnt: string }>;
      const totalAnswers = answers.reduce((s, r) => s + Number(r.cnt), 0);
      let averageRating: number | null = null;
      let optionBreakdown: Array<{ option: string; count: number; percentage: number }> | null = null;
      let openTextSamples: string[] | null = null;
      if (q.questionType === "rating") {
        const sum = answers.reduce((s, r) => s + Number(r.answer_value ?? 0) * Number(r.cnt), 0);
        averageRating = totalAnswers > 0 ? Math.round((sum / totalAnswers) * 10) / 10 : null;
      } else if (["multiple_choice", "emoji", "yes_no"].includes(q.questionType)) {
        optionBreakdown = answers.map(r => ({ option: r.answer_value ?? "", count: Number(r.cnt), percentage: totalAnswers > 0 ? Math.round((Number(r.cnt) / totalAnswers) * 100) : 0 })).sort((a, b) => b.count - a.count);
      } else if (q.questionType === "open_text") {
        openTextSamples = answers.slice(0, 5).map(r => r.answer_text ?? "").filter(Boolean);
      }
      return { questionId: q.id, questionText: q.questionText, questionType: q.questionType, responseCount: totalAnswers, averageRating, optionBreakdown, openTextSamples };
    }));

    await logEventSafe({ eventType: EVENT_TYPES.BRAND_AD_STATS_VIEWED, actorId: req.user!.userId, entityType: "ad", entityId: ad.id, metadata: { brandId: brand.id } });

    res.json({ adId: ad.id, totalViews: Number(stats.total_views), completedViews: Number(stats.completed_views), completionRate: Number(stats.total_views) > 0 ? Number(stats.completed_views) / Number(stats.total_views) : 0, averageWatchSeconds: Math.round(Number(stats.avg_watch_seconds)), totalPointsAwarded: Number(stats.total_points_awarded), questionStats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch ad stats" });
  }
});

// ─── POST /brands/ads/:adId/questions ────────────────────────────────────────
router.post("/brands/ads/:adId/questions", requireAuth, requireRole("brand"), validateParams(paramSchemas.adId), validateBody(schemas.addQuestion), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }
    const adId = String(req.params["adId"]);
    const [ad] = await db.select().from(adsTable).where(and(eq(adsTable.id, adId), eq(adsTable.brandId, brand.id))).limit(1);
    if (!ad) { res.status(404).json({ error: "not_found", message: "Ad not found" }); return; }
    const [{ qCount }] = await db.select({ qCount: count() }).from(questionsTable).where(eq(questionsTable.adId, ad.id));
    if (Number(qCount) >= 10) { res.status(400).json({ error: "bad_request", message: "Maximum 10 questions per ad" }); return; }
    const { questionType, questionText, sortOrder, options } = req.body;
    const question = await db.transaction(async (tx) => {
      const [q] = await tx.insert(questionsTable).values({ adId: ad.id, questionType, questionText, sortOrder: sortOrder ?? Number(qCount), options: options ?? null }).returning();
      await logEvent({ eventType: EVENT_TYPES.AD_UPDATED, actorId: req.user!.userId, entityType: "ad", entityId: ad.id, metadata: { action: "add_question", questionId: q.id, questionType, brandId: brand.id } }, tx);
      return q;
    });
    res.status(201).json(question);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to add question" });
  }
});

// ─── GET /brands/stats/overview ──────────────────────────────────────────────
router.get("/brands/stats/overview", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }

    const result = await db.execute(
      sql`SELECT COUNT(DISTINCT a.id) as total_ads, COUNT(DISTINCT CASE WHEN a.status = 'active' THEN a.id END) as active_ads,
          COUNT(rs.id) as total_views, COUNT(CASE WHEN rs.status = 'completed' THEN 1 END) as total_completions,
          COALESCE(SUM(CASE WHEN rs.status = 'completed' THEN rs.points_awarded ELSE 0 END), 0) as total_points_awarded
        FROM ads a LEFT JOIN review_sessions rs ON rs.ad_id = a.id WHERE a.brand_id = ${brand.id}`
    );
    const r = result.rows[0] as { total_ads: string; active_ads: string; total_views: string; total_completions: string; total_points_awarded: string };
    const totalViews = Number(r.total_views);
    const totalCompletions = Number(r.total_completions);

    await logEventSafe({ eventType: EVENT_TYPES.BRAND_STATS_VIEWED, actorId: req.user!.userId, entityType: "brand", entityId: brand.id, metadata: { totalAds: Number(r.total_ads), activeAds: Number(r.active_ads) } });

    res.json({ totalAds: Number(r.total_ads), activeAds: Number(r.active_ads), totalViews, totalCompletions, overallCompletionRate: totalViews > 0 ? totalCompletions / totalViews : 0, totalPointsAwarded: Number(r.total_points_awarded) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch overview stats" });
  }
});

// ─── GET /brands/analytics ───────────────────────────────────────────────────
router.get("/brands/analytics", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    if (reviewerMockEnabled()) {
      res.json(getMockBrandAnalytics());
      return;
    }

    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }

    const allAds = await db.select({ id: adsTable.id, title: adsTable.title, status: adsTable.status, pointReward: adsTable.pointReward, multiplierFactor: adsTable.multiplierFactor }).from(adsTable).where(eq(adsTable.brandId, brand.id));
    if (allAds.length === 0) { res.json({ hasCampaigns: false }); return; }

    // ── Filter params ─────────────────────────────────────────────────────────
    const adIdFilter = typeof req.query["adId"] === "string" ? req.query["adId"] : null;
    const genderFilter = typeof req.query["gender"] === "string" ? req.query["gender"] : null;
    const ageBandFilter = typeof req.query["ageBand"] === "string" ? req.query["ageBand"] : null;
    const stateRaw = req.query["state"];
    const stateFilter: string[] = typeof stateRaw === "string" && stateRaw
      ? stateRaw.split(",").map(s => s.trim().replace(/'/g, "")).filter(Boolean)
      : [];
    const timeOfDayFilter = typeof req.query["timeOfDay"] === "string" ? req.query["timeOfDay"] : null;

    const filteredAds = adIdFilter ? allAds.filter(a => a.id === adIdFilter) : allAds;
    if (filteredAds.length === 0) { res.json({ hasCampaigns: false }); return; }

    const adIds = filteredAds.map(a => a.id);
    const adIdSql = safeAdIds(adIds);

    // Time-of-day WHERE fragment (Lagos time UTC+1)
    let timeFilter = "";
    if (timeOfDayFilter === "morning")   timeFilter = " AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') >= 6  AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') < 12";
    if (timeOfDayFilter === "afternoon") timeFilter = " AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') >= 12 AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') < 17";
    if (timeOfDayFilter === "evening")   timeFilter = " AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') >= 17 AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') < 21";
    if (timeOfDayFilter === "night")     timeFilter = " AND (EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') >= 21 OR EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') < 6)";

    // Demographic filter fragments
    const genderWhere  = genderFilter  ? ` AND rp.gender = '${genderFilter.replace(/'/g,"")}'` : "";
    const ageBandWhere = ageBandFilter ? ` AND rp.age_band = '${ageBandFilter.replace(/'/g,"")}'` : "";
    const stateWhere   = stateFilter.length > 0
      ? ` AND rp.state = ANY(ARRAY[${stateFilter.map(s => `'${s}'`).join(",")}])`
      : "";

    // When demographic filters are active we must join reviewer_profiles in overall stats too
    const hasDemoFilter = genderFilter || ageBandFilter || stateFilter.length > 0;
    const demoJoin   = hasDemoFilter ? " JOIN reviewer_profiles rp ON rp.user_id = rs.user_id" : "";
    const demoWhere  = hasDemoFilter ? `${genderWhere}${ageBandWhere}${stateWhere}` : "";

    // For overall stats without rp alias (no demo filter)
    const simpleTimeFilter = timeOfDayFilter
      ? timeFilter.replace(/rs\.completed_at/g, "completed_at").replace(/rs\./g, "")
      : "";

    // ── Overall stats ─────────────────────────────────────────────────────────
    let overallResult;
    if (hasDemoFilter) {
      overallResult = await db.execute(sql.raw(
        `SELECT COUNT(*) as total_views, COUNT(CASE WHEN rs.status = 'completed' THEN 1 END) as total_completions,
            COALESCE(AVG(CASE WHEN rs.status = 'completed' THEN rs.watch_seconds END), 0) as avg_watch_seconds,
            COALESCE(SUM(CASE WHEN rs.status = 'completed' THEN rs.points_awarded ELSE 0 END), 0) as total_points
          FROM review_sessions rs${demoJoin}
          WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[])${demoWhere}${timeFilter}`
      ));
    } else {
      overallResult = await db.execute(sql.raw(
        `SELECT COUNT(*) as total_views, COUNT(CASE WHEN status = 'completed' THEN 1 END) as total_completions,
            COALESCE(AVG(CASE WHEN status = 'completed' THEN watch_seconds END), 0) as avg_watch_seconds,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN points_awarded ELSE 0 END), 0) as total_points
          FROM review_sessions
          WHERE ad_id = ANY(ARRAY[${adIdSql}]::uuid[])${simpleTimeFilter}`
      ));
    }
    const overall = overallResult.rows[0] as { total_views: string; total_completions: string; avg_watch_seconds: string; total_points: string };

    // ── Time-of-day distribution ──────────────────────────────────────────────
    const todResult = await db.execute(sql.raw(
      `SELECT CASE
          WHEN EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') >= 6  AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') < 12 THEN 'Morning'
          WHEN EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') >= 12 AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') < 17 THEN 'Afternoon'
          WHEN EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') >= 17 AND EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos') < 21 THEN 'Evening'
          ELSE 'Night'
        END as period, COUNT(*) as cnt
        FROM review_sessions rs${demoJoin}
        WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[]) AND rs.status = 'completed'${demoWhere}
        GROUP BY period ORDER BY MIN(EXTRACT(HOUR FROM rs.completed_at AT TIME ZONE 'Africa/Lagos'))`
    ));

    // ── Demographics ─────────────────────────────────────────────────────────
    const genderResult = await db.execute(sql.raw(
      `SELECT rp.gender, COUNT(DISTINCT rs.user_id) as cnt
          FROM review_sessions rs JOIN reviewer_profiles rp ON rp.user_id = rs.user_id
          WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[]) AND rs.status = 'completed' AND rp.gender IS NOT NULL${ageBandWhere}${stateWhere}${timeFilter}
          GROUP BY rp.gender ORDER BY cnt DESC`
    ));
    const ageBandResult = await db.execute(sql.raw(
      `SELECT rp.age_band, COUNT(DISTINCT rs.user_id) as cnt
          FROM review_sessions rs JOIN reviewer_profiles rp ON rp.user_id = rs.user_id
          WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[]) AND rs.status = 'completed' AND rp.age_band IS NOT NULL${genderWhere}${stateWhere}${timeFilter}
          GROUP BY rp.age_band ORDER BY cnt DESC`
    ));
    const stateResult = await db.execute(sql.raw(
      `SELECT rp.state, COUNT(DISTINCT rs.user_id) as cnt
          FROM review_sessions rs JOIN reviewer_profiles rp ON rp.user_id = rs.user_id
          WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[]) AND rs.status = 'completed' AND rp.state IS NOT NULL${genderWhere}${ageBandWhere}${timeFilter}
          GROUP BY rp.state ORDER BY cnt DESC LIMIT 15`
    ));
    const employmentResult = await db.execute(sql.raw(
      `SELECT rp.employment_status, COUNT(DISTINCT rs.user_id) as cnt
          FROM review_sessions rs JOIN reviewer_profiles rp ON rp.user_id = rs.user_id
          WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[]) AND rs.status = 'completed' AND rp.employment_status IS NOT NULL${genderWhere}${ageBandWhere}${stateWhere}${timeFilter}
          GROUP BY rp.employment_status ORDER BY cnt DESC`
    ));

    const genderRows     = genderResult.rows     as Array<{ gender: string; cnt: string }>;
    const ageBandRows    = ageBandResult.rows     as Array<{ age_band: string; cnt: string }>;
    const stateRows      = stateResult.rows       as Array<{ state: string; cnt: string }>;
    const employmentRows = employmentResult.rows  as Array<{ employment_status: string; cnt: string }>;
    const todRows        = todResult.rows          as Array<{ period: string; cnt: string }>;

    const genderTotal     = genderRows.reduce((s, r) => s + Number(r.cnt), 0);
    const ageBandTotal    = ageBandRows.reduce((s, r) => s + Number(r.cnt), 0);
    const stateTotal      = stateRows.reduce((s, r) => s + Number(r.cnt), 0);
    const employmentTotal = employmentRows.reduce((s, r) => s + Number(r.cnt), 0);

    // ── Survey insights with positivity score ─────────────────────────────────
    const questionScope = adIdFilter
      ? `ad_id = '${adIdFilter.replace(/'/g, "")}'`
      : `ad_id = ANY(ARRAY[${adIdSql}]::uuid[])`;
    const questions = await db.execute(sql.raw(`SELECT * FROM questions WHERE ${questionScope} ORDER BY sort_order ASC`));
    const qRows = questions.rows as Array<{ id: string; ad_id: string; question_text: string; question_type: string; options: string[] | null; sort_order: number }>;

    const surveyInsights = await Promise.all(qRows.map(async (q) => {
      const demoJoinQ = hasDemoFilter ? " JOIN reviewer_profiles rp ON rp.user_id = rs.user_id" : "";
      const demoWhereQ = hasDemoFilter ? demoWhere.replace(/rs\./g, "rs.") : "";
      const ar = await db.execute(sql.raw(
        `SELECT a.answer_value, a.answer_text, COUNT(*) as cnt FROM answers a
            JOIN review_sessions rs ON rs.id = a.review_session_id${demoJoinQ}
            WHERE a.question_id = '${q.id}' AND rs.status = 'completed'${demoWhereQ}${timeFilter}
            GROUP BY a.answer_value, a.answer_text`
      ));
      const answers = ar.rows as Array<{ answer_value: string | null; answer_text: string | null; cnt: string }>;
      const insight = computeQuestionInsight(q.id, q.question_type, answers);
      return {
        questionId: q.id,
        adId: q.ad_id,
        questionText: q.question_text,
        questionType: q.question_type,
        totalAnswers: insight.totalAnswers,
        avgRating: insight.avgRating,
        positivityScore: insight.positivityScore,
        distribution: insight.distribution,
        samples: insight.samples,
      };
    }));

    const sortedInsights = sortSurveyInsights(surveyInsights);

    // ── Per-ad performance ────────────────────────────────────────────────────
    const adsPerformance = await Promise.all(filteredAds.map(async (ad) => {
      const sr = await db.execute(sql.raw(
        `SELECT COUNT(*) as total, COUNT(CASE WHEN status='completed' THEN 1 END) as done,
            COALESCE(AVG(CASE WHEN status='completed' THEN watch_seconds END),0) as avg_watch,
            COALESCE(SUM(CASE WHEN status='completed' THEN points_awarded ELSE 0 END),0) as total_points
            FROM review_sessions WHERE ad_id = '${ad.id}'`
      ));
      const row = sr.rows[0] as { total: string; done: string; avg_watch: string; total_points: string };
      const estCostPerReview = Math.round(ad.pointReward * parseFloat(String(ad.multiplierFactor ?? "1")));
      return { id: ad.id, title: ad.title, status: ad.status, total: Number(row.total), completed: Number(row.done), avgWatch: Math.round(Number(row.avg_watch)), totalPoints: Number(row.total_points), estCostPerReview };
    }));

    // ── 14-day trend ─────────────────────────────────────────────────────────
    const trendResult = await db.execute(sql.raw(
      `SELECT DATE(rs.completed_at) as day, COUNT(*) as cnt
          FROM review_sessions rs${demoJoin}
          WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[]) AND rs.status = 'completed' AND rs.completed_at >= NOW() - INTERVAL '14 days'${demoWhere}${timeFilter}
          GROUP BY day ORDER BY day ASC`
    ));

    // ── Estimated campaign cost ───────────────────────────────────────────────
    const totalEstCost = filteredAds.reduce((sum, ad) => {
      return sum + Math.round(ad.pointReward * parseFloat(String(ad.multiplierFactor ?? "1")));
    }, 0);

    res.json({
      hasCampaigns: true,
      filters: { adId: adIdFilter, gender: genderFilter, ageBand: ageBandFilter, state: stateFilter, timeOfDay: timeOfDayFilter },
      overview: {
        totalViews: Number(overall.total_views),
        totalCompletions: Number(overall.total_completions),
        completionRate: Number(overall.total_views) > 0 ? Number(overall.total_completions) / Number(overall.total_views) : 0,
        avgWatchSeconds: Math.round(Number(overall.avg_watch_seconds)),
        totalPoints: Number(overall.total_points),
        engagementRate: Number(overall.total_views) > 0 ? Math.round((Number(overall.total_completions) / Number(overall.total_views)) * 100) : 0,
        totalEstCostPoints: totalEstCost,
      },
      demographics: {
        gender: genderRows.map(r => ({ label: r.gender, count: Number(r.cnt), pct: genderTotal > 0 ? Math.round((Number(r.cnt) / genderTotal) * 100) : 0 })),
        ageBand: ageBandRows.map(r => ({ label: r.age_band.replace(/_/g, "-").replace("plus", "+"), count: Number(r.cnt), pct: ageBandTotal > 0 ? Math.round((Number(r.cnt) / ageBandTotal) * 100) : 0 })),
        state: stateRows.map(r => ({ label: r.state, count: Number(r.cnt), pct: stateTotal > 0 ? Math.round((Number(r.cnt) / stateTotal) * 100) : 0 })),
        employmentStatus: employmentRows.map(r => ({ label: r.employment_status.replace(/_/g, " "), count: Number(r.cnt), pct: employmentTotal > 0 ? Math.round((Number(r.cnt) / employmentTotal) * 100) : 0 })),
        timeOfDay: todRows.map(r => ({ label: r.period, count: Number(r.cnt) })),
        totalProfiled: Math.max(genderTotal, ageBandTotal, stateTotal, employmentTotal),
      },
      surveyInsights: sortedInsights,
      adsPerformance,
      allAds: allAds.map(a => ({ id: a.id, title: a.title, status: a.status })),
      trend: (trendResult.rows as Array<{ day: string; cnt: string }>).map(r => ({ date: r.day, completions: Number(r.cnt) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch analytics" });
  }
});

// ─── GET /brands/analytics/comments ──────────────────────────────────────────
router.get("/brands/analytics/comments", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    if (reviewerMockEnabled()) {
      res.json(getMockBrandComments());
      return;
    }

    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }

    const adIdFilter = typeof req.query["adId"] === "string" ? req.query["adId"] : null;
    const genderFilter = typeof req.query["gender"] === "string" ? req.query["gender"] : null;
    const ageBandFilter = typeof req.query["ageBand"] === "string" ? req.query["ageBand"] : null;
    const stateRaw2 = req.query["state"];
    const stateFilter: string[] = typeof stateRaw2 === "string" && stateRaw2
      ? stateRaw2.split(",").map(s => s.trim().replace(/'/g, "")).filter(Boolean)
      : [];

    const allAds = await db.select({ id: adsTable.id }).from(adsTable).where(eq(adsTable.brandId, brand.id));
    if (allAds.length === 0) { res.json({ comments: [], total: 0 }); return; }

    const adIds = adIdFilter ? [adIdFilter] : allAds.map(a => a.id);
    const adIdSql = safeAdIds(adIds);

    const genderWhere  = genderFilter  ? ` AND rp.gender = '${genderFilter.replace(/'/g,"")}'` : "";
    const ageBandWhere = ageBandFilter ? ` AND rp.age_band = '${ageBandFilter.replace(/'/g,"")}'` : "";
    const stateWhere   = stateFilter.length > 0
      ? ` AND rp.state = ANY(ARRAY[${stateFilter.map(s => `'${s}'`).join(",")}])`
      : "";

    const result = await db.execute(sql.raw(
      `SELECT rs.id, rs.comment, rs.completed_at, a.title as ad_title,
          u.username, rp.gender, rp.age_band, rp.state
        FROM review_sessions rs
        JOIN ads a ON a.id = rs.ad_id
        JOIN users u ON u.id = rs.user_id
        LEFT JOIN reviewer_profiles rp ON rp.user_id = rs.user_id
        WHERE rs.ad_id = ANY(ARRAY[${adIdSql}]::uuid[])
          AND rs.status = 'completed'
          AND rs.comment IS NOT NULL
          AND rs.comment <> ''
          ${genderWhere}${ageBandWhere}${stateWhere}
        ORDER BY rs.completed_at DESC
        LIMIT 200`
    ));

    const comments = (result.rows as Array<{ id: string; comment: string; completed_at: string; ad_title: string; username: string; gender: string | null; age_band: string | null; state: string | null }>)
      .map(r => ({
        id: r.id,
        comment: r.comment,
        completedAt: r.completed_at,
        adTitle: r.ad_title,
        reviewer: {
          username: r.username,
          gender: r.gender,
          ageBand: r.age_band?.replace(/_/g, "-").replace("plus", "+") ?? null,
          state: r.state,
        },
      }));

    res.json({ comments, total: comments.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch comments" });
  }
});

// ─── POST /brands/analytics/organize-comments ─────────────────────────────────
router.post("/brands/analytics/organize-comments", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    const { comments } = req.body as { comments: Array<{ comment: string; reviewer?: { gender?: string; state?: string } }> };
    if (!Array.isArray(comments) || comments.length === 0) {
      res.json({ themes: [] }); return;
    }

    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }

    const commentList = comments.slice(0, 100).map((c, i) => `${i + 1}. "${c.comment}"`).join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are an expert marketing analyst specializing in the Nigerian consumer market.
Your task is to analyse reviewer comments and organise them into meaningful themes.
Return a JSON object with a "themes" array. Each theme has:
- "label": a short theme name (max 5 words)
- "sentiment": "positive" | "neutral" | "negative"
- "count": number of comments in this theme
- "summary": one sentence describing the theme
- "topComment": the best representative comment from the group
- "commentIndices": array of 1-based comment numbers in this theme

Identify 3-6 themes. Be specific to Nigerian consumer context where relevant.`,
        },
        {
          role: "user",
          content: `Analyse these ${comments.length} reviewer comments for ${brand.companyName ?? "the brand"}:\n\n${commentList}\n\nReturn only valid JSON.`,
        },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    let parsed: { themes?: unknown[] } = {};
    try { parsed = JSON.parse(raw); } catch { parsed = { themes: [] }; }

    res.json(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to organise comments" });
  }
});

// ─── POST /brands/analytics/ai-summary ───────────────────────────────────────
router.post("/brands/analytics/ai-summary", requireAuth, requireRole("brand"), async (req, res) => {
  if (!isOpenAIConfigured()) {
    res.status(503).json({
      error: "service_unavailable",
      message: getOpenAIConfigError(),
    });
    return;
  }

  try {
    const { adId } = req.body as { adId?: string };
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "Brand profile not found" }); return; }

    let promptData: string;

    if (adId) {
      // ── Single-ad summary ────────────────────────────────────────────────────
      const [ad] = await db.select().from(adsTable)
        .where(and(eq(adsTable.id, adId), eq(adsTable.brandId, brand.id))).limit(1);
      if (!ad) { res.status(404).json({ error: "not_found", message: "Ad not found" }); return; }

      const [sr] = (await db.execute(
        sql`SELECT COUNT(*) as total_views,
              COUNT(CASE WHEN status='completed' THEN 1 END) as completed_views,
              COALESCE(AVG(CASE WHEN status='completed' THEN watch_seconds END),0) as avg_watch_seconds,
              COALESCE(SUM(CASE WHEN status='completed' THEN points_awarded ELSE 0 END),0) as total_points
            FROM review_sessions WHERE ad_id=${ad.id}`
      )).rows as Array<Record<string, unknown>>;

      const qr = (await db.execute(
        sql`SELECT q.question_text, q.question_type,
              COUNT(a.id) as response_count,
              AVG(CASE WHEN q.question_type='rating' THEN a.answer_value::numeric END) as avg_rating,
              MODE() WITHIN GROUP (ORDER BY a.answer_text) as top_answer
            FROM questions q
            LEFT JOIN answers a ON a.question_id = q.id
            LEFT JOIN review_sessions rs ON rs.id = a.review_session_id AND rs.status='completed'
            WHERE q.ad_id=${ad.id}
            GROUP BY q.id, q.question_text, q.question_type`
      )).rows as Array<Record<string, unknown>>;

      const totalV = Number(sr.total_views);
      const compV  = Number(sr.completed_views);

      promptData = `
Brand: ${brand.companyName}
Ad Title: ${ad.title}
Status: ${ad.status}
Created: ${new Date(ad.createdAt).toLocaleDateString("en-NG")}

Performance Metrics:
- Total Views: ${totalV.toLocaleString()}
- Completed Views: ${compV.toLocaleString()}
- Completion Rate: ${totalV > 0 ? ((compV / totalV) * 100).toFixed(1) : "0"}%
- Avg Watch Time: ${Math.round(Number(sr.avg_watch_seconds))}s
- Total Points Awarded to Reviewers: ${Number(sr.total_points).toLocaleString()}

Question & Response Analysis:
${qr.map((q) =>
  `• "${q.question_text}" [${q.question_type}]
   Responses: ${q.response_count}${q.avg_rating ? ` | Avg Rating: ${Number(q.avg_rating).toFixed(1)}/5` : ""}${q.top_answer ? ` | Top Answer: "${q.top_answer}"` : ""}`
).join("\n") || "No question data yet."}`;
    } else {
      // ── Brand-wide portfolio summary ──────────────────────────────────────────
      const [ov] = (await db.execute(
        sql`SELECT COUNT(DISTINCT a.id) as total_ads,
              COUNT(DISTINCT CASE WHEN a.status='active' THEN a.id END) as active_ads,
              COUNT(rs.id) as total_views,
              COUNT(CASE WHEN rs.status='completed' THEN 1 END) as total_completions,
              COALESCE(SUM(CASE WHEN rs.status='completed' THEN rs.points_awarded ELSE 0 END),0) as total_points,
              COALESCE(AVG(CASE WHEN rs.status='completed' THEN rs.watch_seconds END),0) as avg_watch
            FROM ads a LEFT JOIN review_sessions rs ON rs.ad_id=a.id
            WHERE a.brand_id=${brand.id}`
      )).rows as Array<Record<string, unknown>>;

      const adPerf = (await db.execute(
        sql`SELECT a.title, a.status,
              COUNT(rs.id) as views,
              COUNT(CASE WHEN rs.status='completed' THEN 1 END) as completions,
              COALESCE(AVG(CASE WHEN rs.status='completed' THEN rs.watch_seconds END),0) as avg_watch
            FROM ads a LEFT JOIN review_sessions rs ON rs.ad_id=a.id
            WHERE a.brand_id=${brand.id}
            GROUP BY a.id, a.title, a.status
            ORDER BY completions DESC LIMIT 10`
      )).rows as Array<Record<string, unknown>>;

      const genderR = (await db.execute(
        sql`SELECT rp.gender, COUNT(DISTINCT rs.user_id) as cnt
            FROM review_sessions rs
            JOIN reviewer_profiles rp ON rp.user_id=rs.user_id
            JOIN ads a ON a.id=rs.ad_id
            WHERE a.brand_id=${brand.id} AND rs.status='completed' AND rp.gender IS NOT NULL
            GROUP BY rp.gender ORDER BY cnt DESC`
      )).rows as Array<Record<string, unknown>>;

      const ageR = (await db.execute(
        sql`SELECT rp.age_band, COUNT(DISTINCT rs.user_id) as cnt
            FROM review_sessions rs
            JOIN reviewer_profiles rp ON rp.user_id=rs.user_id
            JOIN ads a ON a.id=rs.ad_id
            WHERE a.brand_id=${brand.id} AND rs.status='completed' AND rp.age_band IS NOT NULL
            GROUP BY rp.age_band ORDER BY cnt DESC LIMIT 6`
      )).rows as Array<Record<string, unknown>>;

      const stateR = (await db.execute(
        sql`SELECT rp.state, COUNT(DISTINCT rs.user_id) as cnt
            FROM review_sessions rs
            JOIN reviewer_profiles rp ON rp.user_id=rs.user_id
            JOIN ads a ON a.id=rs.ad_id
            WHERE a.brand_id=${brand.id} AND rs.status='completed' AND rp.state IS NOT NULL
            GROUP BY rp.state ORDER BY cnt DESC LIMIT 5`
      )).rows as Array<Record<string, unknown>>;

      const totalV = Number(ov.total_views);
      const totalC = Number(ov.total_completions);

      promptData = `
Brand: ${brand.companyName}
Report Date: ${new Date().toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}

Portfolio Overview:
- Total Campaigns: ${ov.total_ads} (${ov.active_ads} currently active)
- Total Views: ${totalV.toLocaleString()}
- Total Completions: ${totalC.toLocaleString()}
- Overall Completion Rate: ${totalV > 0 ? ((totalC / totalV) * 100).toFixed(1) : "0"}%
- Avg Watch Time (completed sessions): ${Math.round(Number(ov.avg_watch))}s
- Total Points Distributed to Nigerian Reviewers: ${Number(ov.total_points).toLocaleString()}

Campaign Performance (ranked by completions):
${adPerf.map((a, i) => {
  const rate = Number(a.views) > 0 ? ((Number(a.completions) / Number(a.views)) * 100).toFixed(1) : "0";
  return `${i + 1}. "${a.title}" [${a.status}] — ${Number(a.views).toLocaleString()} views, ${Number(a.completions).toLocaleString()} completions (${rate}%), avg watch: ${Math.round(Number(a.avg_watch))}s`;
}).join("\n") || "No campaigns yet."}

Audience Demographics:
Gender: ${genderR.map((r) => `${r.gender}: ${r.cnt}`).join(", ") || "No data yet"}
Age Groups: ${ageR.map((r) => `${String(r.age_band).replace("_", "-").replace("plus", "+")}: ${r.cnt}`).join(", ") || "No data yet"}
Top States: ${stateR.map((r) => `${r.state}: ${r.cnt}`).join(", ") || "No data yet"}`;
    }

    const systemPrompt = `You are an expert marketing analytics consultant specialising in the Nigerian digital advertising market.
Generate a professional, data-driven analytics summary report in markdown format.

Structure the report with these sections:
1. **Executive Summary** (2-3 punchy sentences with the most important headline numbers)
2. **Key Performance Metrics** (analyse the numbers, provide context)
3. **Audience Insights** (demographics, reach quality — only if data exists)
4. **Campaign Highlights** (best performers, patterns — only for portfolio reports)
5. **Actionable Recommendations** (3-5 specific, Nigeria-market-aware suggestions)

Use ## for sections, ### for subsections, **bold** for key figures.
Be specific with numbers. Keep tone professional but direct — brand managers are busy.
Reference Nigerian market context where relevant (e.g. mobile-first audience, state distribution, age demographics).`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const stream = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: `Generate an analytics summary for:\n${promptData}` },
      ],
      stream: true,
      max_completion_tokens: 2000,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();

    await logEventSafe({
      eventType: "brand.ai_summary.generated",
      actorId: req.user!.userId,
      entityType: "brand",
      entityId: brand.id,
      metadata: { adId: adId ?? null },
    });
  } catch (err) {
    console.error("AI summary error:", err);
    const message =
      err instanceof Error && err.message.includes("OpenAI")
        ? err.message
        : "Failed to generate AI summary — check server logs and OpenAI configuration.";
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error", message });
    } else {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  }
});

export default router;
