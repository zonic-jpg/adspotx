import { Router } from "express";
import { db } from "@workspace/db";
import {
  eventsLogTable, adsTable, brandsTable, usersTable,
  questionsTable, pointsLedgerTable, redemptionsTable,
  reviewSessionsTable, answersTable, platformSettingsTable,
} from "@workspace/db/schema";
import { eq, sql, and, gte, lte, count, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, requireSuperAdmin } from "../middlewares/auth";
import { validateBody, validateParams, validateQuery, querySchemas, paramSchemas } from "../middlewares/validate";
import { logEventSafe, logEvent, EVENT_TYPES } from "../lib/events";
import {
  adminMemoryEnabled,
  getMockAdminBrands,
  getMockAdminEvents,
  getMockAdminPoints,
  getMockAdminRedemptions,
  getMockAdminStats,
  getMockAdminUsers,
} from "../lib/admin-memory-store";
import { z } from "zod";

const BATCH_SIZE = 500;
const router = Router();

function csvEscape(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

function formatCsvRow(e: {
  id: string; eventType: string; actorId: string | null;
  entityType: string | null; entityId: string | null; metadata: unknown; createdAt: Date;
}): string {
  return [e.id, e.eventType, e.actorId ?? "", e.entityType ?? "", e.entityId ?? "",
    e.metadata ? JSON.stringify(e.metadata) : "", e.createdAt.toISOString()]
    .map((v) => csvEscape(String(v))).join(",");
}

// ─── GET /admin/events ────────────────────────────────────────────────────────
router.get("/admin/events", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminEvents), async (req, res) => {
  try {
    const { limit, offset, eventType, actorId, from, to } = res.locals["parsedQuery"] as {
      limit: number; offset: number; eventType?: string; actorId?: string; from?: string; to?: string;
    };
    if (adminMemoryEnabled()) {
      let mock = getMockAdminEvents({ limit, offset, eventType, from, to });
      if (actorId) {
        const filtered = mock.events.filter((e) => e.actorId === actorId);
        mock = { ...mock, events: filtered, total: filtered.length };
      }
      res.json(mock);
      return;
    }
    const conditions: ReturnType<typeof and>[] = [];
    if (eventType) conditions.push(eq(eventsLogTable.eventType, eventType));
    if (actorId) conditions.push(eq(eventsLogTable.actorId, actorId));
    if (from) conditions.push(gte(eventsLogTable.createdAt, new Date(from)));
    if (to) conditions.push(lte(eventsLogTable.createdAt, new Date(to)));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [events, countResult] = await Promise.all([
      db.select().from(eventsLogTable).where(whereClause).orderBy(desc(eventsLogTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(eventsLogTable).where(whereClause),
    ]);
    await logEventSafe({ eventType: EVENT_TYPES.ADMIN_EVENTS_QUERIED, actorId: req.user!.userId, entityType: "admin", entityId: null, metadata: { filters: { eventType, actorId, from, to }, total: Number(countResult[0]!.total) } });
    res.json({ events, total: Number(countResult[0]!.total), offset, limit });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error", message: "Failed to fetch events" }); }
});

// ─── GET /admin/events/export ─────────────────────────────────────────────────
router.get("/admin/events/export", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminEventsExport), async (req, res) => {
  const { eventType, from, to } = res.locals["parsedQuery"] as { eventType?: string; from?: string; to?: string; };
  const conditions: ReturnType<typeof and>[] = [];
  if (eventType) conditions.push(eq(eventsLogTable.eventType, eventType));
  if (from) conditions.push(gte(eventsLogTable.createdAt, new Date(from)));
  if (to) conditions.push(lte(eventsLogTable.createdAt, new Date(to)));
  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="adspot-events-${new Date().toISOString().split("T")[0]}.csv"`);
  res.flushHeaders();
  res.write(["id","event_type","actor_id","entity_type","entity_id","metadata","created_at"].join(",") + "\n");
  let batchOffset = 0; let hasMore = true;
  try {
    while (hasMore) {
      const batch = await db.select().from(eventsLogTable).where(whereClause).orderBy(desc(eventsLogTable.createdAt)).limit(BATCH_SIZE).offset(batchOffset);
      for (const e of batch) res.write(formatCsvRow(e) + "\n");
      hasMore = batch.length === BATCH_SIZE;
      batchOffset += BATCH_SIZE;
    }
    await logEventSafe({ eventType: EVENT_TYPES.ADMIN_EVENTS_EXPORTED, actorId: req.user!.userId, entityType: "admin", entityId: null, metadata: { filters: { eventType, from, to }, rowsExported: batchOffset } });
    res.end();
  } catch (err) { console.error("CSV export error:", err); res.end(); }
});

// ─── GET /admin/ads ───────────────────────────────────────────────────────────
router.get("/admin/ads", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminAds), async (req, res) => {
  try {
    const { limit, offset, status } = res.locals["parsedQuery"] as { limit: number; offset: number; status?: "draft" | "active" | "paused" | "archived"; };
    const whereClause = status ? eq(adsTable.status, status) : undefined;
    const [ads, countResult] = await Promise.all([
      db.select({
        id: adsTable.id, title: adsTable.title, status: adsTable.status, brandId: adsTable.brandId,
        brandName: brandsTable.companyName, assetUrl: adsTable.assetUrl, assetType: adsTable.assetType,
        description: adsTable.description, minWatchSeconds: adsTable.minWatchSeconds,
        pointReward: adsTable.pointReward, multiplierFactor: adsTable.multiplierFactor, createdAt: adsTable.createdAt,
      }).from(adsTable).leftJoin(brandsTable, eq(adsTable.brandId, brandsTable.id))
        .where(whereClause).orderBy(sql`ads.created_at DESC`).limit(limit).offset(offset),
      db.select({ total: count() }).from(adsTable).where(whereClause),
    ]);
    const adsWithStats = await Promise.all(ads.map(async (ad) => {
      const [statsResult, qCount] = await Promise.all([
        db.execute(sql`SELECT COUNT(*) as total_views, COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_views FROM review_sessions WHERE ad_id = ${ad.id}`),
        db.select({ total: count() }).from(questionsTable).where(eq(questionsTable.adId, ad.id)),
      ]);
      const stats = statsResult.rows[0] as { total_views: string; completed_views: string };
      return { ...ad, totalViews: Number(stats.total_views), completedViews: Number(stats.completed_views), questionCount: Number(qCount[0]!.total) };
    }));
    res.json({ ads: adsWithStats, total: Number(countResult[0]!.total) });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error", message: "Failed to fetch ads" }); }
});

// ─── PUT /admin/ads/:adId ─────────────────────────────────────────────────────
const adminUpdateAdSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  assetUrl: z.string().url().optional(),
  assetType: z.enum(["image", "video"]).optional(),
  minWatchSeconds: z.number().int().min(1).max(300).optional(),
  pointReward: z.number().int().min(1).max(10000).optional(),
  multiplierFactor: z.number().min(0.1).max(10).optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

router.put("/admin/ads/:adId", requireAuth, requireRole("admin"), validateParams(paramSchemas.adId), validateBody(adminUpdateAdSchema), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);
    const updates: Record<string, unknown> = { ...req.body, updatedAt: new Date() };
    if (updates["multiplierFactor"] !== undefined) updates["multiplierFactor"] = String(updates["multiplierFactor"]);
    const [existing] = await db.select({ id: adsTable.id }).from(adsTable).where(eq(adsTable.id, adId)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    const [updated] = await db.update(adsTable).set(updates as Partial<typeof adsTable.$inferInsert>).where(eq(adsTable.id, adId)).returning();
    await logEventSafe({ eventType: "admin.ad.updated", actorId: req.user!.userId, entityType: "ad", entityId: adId, metadata: { fields: Object.keys(req.body) } });
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── PATCH /admin/ads/:adId/status ───────────────────────────────────────────
router.patch("/admin/ads/:adId/status", requireAuth, requireRole("admin"), validateParams(paramSchemas.adId), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);
    const { status } = req.body;
    if (!["draft","active","paused","archived"].includes(status)) {
      res.status(400).json({ error: "bad_request", message: "Invalid status" }); return;
    }
    const [updated] = await db.update(adsTable).set({ status, updatedAt: new Date() }).where(eq(adsTable.id, adId)).returning();
    if (!updated) { res.status(404).json({ error: "not_found" }); return; }
    await logEventSafe({ eventType: EVENT_TYPES.AD_STATUS_CHANGED, actorId: req.user!.userId, entityType: "ad", entityId: adId, metadata: { newStatus: status } });
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── DELETE /admin/ads/:adId ──────────────────────────────────────────────────
router.delete("/admin/ads/:adId", requireAuth, requireRole("admin"), validateParams(paramSchemas.adId), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);
    const [existing] = await db.select({ id: adsTable.id, title: adsTable.title }).from(adsTable).where(eq(adsTable.id, adId)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    await db.delete(adsTable).where(eq(adsTable.id, adId));
    await logEventSafe({ eventType: "admin.ad.deleted", actorId: req.user!.userId, entityType: "ad", entityId: adId, metadata: { title: existing.title } });
    res.json({ success: true, deleted: adId });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── GET /admin/ads/:adId/questions ──────────────────────────────────────────
router.get("/admin/ads/:adId/questions", requireAuth, requireRole("admin"), validateParams(paramSchemas.adId), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);
    const questions = await db.select().from(questionsTable).where(eq(questionsTable.adId, adId)).orderBy(questionsTable.sortOrder);
    res.json({ questions, total: questions.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── POST /admin/ads/:adId/questions ─────────────────────────────────────────
const adminAddQuestionSchema = z.object({
  questionType: z.enum(["multiple_choice", "rating", "open_text", "emoji", "yes_no"]),
  questionText: z.string().min(1).max(500),
  sortOrder: z.number().int().min(0).optional().default(0),
  options: z.array(z.string().max(200)).optional().nullable(),
});

router.post("/admin/ads/:adId/questions", requireAuth, requireRole("admin"), validateParams(paramSchemas.adId), validateBody(adminAddQuestionSchema), async (req, res) => {
  try {
    const adId = String(req.params["adId"]);
    const { questionType, questionText, sortOrder, options } = req.body;
    const [ad] = await db.select({ id: adsTable.id }).from(adsTable).where(eq(adsTable.id, adId)).limit(1);
    if (!ad) { res.status(404).json({ error: "not_found", message: "Ad not found" }); return; }
    const [question] = await db.insert(questionsTable).values({
      adId, questionType, questionText, sortOrder: sortOrder ?? 0,
      options: options ? options : null,
    }).returning();
    await logEventSafe({ eventType: "admin.question.created", actorId: req.user!.userId, entityType: "question", entityId: question!.id, metadata: { adId, questionType } });
    res.status(201).json(question);
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── PATCH /admin/questions/:questionId ──────────────────────────────────────
const adminUpdateQuestionSchema = z.object({
  questionText: z.string().min(1).max(500).optional(),
  questionType: z.enum(["multiple_choice", "rating", "open_text", "emoji", "yes_no"]).optional(),
  sortOrder: z.number().int().min(0).optional(),
  options: z.array(z.string().max(200)).nullable().optional(),
});

router.patch("/admin/questions/:questionId", requireAuth, requireRole("admin"), validateParams(paramSchemas.questionId), validateBody(adminUpdateQuestionSchema), async (req, res) => {
  try {
    const questionId = String(req.params["questionId"]);
    const [existing] = await db.select({ id: questionsTable.id }).from(questionsTable).where(eq(questionsTable.id, questionId)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    const [updated] = await db.update(questionsTable).set(req.body).where(eq(questionsTable.id, questionId)).returning();
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── DELETE /admin/questions/:questionId ──────────────────────────────────────
router.delete("/admin/questions/:questionId", requireAuth, requireRole("admin"), validateParams(paramSchemas.questionId), async (req, res) => {
  try {
    const questionId = String(req.params["questionId"]);
    const [existing] = await db.select({ id: questionsTable.id }).from(questionsTable).where(eq(questionsTable.id, questionId)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    await db.delete(questionsTable).where(eq(questionsTable.id, questionId));
    await logEventSafe({ eventType: "admin.question.deleted", actorId: req.user!.userId, entityType: "question", entityId: questionId, metadata: {} });
    res.json({ success: true });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── GET /admin/brands ────────────────────────────────────────────────────────
router.get("/admin/brands", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminBrands), async (req, res) => {
  try {
    const { limit, offset } = res.locals["parsedQuery"] as { limit: number; offset: number };
    if (adminMemoryEnabled()) {
      res.json(getMockAdminBrands({ limit, offset }));
      return;
    }
    const [brands, countResult] = await Promise.all([
      db.select({
        id: brandsTable.id, companyName: brandsTable.companyName, website: brandsTable.website,
        logoUrl: brandsTable.logoUrl, createdAt: brandsTable.createdAt,
        userId: brandsTable.userId, userEmail: usersTable.email, username: usersTable.username,
      }).from(brandsTable).leftJoin(usersTable, eq(brandsTable.userId, usersTable.id))
        .orderBy(desc(brandsTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(brandsTable),
    ]);
    const brandsWithAds = await Promise.all(brands.map(async (b) => {
      const adCount = await db.select({ total: count() }).from(adsTable).where(eq(adsTable.brandId, b.id));
      return { ...b, adCount: Number(adCount[0]!.total) };
    }));
    res.json({ brands: brandsWithAds, total: Number(countResult[0]!.total) });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── PATCH /admin/brands/:brandId ─────────────────────────────────────────────
const adminUpdateBrandSchema = z.object({
  companyName: z.string().min(1).max(200).optional(),
  website: z.string().url().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
});

router.patch("/admin/brands/:brandId", requireAuth, requireRole("admin"), validateParams(paramSchemas.brandId), validateBody(adminUpdateBrandSchema), async (req, res) => {
  try {
    const brandId = String(req.params["brandId"]);
    const [existing] = await db.select({ id: brandsTable.id }).from(brandsTable).where(eq(brandsTable.id, brandId)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    const [updated] = await db.update(brandsTable).set(req.body).where(eq(brandsTable.id, brandId)).returning();
    await logEventSafe({ eventType: "admin.brand.updated", actorId: req.user!.userId, entityType: "brand", entityId: brandId, metadata: { fields: Object.keys(req.body) } });
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── GET /admin/users ─────────────────────────────────────────────────────────
router.get("/admin/users", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminUsers), async (req, res) => {
  try {
    const { limit, offset, role } = res.locals["parsedQuery"] as { limit: number; offset: number; role?: string; };
    if (adminMemoryEnabled()) {
      res.json(getMockAdminUsers({ limit, offset, role }));
      return;
    }
    const whereClause = role ? eq(usersTable.role, role as (typeof usersTable.$inferSelect)["role"]) : undefined;
    const [users, countResult] = await Promise.all([
      db.select({ id: usersTable.id, email: usersTable.email, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt })
        .from(usersTable).where(whereClause).orderBy(desc(usersTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(usersTable).where(whereClause),
    ]);
    const usersWithPoints = await Promise.all(users.map(async (u) => {
      if (u.role !== "reviewer") return { ...u, pointsBalance: null };
      const result = await db.execute(sql`SELECT COALESCE(SUM(amount), 0) as balance FROM points_ledger WHERE user_id = ${u.id}`);
      const row = result.rows[0] as { balance: string };
      return { ...u, pointsBalance: Number(row.balance) };
    }));
    await logEventSafe({ eventType: EVENT_TYPES.ADMIN_USERS_QUERIED, actorId: req.user!.userId, entityType: "admin", entityId: null, metadata: { filters: { role }, total: Number(countResult[0]!.total) } });
    res.json({ users: usersWithPoints, total: Number(countResult[0]!.total) });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error", message: "Failed to fetch users" }); }
});

// ─── POST /admin/users ────────────────────────────────────────────────────────
const createUserSchema = z.object({
  email:    z.string().email(),
  username: z.string().min(2).max(50),
  password: z.string().min(8),
  role:     z.enum(["reviewer", "brand", "admin", "super_admin"]),
  companyName: z.string().max(200).optional(),
});

router.post("/admin/users", requireAuth, requireSuperAdmin, validateBody(createUserSchema), async (req, res) => {
  try {
    const { email, username, password, role, companyName } = req.body;
    const existing = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: "conflict", message: "Email already in use" }); return; }
    const existingU = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.username, username)).limit(1);
    if (existingU.length > 0) { res.status(409).json({ error: "conflict", message: "Username already taken" }); return; }
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await db.transaction(async (tx) => {
      const [newUser] = await tx.insert(usersTable).values({ email, passwordHash, username, role }).returning();
      if (role === "brand") {
        await tx.insert(brandsTable).values({ userId: newUser!.id, companyName: companyName?.trim() || username });
      }
      await logEvent({ eventType: EVENT_TYPES.USER_REGISTER, actorId: req.user!.userId, entityType: "user", entityId: newUser!.id, metadata: { createdByAdmin: true, role, email } }, tx);
      return newUser!;
    });
    res.status(201).json({ id: user.id, email: user.email, username: user.username, role: user.role, createdAt: user.createdAt });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error", message: "Failed to create user" }); }
});

// ─── PATCH /admin/users/:userId/role ─────────────────────────────────────────
const changeRoleSchema = z.object({ role: z.enum(["reviewer", "brand", "admin", "super_admin"]) });
const userIdParam = z.object({ userId: z.string().uuid() });

router.patch("/admin/users/:userId/role", requireAuth, requireSuperAdmin, validateParams(userIdParam), validateBody(changeRoleSchema), async (req, res) => {
  try {
    // Owner protection: the platform owner account cannot be demoted, and
    // super_admin cannot be handed out here — it moves only by the owner
    // reassigning it deliberately (transfer semantics).
    const OWNER_EMAIL = "oadeagbo@gmail.com";
    const { role: requestedRole } = req.body as { role: string };
    const [target] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, String(req.params.userId))).limit(1);
    if (target?.email?.toLowerCase() === OWNER_EMAIL && requestedRole !== "super_admin") {
      res.status(403).json({ error: "forbidden", message: "The owner account cannot be demoted" });
      return;
    }
    if (requestedRole === "super_admin" && target?.email?.toLowerCase() !== OWNER_EMAIL && req.user!.email.toLowerCase() !== OWNER_EMAIL) {
      res.status(403).json({ error: "forbidden", message: "Only the owner can appoint another super admin (transfer)" });
      return;
    }
    const userId = String(req.params["userId"]);
    const { role } = req.body;
    if (userId === req.user!.userId) { res.status(400).json({ error: "bad_request", message: "Cannot change your own role" }); return; }
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found", message: "User not found" }); return; }
    const [updated] = await db.update(usersTable).set({ role, updatedAt: new Date() }).where(eq(usersTable.id, userId)).returning();
    if (role === "brand") {
      const hasBrand = await db.select({ id: brandsTable.id }).from(brandsTable).where(eq(brandsTable.userId, userId)).limit(1);
      if (hasBrand.length === 0) {
        await db.insert(brandsTable).values({ userId, companyName: existing.username });
      }
    }
    await logEventSafe({ eventType: "admin.user.role_changed", actorId: req.user!.userId, entityType: "user", entityId: userId, metadata: { oldRole: existing.role, newRole: role, targetEmail: existing.email } });
    res.json({ id: updated!.id, email: updated!.email, username: updated!.username, role: updated!.role });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error", message: "Failed to change role" }); }
});

// ─── DELETE /admin/users/:userId ──────────────────────────────────────────────
router.delete("/admin/users/:userId", requireAuth, requireSuperAdmin, validateParams(userIdParam), async (req, res) => {
  try {
    const userId = String(req.params["userId"]);
    if (userId === req.user!.userId) { res.status(400).json({ error: "bad_request", message: "Cannot delete your own account" }); return; }
    const [existing] = await db.select({ email: usersTable.email, role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found", message: "User not found" }); return; }
    if (existing.role === "super_admin") { res.status(403).json({ error: "forbidden", message: "Cannot delete a super admin account" }); return; }
    await db.delete(usersTable).where(eq(usersTable.id, userId));
    await logEventSafe({ eventType: "admin.user.deleted", actorId: req.user!.userId, entityType: "user", entityId: userId, metadata: { targetEmail: existing.email, targetRole: existing.role } });
    res.json({ success: true, deleted: userId });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error", message: "Failed to delete user" }); }
});

// ─── GET /admin/team ──────────────────────────────────────────────────────────
router.get("/admin/team", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const team = await db.select({ id: usersTable.id, email: usersTable.email, username: usersTable.username, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(usersTable).where(sql`role IN ('admin', 'super_admin')`).orderBy(sql`role DESC, created_at ASC`);
    res.json({ team, total: team.length });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── GET /admin/stats ─────────────────────────────────────────────────────────
router.get("/admin/stats", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    if (adminMemoryEnabled()) {
      res.json(getMockAdminStats());
      return;
    }
    // Respect demo_mode: when false, exclude .demo-email accounts from counts
    const [demoSetting] = await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, "demo_mode"))
      .limit(1);
    const demoMode = demoSetting?.value !== "false";

    const [totals] = demoMode
      ? await Promise.all([db.execute(sql`
          SELECT
            (SELECT COUNT(*) FROM users)                                                    AS total_users,
            (SELECT COUNT(*) FROM users WHERE role = 'reviewer')                           AS total_reviewers,
            (SELECT COUNT(*) FROM users WHERE role = 'brand')                              AS total_brands,
            (SELECT COUNT(*) FROM users WHERE role IN ('admin','super_admin'))              AS total_admins,
            (SELECT COUNT(*) FROM ads)                                                     AS total_ads,
            (SELECT COUNT(*) FROM ads WHERE status = 'active')                             AS active_ads,
            (SELECT COUNT(*) FROM review_sessions WHERE status = 'completed')              AS total_completions,
            (SELECT COALESCE(SUM(amount),0) FROM points_ledger)                           AS total_points_issued,
            (SELECT COUNT(*) FROM redemptions WHERE status = 'pending')                    AS pending_redemptions,
            (SELECT COUNT(*) FROM redemptions WHERE status = 'completed')                  AS completed_redemptions
        `)])
      : await Promise.all([db.execute(sql`
          SELECT
            (SELECT COUNT(*) FROM users WHERE email NOT LIKE '%.demo')                                                                      AS total_users,
            (SELECT COUNT(*) FROM users WHERE role = 'reviewer' AND email NOT LIKE '%.demo')                                               AS total_reviewers,
            (SELECT COUNT(*) FROM users WHERE role = 'brand'    AND email NOT LIKE '%.demo')                                               AS total_brands,
            (SELECT COUNT(*) FROM users WHERE role IN ('admin','super_admin') AND email NOT LIKE '%.demo')                                  AS total_admins,
            (SELECT COUNT(*) FROM ads WHERE brand_id IN (SELECT b.id FROM brands b JOIN users u ON u.id = b.user_id WHERE u.email NOT LIKE '%.demo'))                       AS total_ads,
            (SELECT COUNT(*) FROM ads WHERE status = 'active' AND brand_id IN (SELECT b.id FROM brands b JOIN users u ON u.id = b.user_id WHERE u.email NOT LIKE '%.demo')) AS active_ads,
            (SELECT COUNT(*) FROM review_sessions WHERE status = 'completed' AND user_id IN (SELECT id FROM users WHERE email NOT LIKE '%.demo'))                            AS total_completions,
            (SELECT COALESCE(SUM(amount),0) FROM points_ledger WHERE user_id IN (SELECT id FROM users WHERE email NOT LIKE '%.demo'))                                        AS total_points_issued,
            (SELECT COUNT(*) FROM redemptions WHERE status = 'pending'   AND user_id IN (SELECT id FROM users WHERE email NOT LIKE '%.demo'))                                AS pending_redemptions,
            (SELECT COUNT(*) FROM redemptions WHERE status = 'completed' AND user_id IN (SELECT id FROM users WHERE email NOT LIKE '%.demo'))                                AS completed_redemptions
        `)]);

    const row = totals.rows[0] as Record<string, string>;
    res.json({
      totalUsers:           Number(row["total_users"]),
      totalReviewers:       Number(row["total_reviewers"]),
      totalBrands:          Number(row["total_brands"]),
      totalAdmins:          Number(row["total_admins"]),
      totalAds:             Number(row["total_ads"]),
      activeAds:            Number(row["active_ads"]),
      totalCompletions:     Number(row["total_completions"]),
      totalPointsIssued:    Number(row["total_points_issued"]),
      pendingRedemptions:   Number(row["pending_redemptions"]),
      completedRedemptions: Number(row["completed_redemptions"]),
    });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── GET /admin/points ────────────────────────────────────────────────────────
router.get("/admin/points", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminPoints), async (req, res) => {
  try {
    const { limit, offset, userId } = res.locals["parsedQuery"] as { limit: number; offset: number; userId?: string };
    if (adminMemoryEnabled()) {
      const mock = getMockAdminPoints({ limit, offset });
      if (userId) {
        const entries = mock.entries.filter((e) => e.userId === userId);
        res.json({ entries, total: entries.length, offset, limit });
        return;
      }
      res.json(mock);
      return;
    }
    const whereClause = userId ? eq(pointsLedgerTable.userId, userId) : undefined;
    const [entries, countResult] = await Promise.all([
      db.select({
        id: pointsLedgerTable.id, amount: pointsLedgerTable.amount, source: pointsLedgerTable.source,
        description: pointsLedgerTable.description, createdAt: pointsLedgerTable.createdAt,
        userId: pointsLedgerTable.userId, userEmail: usersTable.email, username: usersTable.username,
      }).from(pointsLedgerTable).leftJoin(usersTable, eq(pointsLedgerTable.userId, usersTable.id))
        .where(whereClause).orderBy(desc(pointsLedgerTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(pointsLedgerTable).where(whereClause),
    ]);
    res.json({ entries, total: Number(countResult[0]!.total) });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── POST /admin/points/adjust ────────────────────────────────────────────────
const adjustPointsSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().int().refine(n => n !== 0, { message: "Amount cannot be zero" }),
  description: z.string().min(1).max(500),
});

router.post("/admin/points/adjust", requireAuth, requireRole("admin"), validateBody(adjustPointsSchema), async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    const [user] = await db.select({ id: usersTable.id, role: usersTable.role, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ error: "not_found", message: "User not found" }); return; }
    if (user.role !== "reviewer") { res.status(400).json({ error: "bad_request", message: "Points can only be adjusted for reviewers" }); return; }
    const [entry] = await db.insert(pointsLedgerTable).values({
      userId, amount, source: "admin_grant", description,
    }).returning();
    await logEventSafe({ eventType: "admin.points.adjusted", actorId: req.user!.userId, entityType: "user", entityId: userId, metadata: { amount, description, targetEmail: user.email } });
    res.status(201).json(entry);
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── GET /admin/redemptions ───────────────────────────────────────────────────
router.get("/admin/redemptions", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminRedemptions), async (req, res) => {
  try {
    const { limit, offset, status } = res.locals["parsedQuery"] as { limit: number; offset: number; status?: string };
    if (adminMemoryEnabled()) {
      res.json(getMockAdminRedemptions({ limit, offset, status }));
      return;
    }
    const whereClause = status ? eq(redemptionsTable.status, status as (typeof redemptionsTable.$inferSelect)["status"]) : undefined;
    const [redemptions, countResult] = await Promise.all([
      db.select({
        id: redemptionsTable.id, amountPoints: redemptionsTable.amountPoints,
        redemptionType: redemptionsTable.redemptionType, status: redemptionsTable.status,
        notes: redemptionsTable.notes, createdAt: redemptionsTable.createdAt, updatedAt: redemptionsTable.updatedAt,
        userId: redemptionsTable.userId, userEmail: usersTable.email, username: usersTable.username,
      }).from(redemptionsTable).leftJoin(usersTable, eq(redemptionsTable.userId, usersTable.id))
        .where(whereClause).orderBy(desc(redemptionsTable.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(redemptionsTable).where(whereClause),
    ]);
    res.json({ redemptions, total: Number(countResult[0]!.total) });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── PATCH /admin/redemptions/:id/status ─────────────────────────────────────
const updateRedemptionSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  notes: z.string().max(500).optional(),
});

router.patch("/admin/redemptions/:id/status", requireAuth, requireRole("admin"), validateParams(paramSchemas.redemptionId), validateBody(updateRedemptionSchema), async (req, res) => {
  try {
    const id = String(req.params["id"]);
    const { status, notes } = req.body;
    const [existing] = await db.select({ id: redemptionsTable.id, userId: redemptionsTable.userId }).from(redemptionsTable).where(eq(redemptionsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    const updateData: Record<string, unknown> = { status, updatedAt: new Date() };
    if (notes !== undefined) updateData["notes"] = notes;
    const [updated] = await db.update(redemptionsTable).set(updateData as Partial<typeof redemptionsTable.$inferInsert>).where(eq(redemptionsTable.id, id)).returning();
    await logEventSafe({ eventType: "admin.redemption.status_changed", actorId: req.user!.userId, entityType: "redemption", entityId: id, metadata: { newStatus: status, userId: existing.userId } });
    res.json(updated);
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── GET /admin/sessions ──────────────────────────────────────────────────────
router.get("/admin/sessions", requireAuth, requireRole("admin"), validateQuery(querySchemas.adminSessions), async (req, res) => {
  try {
    const { limit, offset, status, userId } = res.locals["parsedQuery"] as { limit: number; offset: number; status?: string; userId?: string };
    const conditions: ReturnType<typeof and>[] = [];
    if (status) conditions.push(eq(reviewSessionsTable.status, status as (typeof reviewSessionsTable.$inferSelect)["status"]));
    if (userId) conditions.push(eq(reviewSessionsTable.userId, userId));
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
    const [sessions, countResult] = await Promise.all([
      db.select({
        id: reviewSessionsTable.id, startedAt: reviewSessionsTable.startedAt,
        completedAt: reviewSessionsTable.completedAt, watchSeconds: reviewSessionsTable.watchSeconds,
        pointsAwarded: reviewSessionsTable.pointsAwarded, status: reviewSessionsTable.status,
        userId: reviewSessionsTable.userId, adId: reviewSessionsTable.adId,
        userEmail: usersTable.email, username: usersTable.username,
        adTitle: adsTable.title,
      }).from(reviewSessionsTable)
        .leftJoin(usersTable, eq(reviewSessionsTable.userId, usersTable.id))
        .leftJoin(adsTable, eq(reviewSessionsTable.adId, adsTable.id))
        .where(whereClause).orderBy(desc(reviewSessionsTable.startedAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(reviewSessionsTable).where(whereClause),
    ]);
    res.json({ sessions, total: Number(countResult[0]!.total) });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

// ─── DELETE /admin/sessions/:id ───────────────────────────────────────────────
router.delete("/admin/sessions/:id", requireAuth, requireRole("admin"), validateParams(paramSchemas.sessionIdAdmin), async (req, res) => {
  try {
    const id = String(req.params["id"]);
    const [existing] = await db.select({ id: reviewSessionsTable.id, userId: reviewSessionsTable.userId, pointsAwarded: reviewSessionsTable.pointsAwarded })
      .from(reviewSessionsTable).where(eq(reviewSessionsTable.id, id)).limit(1);
    if (!existing) { res.status(404).json({ error: "not_found" }); return; }
    await db.transaction(async (tx) => {
      await tx.delete(answersTable).where(eq(answersTable.reviewSessionId, id));
      await tx.delete(reviewSessionsTable).where(eq(reviewSessionsTable.id, id));
      if (existing.pointsAwarded && existing.pointsAwarded > 0) {
        await tx.insert(pointsLedgerTable).values({
          userId: existing.userId, amount: -existing.pointsAwarded,
          source: "admin_grant", description: "Session invalidated by admin",
        });
      }
    });
    await logEventSafe({ eventType: "admin.session.deleted", actorId: req.user!.userId, entityType: "session", entityId: id, metadata: { userId: existing.userId, pointsRevoked: existing.pointsAwarded } });
    res.json({ success: true, deleted: id });
  } catch (err) { console.error(err); res.status(500).json({ error: "internal_error" }); }
});

export default router;
