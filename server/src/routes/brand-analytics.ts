import { Router } from "express";
import { db } from "@workspace/db";
import { brandsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

async function getBrandForUser(userId: string) {
  const [brand] = await db.select().from(brandsTable).where(eq(brandsTable.userId, userId)).limit(1);
  return brand;
}

/**
 * GET /brands/analytics/deep
 * Deep, filterable audience & performance analytics for the authenticated brand.
 * All breakdowns are computed over COMPLETED review sessions joined to the
 * (now richer) reviewer profile, scoped to this brand's ads.
 *
 * Query filters (all optional, AND-combined):
 *   adId, gender, ageBand, state, city, incomeBand, deviceType,
 *   educationLevel, employmentStatus, maritalStatus,
 *   from (ISO date), to (ISO date)
 */
router.get("/brands/analytics/deep", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) {
      res.status(404).json({ error: "not_found", message: "No brand for this account" });
      return;
    }

    const q = req.query as Record<string, string | undefined>;
    const conds = [sql`a.brand_id = ${brand.id}`, sql`rs.status = 'completed'`];
    const eqFilter = (col: string, val: string | undefined) => {
      if (val && val !== "all") conds.push(sql`${sql.raw(col)} = ${val}`);
    };
    eqFilter("rs.ad_id", q.adId);
    eqFilter("rp.gender", q.gender);
    eqFilter("rp.age_band", q.ageBand);
    eqFilter("rp.state", q.state);
    eqFilter("rp.city", q.city);
    eqFilter("rp.income_band", q.incomeBand);
    eqFilter("rp.device_type", q.deviceType);
    eqFilter("rp.education_level", q.educationLevel);
    eqFilter("rp.employment_status", q.employmentStatus);
    eqFilter("rp.marital_status", q.maritalStatus);
    if (q.from) conds.push(sql`rs.completed_at >= ${q.from}::timestamptz`);
    if (q.to) conds.push(sql`rs.completed_at <= ${q.to}::timestamptz`);

    const where = sql.join(conds, sql` AND `);
    const base = sql`
      FROM ads a
      JOIN review_sessions rs ON rs.ad_id = a.id
      JOIN reviewer_profiles rp ON rp.user_id = rs.user_id
      WHERE ${where}`;

    const breakdown = async (col: string) => {
      const rows = await db.execute(sql`
        SELECT ${sql.raw(col)} AS key,
               COUNT(*)::int AS completions,
               COALESCE(AVG(rs.watch_seconds), 0)::float AS avg_watch,
               COALESCE(AVG(rs.watch_percentage), 0)::float AS avg_watch_pct
        ${base} AND ${sql.raw(col)} IS NOT NULL
        GROUP BY ${sql.raw(col)} ORDER BY completions DESC`);
      return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
        key: String(r.key),
        completions: Number(r.completions),
        avgWatch: Math.round(Number(r.avg_watch)),
        avgWatchPct: Math.round(Number(r.avg_watch_pct)),
      }));
    };

    const [
      totals, gender, ageBand, state, city, incomeBand, deviceType,
      educationLevel, employmentStatus, maritalStatus, timeseries,
    ] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS completions,
               COUNT(DISTINCT rs.user_id)::int AS unique_reviewers,
               COALESCE(AVG(rs.watch_seconds), 0)::float AS avg_watch,
               COALESCE(AVG(rs.watch_percentage), 0)::float AS avg_watch_pct
        ${base}`),
      breakdown("rp.gender"),
      breakdown("rp.age_band"),
      breakdown("rp.state"),
      breakdown("rp.city"),
      breakdown("rp.income_band"),
      breakdown("rp.device_type"),
      breakdown("rp.education_level"),
      breakdown("rp.employment_status"),
      breakdown("rp.marital_status"),
      db.execute(sql`
        SELECT to_char(date_trunc('day', rs.completed_at), 'YYYY-MM-DD') AS day,
               COUNT(*)::int AS completions
        ${base} AND rs.completed_at IS NOT NULL
        GROUP BY 1 ORDER BY 1`),
    ]);

    const t = (totals.rows[0] ?? {}) as Record<string, unknown>;
    res.json({
      totals: {
        completions: Number(t.completions ?? 0),
        uniqueReviewers: Number(t.unique_reviewers ?? 0),
        avgWatch: Math.round(Number(t.avg_watch ?? 0)),
        avgWatchPct: Math.round(Number(t.avg_watch_pct ?? 0)),
      },
      breakdowns: {
        gender, ageBand, state, city, incomeBand, deviceType,
        educationLevel, employmentStatus, maritalStatus,
      },
      timeseries: (timeseries.rows as Array<Record<string, unknown>>).map((r) => ({
        day: String(r.day), completions: Number(r.completions),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to load analytics" });
  }
});

/** Distinct filter values available to this brand (populate the filter UI). */
router.get("/brands/analytics/filters", requireAuth, requireRole("brand"), async (req, res) => {
  try {
    const brand = await getBrandForUser(req.user!.userId);
    if (!brand) { res.status(404).json({ error: "not_found", message: "No brand" }); return; }
    const distinct = async (col: string) => {
      const rows = await db.execute(sql`
        SELECT DISTINCT ${sql.raw(col)} AS v
        FROM ads a JOIN review_sessions rs ON rs.ad_id = a.id
        JOIN reviewer_profiles rp ON rp.user_id = rs.user_id
        WHERE a.brand_id = ${brand.id} AND ${sql.raw(col)} IS NOT NULL
        ORDER BY 1`);
      return (rows.rows as Array<Record<string, unknown>>).map((r) => String(r.v));
    };
    const ads = await db.execute(sql`
      SELECT a.id, a.title FROM ads a WHERE a.brand_id = ${brand.id} ORDER BY a.created_at DESC`);
    const [state, city] = await Promise.all([distinct("rp.state"), distinct("rp.city")]);
    res.json({
      ads: (ads.rows as Array<Record<string, unknown>>).map((r) => ({ id: String(r.id), title: String(r.title) })),
      state, city,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to load filters" });
  }
});

export default router;
