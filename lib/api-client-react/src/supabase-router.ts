/**
 * Routes legacy /api/* paths to Supabase direct reads/writes or Edge Functions.
 * Replaces Express + Netlify demo API when VITE_SUPABASE_* is configured.
 */
import { supabase } from "./supabase-client";
import { getSessionToken, invokeEdge, fetchProfile, type AdspotProfile } from "./supabase-auth";
import {
  OWNER_EMAIL,
  OWNER_SOFT_USER_ID,
  isOwnerEmail,
  isOwnerSoftSession,
  loadSoftOwnerUser,
} from "./admin-tester";
import {
  ADSPOT_PROFILES,
  ADSPOT_BRANDS,
  ADSPOT_REVIEWER_PROFILES,
  ADSPOT_ADS,
  ADSPOT_QUESTIONS,
  ADSPOT_REVIEW_SESSIONS,
  ADSPOT_POINTS_LEDGER,
  ADSPOT_REDEMPTIONS,
  ADSPOT_PACKAGES,
  ADSPOT_EVENTS_LOG,
  ADSPOT_PLATFORM_SETTINGS,
  ADSPOT_LEADERBOARD_SNAPSHOTS,
} from "./adspot-tables";
import * as partnersApi from "./supabase-partners";
import * as ops from "./supabase-ops";

type RouteResult = { status: number; body: unknown };

function softOwnerProfile(): AdspotProfile {
  const cached = loadSoftOwnerUser<{
    id?: string;
    email?: string;
    username?: string;
    role?: string;
    createdAt?: string;
  }>();
  return {
    id: cached?.id || OWNER_SOFT_USER_ID,
    email: cached?.email || OWNER_EMAIL,
    username: cached?.username || "oadeagbo",
    role: "super_admin",
    suspended: false,
    approval_status: "approved",
    created_at: cached?.createdAt || new Date().toISOString(),
  };
}

function adminEmptyPayload(): RouteResult {
  return {
    status: 200,
    body: {
      events: [], ads: [], users: [], packages: [], settings: {}, team: [], brands: [],
      entries: [], redemptions: [], sessions: [], total: 0,
      totalUsers: 0, totalReviewers: 0, totalBrands: 0, totalAdmins: 0,
      totalAds: 0, activeAds: 0, totalCompletions: 0, totalPointsIssued: 0,
      pendingRedemptions: 0, completedRedemptions: 0, totalSessions: 0,
    },
  };
}

async function resolveAuthEmail(userId?: string | null): Promise<string> {
  if (!supabase) return "";
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "";
  if (email) return email;
  if (userId) {
    try {
      const profile = await fetchProfile(userId);
      return profile?.email ?? "";
    } catch {
      return "";
    }
  }
  return "";
}

function err(status: number, error: string, message?: string): RouteResult {
  return { status, body: { error, message } };
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const code = (error as { code?: string })?.code ?? "";
  return code === "PGRST205" || /Could not find the table|schema cache|does not exist/i.test(msg);
}

function emptyOk(body: unknown): RouteResult {
  return { status: 200, body };
}

async function uid(): Promise<string | null> {
  if (isOwnerSoftSession() && !(await getSessionToken())) {
    return softOwnerProfile().id;
  }
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function requireUid(): Promise<string> {
  const id = await uid();
  if (!id) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return id;
}

/**
 * Super_admin and admin may act as brand / admin / reviewer without 403s.
 * Actual portal UX is controlled client-side via act-as switcher.
 * Owner email is always elevated even if adspot_profiles.role is stale (e.g. brand).
 */
async function requireRole(...roles: string[]): Promise<{ id: string; role: string }> {
  if (isOwnerSoftSession() && !(await getSessionToken())) {
    return { id: softOwnerProfile().id, role: "super_admin" };
  }
  const id = await requireUid();
  const email = await resolveAuthEmail(id);
  if (isOwnerEmail(email)) return { id, role: "super_admin" };

  let profile: AdspotProfile | null = null;
  try {
    profile = await fetchProfile(id);
  } catch {
    throw Object.assign(new Error("Profile not found"), { status: 401 });
  }
  if (!profile) throw Object.assign(new Error("Profile not found"), { status: 401 });
  if (isOwnerEmail(profile.email)) return { id, role: "super_admin" };

  const elevated = profile.role === "super_admin" || profile.role === "admin";
  if (elevated) return { id, role: profile.role };
  if (!roles.includes(profile.role)) {
    throw Object.assign(new Error("Forbidden"), { status: 403 });
  }
  return { id, role: profile.role };
}

function parseBody(init?: RequestInit): unknown {
  if (!init?.body || typeof init.body !== "string") return {};
  try {
    return JSON.parse(init.body);
  } catch {
    return {};
  }
}

function parseQuery(path: string): URLSearchParams {
  const q = path.indexOf("?");
  return new URLSearchParams(q >= 0 ? path.slice(q + 1) : "");
}

function pathOnly(path: string): string {
  const q = path.indexOf("?");
  return q >= 0 ? path.slice(0, q) : path;
}

// ── Public reads ────────────────────────────────────────────────────────────

async function publicVideos(params: URLSearchParams) {
  const limit = Number(params.get("limit") ?? 12);
  const { data: ads, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("*, adspot_brands(company_name)")
    .eq("status", "active")
    .limit(limit);
  if (error) throw error;
  const videos = (ads ?? []).map((a: Record<string, unknown>) => ({
    id: a.id,
    title: a.title,
    assetUrl: a.asset_url,
    assetType: a.asset_type,
    brandName: (a.adspot_brands as { company_name?: string })?.company_name ?? "",
  }));
  return { status: 200, body: { videos, total: videos.length } };
}

async function publicStats() {
  const [users, brands, sessions, ledger, activeAds] = await Promise.all([
    supabase!.from(ADSPOT_PROFILES).select("id", { count: "exact", head: true }),
    supabase!.from(ADSPOT_BRANDS).select("id", { count: "exact", head: true }),
    supabase!.from(ADSPOT_REVIEW_SESSIONS).select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase!.from(ADSPOT_POINTS_LEDGER).select("amount"),
    supabase!.from(ADSPOT_ADS).select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);
  const totalPoints = (ledger.data ?? []).reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  return {
    status: 200,
    body: {
      totalReviewers: users.count ?? 0,
      totalBrands: brands.count ?? 0,
      totalCompletions: sessions.count ?? 0,
      totalPointsAwarded: totalPoints,
      activeAds: activeAds.count ?? 0,
    },
  };
}

function mapAdPackage(row: Record<string, unknown>) {
  return {
    ...row,
    adSlots: Number(row.adSlots ?? row.ad_slots ?? 1),
    durationDays: Number(row.durationDays ?? row.duration_days ?? 30),
    maxImpressions: Number(row.maxImpressions ?? row.max_impressions ?? row.impressions ?? 0),
    featured: Boolean(row.featured),
    active: row.active !== false,
    createdAt: row.createdAt ?? row.created_at,
  };
}

async function publicPackages() {
  const { data, error } = await supabase!.from(ADSPOT_PACKAGES).select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return { status: 200, body: { packages: (data ?? []).map((row) => mapAdPackage(row as Record<string, unknown>)) } };
}

// ── Auth ────────────────────────────────────────────────────────────────────

async function authMe() {
  // Soft owner has no JWT — still return elevated profile so AuthContext does not 401→logout.
  if (isOwnerSoftSession() && !(await getSessionToken())) {
    const soft = softOwnerProfile();
    return {
      status: 200,
      body: {
        id: soft.id,
        email: soft.email,
        username: soft.username,
        role: "super_admin",
        createdAt: soft.created_at,
        displayName: soft.username,
        companyName: null,
        brandId: null,
        profile: null,
      },
    };
  }

  const id = await requireUid();
  const email = await resolveAuthEmail(id);
  let profile: AdspotProfile | null = null;
  try {
    profile = await fetchProfile(id);
  } catch {
    profile = null;
  }

  // Owner email always resolves as super_admin even if profile row missing or role is brand.
  if (isOwnerEmail(email) || (profile && isOwnerEmail(profile.email))) {
    const base = profile ?? {
      id,
      email: OWNER_EMAIL,
      username: "oadeagbo",
      role: "super_admin" as const,
      suspended: false,
      approval_status: "approved" as const,
      created_at: new Date().toISOString(),
    };
    profile = {
      ...base,
      email: isOwnerEmail(base.email) ? base.email : OWNER_EMAIL,
      role: "super_admin",
      approval_status: "approved",
      suspended: false,
    };
  }

  if (!profile) return err(401, "unauthorized", "Not signed in");

  const [{ data: rp }, { data: brand }] = await Promise.all([
    supabase!.from(ADSPOT_REVIEWER_PROFILES).select("*").eq("user_id", id).maybeSingle(),
    supabase!.from(ADSPOT_BRANDS).select("id, company_name, website").eq("user_id", id).maybeSingle(),
  ]);
  const displayName =
    (rp as { display_name?: string } | null)?.display_name ||
    profile.username;
  return {
    status: 200,
    body: {
      id: profile.id,
      email: profile.email,
      username: profile.username,
      role: profile.role,
      createdAt: profile.created_at,
      displayName,
      companyName: brand?.company_name ?? null,
      brandId: brand?.id ?? null,
      profile: rp
        ? {
            ...rp,
            displayName: (rp as { display_name?: string }).display_name ?? null,
          }
        : null,
    },
  };
}

// ── Reviewer ads ────────────────────────────────────────────────────────────

async function adFeed(params: URLSearchParams) {
  await requireUid();
  const limit = Number(params.get("limit") ?? 20);
  const offset = Number(params.get("offset") ?? 0);
  const { data, error, count } = await supabase!
    .from(ADSPOT_ADS)
    .select("*, adspot_brands(company_name), adspot_questions(id)", { count: "exact" })
    .eq("status", "active")
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const ads = (data ?? []).map((a: Record<string, unknown>) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    assetUrl: a.asset_url,
    assetType: a.asset_type,
    minWatchSeconds: a.min_watch_seconds,
    pointReward: a.point_reward,
    multiplierFactor: String(a.multiplier_factor),
    status: a.status,
    brandId: a.brand_id,
    brandName: (a.adspot_brands as { company_name?: string })?.company_name ?? "",
    questionCount: Array.isArray(a.adspot_questions) ? a.adspot_questions.length : 0,
    createdAt: a.created_at,
  }));
  return { status: 200, body: { ads, total: count ?? ads.length, offset, limit } };
}

async function adDetail(adId: string) {
  await requireUid();
  const { data: ad, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("*, adspot_brands(company_name), adspot_questions(*)")
    .eq("id", adId)
    .maybeSingle();
  if (error) throw error;
  if (!ad) return err(404, "not_found", "Ad not found");
  const questions = ((ad.adspot_questions as Record<string, unknown>[]) ?? [])
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
    .map((q) => ({
      id: q.id,
      adId: q.ad_id,
      sortOrder: q.sort_order,
      questionType: q.question_type,
      questionText: q.question_text,
      options: q.options,
    }));
  return {
    status: 200,
    body: {
      id: ad.id,
      title: ad.title,
      description: ad.description,
      assetUrl: ad.asset_url,
      assetType: ad.asset_type,
      minWatchSeconds: ad.min_watch_seconds,
      pointReward: ad.point_reward,
      multiplierFactor: String(ad.multiplier_factor),
      brandId: ad.brand_id,
      brandName: (ad.adspot_brands as { company_name?: string })?.company_name ?? "",
      proverbQuestion: ad.proverb_question,
      proverbBonusPoints: ad.proverb_bonus_points,
      questions,
    },
  };
}

// ── Reviews ─────────────────────────────────────────────────────────────────

async function reviewStart(body: Record<string, unknown>) {
  const userId = await requireUid();
  await requireRole("reviewer");
  const adId = String(body.adId ?? "");
  const { data, error } = await supabase!
    .from(ADSPOT_REVIEW_SESSIONS)
    .insert({ user_id: userId, ad_id: adId, status: "in_progress" })
    .select()
    .single();
  if (error) throw error;
  return {
    status: 201,
    body: {
      id: data.id,
      userId: data.user_id,
      adId: data.ad_id,
      startedAt: data.started_at,
      status: data.status,
    },
  };
}

async function reviewComplete(sessionId: string, body: Record<string, unknown>) {
  await requireUid();
  const result = await invokeEdge("complete-review", { sessionId, ...body });
  return { status: 200, body: result };
}

// ── Points ──────────────────────────────────────────────────────────────────

async function pointsBalance() {
  const userId = await requireUid();
  const { data, error } = await supabase!.from(ADSPOT_POINTS_LEDGER).select("amount").eq("user_id", userId);
  if (error) throw error;
  const balance = (data ?? []).reduce((s, r) => s + r.amount, 0);
  const totalEarned = (data ?? []).filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  return { status: 200, body: { userId, balance, totalEarned } };
}

async function pointsLedger(params: URLSearchParams) {
  const userId = await requireUid();
  const limit = Number(params.get("limit") ?? 20);
  const offset = Number(params.get("offset") ?? 0);
  const { data, error, count } = await supabase!
    .from(ADSPOT_POINTS_LEDGER)
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  const entries = (data ?? []).map((e) => ({
    id: e.id,
    amount: e.amount,
    source: e.source,
    description: e.description,
    createdAt: e.created_at,
  }));
  return { status: 200, body: { entries, total: count ?? entries.length } };
}

// ── Leaderboard ─────────────────────────────────────────────────────────────

async function leaderboard() {
  const userId = await requireUid();
  try {
    const result = await invokeEdge("leaderboard");
    return { status: 200, body: result };
  } catch {
    /* fall through to direct adspot tables */
  }
  const weekStart = new Date();
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  const { data: ledger, error } = await supabase!
    .from(ADSPOT_POINTS_LEDGER)
    .select("user_id, amount")
    .gte("created_at", weekStart.toISOString())
    .gt("amount", 0);
  if (error) {
    if (isMissingRelation(error)) return emptyOk({ weekStart: weekStart.toISOString(), entries: [] });
    throw error;
  }
  const totals = new Map<string, number>();
  for (const row of ledger ?? []) {
    totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.amount);
  }
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const ids = ranked.map(([id]) => id);
  const [{ data: profiles }, { data: reviewers }] = await Promise.all([
    ids.length
      ? supabase!.from(ADSPOT_PROFILES).select("id, username").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; username: string }[] }),
    ids.length
      ? supabase!.from(ADSPOT_REVIEWER_PROFILES).select("user_id, display_name").in("user_id", ids)
      : Promise.resolve({ data: [] as { user_id: string; display_name?: string }[] }),
  ]);
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
  const displayById = new Map(
    (reviewers ?? []).map((r) => [r.user_id, r.display_name || nameById.get(r.user_id) || "Reviewer"]),
  );
  const entries = ranked.map(([id, points], i) => ({
    rank: i + 1,
    userId: id,
    username: displayById.get(id) || nameById.get(id) || "Reviewer",
    points,
    isCurrentUser: id === userId,
  }));
  return { status: 200, body: { weekStart: weekStart.toISOString(), entries } };
}

async function leaderboardHistory(params: URLSearchParams) {
  await requireUid();
  const weeks = Number(params.get("weeks") ?? 4);
  const { data, error } = await supabase!
    .from(ADSPOT_LEADERBOARD_SNAPSHOTS)
    .select("*")
    .order("week_start", { ascending: false })
    .limit(weeks * 10);
  if (error) {
    if (isMissingRelation(error)) return emptyOk({ snapshots: [] });
    throw error;
  }
  return { status: 200, body: { snapshots: data ?? [] } };
}

async function leaderboardEligibility() {
  const userId = await requireUid();
  const { data: rp } = await supabase!.from(ADSPOT_REVIEWER_PROFILES).select("*").eq("user_id", userId).maybeSingle();
  const required = ["gender", "age_band", "state"];
  const missing = required.filter((f) => !rp?.[f]);
  return { status: 200, body: { eligible: missing.length === 0, missingFields: missing } };
}

// ── Brand ads ───────────────────────────────────────────────────────────────

async function brandAdsForUser(userId: string) {
  const { data: brand } = await supabase!.from(ADSPOT_BRANDS).select("id").eq("user_id", userId).maybeSingle();
  if (!brand) return [];
  const { data, error } = await supabase!.from(ADSPOT_ADS).select("*, adspot_questions(id)").eq("brand_id", brand.id);
  if (error) throw error;
  return data ?? [];
}

async function brandAdsList() {
  const userId = await requireUid();
  const ads = await brandAdsForUser(userId);
  return { status: 200, body: { ads: ads.map(mapBrandAd), total: ads.length } };
}

function mapBrandAd(a: Record<string, unknown>) {
  return {
    id: a.id,
    title: a.title,
    description: a.description,
    assetUrl: a.asset_url,
    assetType: a.asset_type,
    status: a.status,
    pointReward: a.point_reward,
    minWatchSeconds: a.min_watch_seconds,
    questionCount: Array.isArray(a.adspot_questions) ? a.adspot_questions.length : 0,
    createdAt: a.created_at,
  };
}

async function brandCreateAd(body: Record<string, unknown>) {
  const userId = await requireUid();
  await requireRole("brand", "admin", "super_admin");
  const { data: brand } = await supabase!.from(ADSPOT_BRANDS).select("id").eq("user_id", userId).maybeSingle();
  if (!brand) return err(404, "not_found", "Brand profile not found");
  const { data: ad, error } = await supabase!
    .from(ADSPOT_ADS)
    .insert({
      brand_id: brand.id,
      title: body.title,
      description: body.description,
      asset_url: body.assetUrl,
      asset_type: body.assetType ?? "video",
      min_watch_seconds: body.minWatchSeconds ?? 15,
      point_reward: body.pointReward ?? 10,
      multiplier_factor: body.multiplierFactor ?? "1.0",
      status: body.status ?? "draft",
      proverb_question: body.proverbQuestion,
      proverb_answer: body.proverbAnswer,
      proverb_bonus_points: body.proverbBonusPoints ?? 5,
    })
    .select()
    .single();
  if (error) throw error;
  const questions = (body.questions as Record<string, unknown>[]) ?? [];
  if (questions.length) {
    await supabase!.from(ADSPOT_QUESTIONS).insert(
      questions.map((q, i) => ({
        ad_id: ad.id,
        sort_order: q.sortOrder ?? i,
        question_type: q.questionType,
        question_text: q.questionText,
        options: q.options,
      })),
    );
  }
  return { status: 201, body: mapBrandAd(ad) };
}

async function brandAdDetail(adId: string) {
  const userId = await requireUid();
  const { data, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("*, adspot_brands!inner(user_id), adspot_questions(*)")
    .eq("id", adId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found", "Ad not found");
  const ownerId = (data.adspot_brands as { user_id: string }).user_id;
  const { role } = await requireRole("brand", "admin", "super_admin");
  if (role === "brand" && ownerId !== userId) return err(403, "forbidden");
  return { status: 200, body: { ...mapBrandAd(data), questions: data.adspot_questions ?? [] } };
}

async function brandAdStats(adId: string) {
  await requireUid();
  const { count } = await supabase!
    .from(ADSPOT_REVIEW_SESSIONS)
    .select("id", { count: "exact", head: true })
    .eq("ad_id", adId)
    .eq("status", "completed");
  return { status: 200, body: { adId, completions: count ?? 0 } };
}

async function brandOverview() {
  const userId = await requireUid();
  const ads = await brandAdsForUser(userId);
  const adIds = ads.map((a: { id: string }) => a.id);
  let completions = 0;
  if (adIds.length) {
    const { count } = await supabase!
      .from(ADSPOT_REVIEW_SESSIONS)
      .select("id", { count: "exact", head: true })
      .in("ad_id", adIds)
      .eq("status", "completed");
    completions = count ?? 0;
  }
  return { status: 200, body: { totalAds: ads.length, activeAds: ads.filter((a: { status: string }) => a.status === "active").length, totalCompletions: completions } };
}

// ── Admin reads ─────────────────────────────────────────────────────────────

async function adminEvents(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const limit = Number(params.get("limit") ?? 50);
  const offset = Number(params.get("offset") ?? 0);
  const { data, error, count } = await supabase!
    .from(ADSPOT_EVENTS_LOG)
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { status: 200, body: { events: data ?? [], total: count ?? 0 } };
}

async function adminAds(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const limit = Number(params.get("limit") ?? 50);
  const { data, error } = await supabase!.from(ADSPOT_ADS).select("*, adspot_brands(company_name)").limit(limit);
  if (error) throw error;
  return { status: 200, body: { ads: data ?? [], total: data?.length ?? 0 } };
}

async function adminUsers(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const role = params.get("role");
  let q = supabase!.from(ADSPOT_PROFILES).select("*");
  if (role) q = q.eq("role", role);
  const { data, error } = await q.limit(100);
  if (error) throw error;
  return { status: 200, body: { users: data ?? [], total: data?.length ?? 0 } };
}

async function adminPackages() {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from(ADSPOT_PACKAGES).select("*").order("sort_order");
  if (error) throw error;
  return { status: 200, body: { packages: (data ?? []).map((row) => mapAdPackage(row as Record<string, unknown>)) } };
}

async function adminSettings() {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from(ADSPOT_PLATFORM_SETTINGS).select("*");
  if (error) throw error;
  const settings = Object.fromEntries((data ?? []).map((s: { key: string; value: unknown }) => [s.key, s.value]));
  return { status: 200, body: { settings } };
}

async function adminStats() {
  await requireRole("admin", "super_admin");
  const safeCount = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    const r = await q;
    if (r.error && isMissingRelation(r.error)) return 0;
    if (r.error) throw r.error;
    return r.count ?? 0;
  };
  const [
    totalUsers,
    totalReviewers,
    totalBrands,
    totalAdmins,
    totalAds,
    activeAds,
    totalCompletions,
    pendingRedemptions,
    completedRedemptions,
  ] = await Promise.all([
    safeCount(supabase!.from(ADSPOT_PROFILES).select("id", { count: "exact", head: true })),
    safeCount(supabase!.from(ADSPOT_PROFILES).select("id", { count: "exact", head: true }).eq("role", "reviewer")),
    safeCount(supabase!.from(ADSPOT_BRANDS).select("id", { count: "exact", head: true })),
    safeCount(supabase!.from(ADSPOT_PROFILES).select("id", { count: "exact", head: true }).in("role", ["admin", "super_admin"])),
    safeCount(supabase!.from(ADSPOT_ADS).select("id", { count: "exact", head: true })),
    safeCount(supabase!.from(ADSPOT_ADS).select("id", { count: "exact", head: true }).eq("status", "active")),
    safeCount(supabase!.from(ADSPOT_REVIEW_SESSIONS).select("id", { count: "exact", head: true }).eq("status", "completed")),
    safeCount(supabase!.from(ADSPOT_REDEMPTIONS).select("id", { count: "exact", head: true }).eq("status", "pending")),
    safeCount(supabase!.from(ADSPOT_REDEMPTIONS).select("id", { count: "exact", head: true }).in("status", ["approved", "paid"])),
  ]);
  let totalPointsIssued = 0;
  const { data: ledger, error: ledgerErr } = await supabase!.from(ADSPOT_POINTS_LEDGER).select("amount");
  if (!ledgerErr) {
    totalPointsIssued = (ledger ?? []).reduce((s, r) => s + (r.amount > 0 ? r.amount : 0), 0);
  } else if (!isMissingRelation(ledgerErr)) {
    throw ledgerErr;
  }
  return {
    status: 200,
    body: {
      totalUsers,
      totalReviewers,
      totalBrands,
      totalAdmins,
      totalAds,
      activeAds,
      totalCompletions,
      totalPointsIssued,
      pendingRedemptions,
      completedRedemptions,
      totalSessions: totalCompletions,
    },
  };
}

async function adminTeam() {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from(ADSPOT_PROFILES).select("*").in("role", ["admin", "super_admin"]);
  if (error) throw error;
  return { status: 200, body: { team: data ?? [], total: data?.length ?? 0 } };
}

async function adminBrands(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from(ADSPOT_BRANDS).select("*, adspot_profiles(email, username)").limit(100);
  if (error) throw error;
  return { status: 200, body: { brands: data ?? [], total: data?.length ?? 0 } };
}

async function adminPoints(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const limit = Number(params.get("limit") ?? 50);
  const { data, error } = await supabase!
    .from(ADSPOT_POINTS_LEDGER)
    .select("*, adspot_profiles(email, username)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { status: 200, body: { entries: data ?? [], total: data?.length ?? 0 } };
}

async function adminRedemptions(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from(ADSPOT_REDEMPTIONS).select("*, adspot_profiles(email, username)").limit(100);
  if (error) throw error;
  return { status: 200, body: { redemptions: data ?? [], total: data?.length ?? 0 } };
}

async function adminSessions(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!
    .from(ADSPOT_REVIEW_SESSIONS)
    .select("*, adspot_profiles(email), adspot_ads(title)")
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return { status: 200, body: { sessions: data ?? [], total: data?.length ?? 0 } };
}

// ── Main router ─────────────────────────────────────────────────────────────

export async function routeSupabaseApi(relativePath: string, init?: RequestInit): Promise<RouteResult> {
  if (!supabase) {
    return err(503, "service_unavailable", "Supabase not configured");
  }

  const method = (init?.method ?? "GET").toUpperCase();
  const path = pathOnly(relativePath.replace(/^\/api/, ""));
  const params = parseQuery(relativePath);
  const body = parseBody(init) as Record<string, unknown>;

  // Soft owner has no JWT / RLS — serve /auth/me + empty admin GETs so UI does not spam unauthorized.
  if (isOwnerSoftSession() && !(await getSessionToken())) {
    if (path === "/auth/me" && method === "GET") return authMe();
    if (method === "GET" && (path.startsWith("/admin/") || path === "/admin")) {
      return adminEmptyPayload();
    }
    // Partners still work via localStorage seed so AdSpotX admin + portal demos stay usable.
    if (path.startsWith("/partners")) {
      /* fall through — partnersApi uses local store when tables/JWT unavailable */
    }
  }

  try {
    // Auth endpoints
    if (path === "/auth/login" && method === "POST") {
      const { supabaseLogin } = await import("./supabase-auth-flow");
      const result = await supabaseLogin(String(body.email ?? ""), String(body.password ?? ""));
      return { status: 200, body: result };
    }
    if (path === "/auth/register" && method === "POST") {
      const { supabaseRegister } = await import("./supabase-auth-flow");
      const result = await supabaseRegister({
        email: String(body.email ?? ""),
        password: String(body.password ?? ""),
        username: String(body.username ?? ""),
        role: body.role as "reviewer" | "brand",
        companyName: body.companyName as string | undefined,
      });
      return { status: 201, body: result };
    }
    if (path === "/auth/profile" && method === "GET") {
      const userId = await requireUid();
      return ops.authProfileGet(userId);
    }
    if (path === "/auth/profile" && method === "PATCH") {
      const userId = await requireUid();
      return ops.authProfilePatch(userId, body);
    }
    if (path === "/auth/me" && method === "GET") return authMe();
    if (path === "/healthz" && method === "GET") return { status: 200, body: { status: "ok", backend: "supabase" } };

    // Public
    if (path === "/public/videos" && method === "GET") return publicVideos(params);
    if (path === "/public/stats" && method === "GET") return publicStats();
    if (path === "/public/packages" && method === "GET") return publicPackages();

    // Ads
    if (path === "/ads" && method === "GET") return adFeed(params);
    const adMatch = path.match(/^\/ads\/([^/]+)$/);
    if (adMatch && method === "GET") return adDetail(adMatch[1]);

    // Reviews
    if (path === "/reviews/start" && method === "POST") return reviewStart(body);
    const completeMatch = path.match(/^\/reviews\/([^/]+)\/complete$/);
    if (completeMatch && method === "POST") return reviewComplete(completeMatch[1], body);

    // Points
    if (path === "/points/balance" && method === "GET") return pointsBalance();
    if (path === "/points/ledger" && method === "GET") return pointsLedger(params);

    // Leaderboard
    if (path === "/leaderboard" && method === "GET") return leaderboard();
    if (path === "/leaderboard/history" && method === "GET") return leaderboardHistory(params);
    if (path === "/leaderboard/eligibility" && method === "GET") return leaderboardEligibility();

    // Brands
    if (path === "/brands/ads" && method === "GET") return brandAdsList();
    if (path === "/brands/ads" && method === "POST") return brandCreateAd(body);
    if (path === "/brands/stats/overview" && method === "GET") return brandOverview();
    if (path === "/brands/analytics" && method === "GET") {
      const { id } = await requireRole("brand", "admin", "super_admin");
      return ops.brandAnalytics(id, params);
    }
    if (path === "/brands/analytics/comments" && method === "GET") {
      const { id } = await requireRole("brand", "admin", "super_admin");
      return ops.brandAnalyticsComments(id, params);
    }
    if (path === "/brands/analytics/deep" && method === "GET") {
      const { id } = await requireRole("brand", "admin", "super_admin");
      return ops.brandAnalyticsDeep(id, params);
    }
    if (path === "/brands/analytics/filters" && method === "GET") {
      const { id } = await requireRole("brand", "admin", "super_admin");
      return ops.brandAnalyticsFilters(id);
    }
    const brandRewardsMatch = path.match(/^\/brands\/ads\/([^/]+)\/rewards$/);
    if (brandRewardsMatch && method === "GET") {
      await requireRole("brand", "admin", "super_admin");
      return ops.brandListRewards(brandRewardsMatch[1]);
    }
    if (brandRewardsMatch && method === "POST") {
      const { id, role } = await requireRole("brand", "admin", "super_admin");
      return ops.brandCreateReward(brandRewardsMatch[1], id, role, body);
    }
    const brandQuestionsMatch = path.match(/^\/brands\/ads\/([^/]+)\/questions$/);
    if (brandQuestionsMatch && method === "POST") {
      const { id, role } = await requireRole("brand", "admin", "super_admin");
      return ops.brandAddQuestion(brandQuestionsMatch[1], id, role, body);
    }
    const brandStatsMatch = path.match(/^\/brands\/ads\/([^/]+)\/stats$/);
    if (brandStatsMatch && method === "GET") return brandAdStats(brandStatsMatch[1]);
    const brandAdMatch = path.match(/^\/brands\/ads\/([^/]+)$/);
    if (brandAdMatch && method === "GET") return brandAdDetail(brandAdMatch[1]);
    if (brandAdMatch && method === "PATCH") {
      const { id, role } = await requireRole("brand", "admin", "super_admin");
      return ops.brandUpdateAd(brandAdMatch[1], id, role, body);
    }
    if (brandAdMatch && method === "DELETE") {
      const { id, role } = await requireRole("brand", "admin", "super_admin");
      return ops.brandDeleteAd(brandAdMatch[1], id, role);
    }

    // Partners (AdSpotX)
    if (path === "/partners" && method === "GET") {
      if (!(isOwnerSoftSession() && !(await getSessionToken()))) {
        await requireRole("admin", "super_admin");
      }
      return partnersApi.partnersList();
    }
    if (path === "/partners" && method === "POST") {
      // Soft owner → local store. Authenticated admin preferred; any signed-in user may onboard.
      if (!(isOwnerSoftSession() && !(await getSessionToken()))) {
        try {
          await requireRole("admin", "super_admin");
        } catch {
          await requireUid();
        }
      }
      return partnersApi.partnersCreate(body);
    }
    const partnerActivate = path.match(/^\/partners\/([^/]+)\/integration\/activate$/);
    if (partnerActivate && method === "POST") return partnersApi.partnersIntegrationActivate(partnerActivate[1]);
    const partnerDeactivate = path.match(/^\/partners\/([^/]+)\/integration\/deactivate$/);
    if (partnerDeactivate && method === "POST") return partnersApi.partnersIntegrationDeactivate(partnerDeactivate[1]);
    const partnerIntegration = path.match(/^\/partners\/([^/]+)\/integration$/);
    if (partnerIntegration && method === "GET") return partnersApi.partnersIntegrationGet(partnerIntegration[1]);
    const partnerAnalytics = path.match(/^\/partners\/([^/]+)\/analytics$/);
    if (partnerAnalytics && method === "GET") return partnersApi.partnersAnalytics(partnerAnalytics[1]);
    const partnerGet = path.match(/^\/partners\/([^/]+)$/);
    if (partnerGet && method === "GET") return partnersApi.partnersGet(partnerGet[1]);

    // Rewards (reviewer)
    const adRewardMatch = path.match(/^\/ads\/([^/]+)\/reward$/);
    if (adRewardMatch && method === "GET") {
      const userId = await requireUid();
      return ops.adsRewardGet(adRewardMatch[1], userId);
    }
    if (path === "/me/rewards" && method === "GET") {
      const userId = await requireUid();
      return ops.meRewards(userId);
    }
    const rewardClaimMatch = path.match(/^\/rewards\/([^/]+)\/claim$/);
    if (rewardClaimMatch && method === "POST") {
      const { id } = await requireRole("reviewer", "admin", "super_admin");
      return ops.claimRewardDirect(rewardClaimMatch[1], id);
    }

    // Admin reads
    if (path === "/admin/events" && method === "GET") return adminEvents(params);
    if (path === "/admin/events/export" && method === "GET") {
      await requireRole("admin", "super_admin");
      return ops.adminEventsExport(params);
    }
    if (path === "/admin/ads" && method === "GET") return adminAds(params);
    if (path === "/admin/users" && method === "GET") return adminUsers(params);
    if (path === "/admin/packages" && method === "GET") return adminPackages();
    if (path === "/admin/settings" && method === "GET") return adminSettings();
    if (path === "/admin/stats" && method === "GET") return adminStats();
    if (path === "/admin/team" && method === "GET") return adminTeam();
    if (path === "/admin/brands" && method === "GET") return adminBrands(params);
    if (path === "/admin/points" && method === "GET") return adminPoints(params);
    if (path === "/admin/redemptions" && method === "GET") return adminRedemptions(params);
    if (path === "/admin/sessions" && method === "GET") return adminSessions(params);
    if (path === "/admin/health" && method === "GET") {
      await requireRole("admin", "super_admin");
      return ops.adminHealth();
    }

    const adminAdQuestions = path.match(/^\/admin\/ads\/([^/]+)\/questions$/);
    if (adminAdQuestions && method === "GET") {
      await requireRole("admin", "super_admin");
      return ops.adminGetAdQuestions(adminAdQuestions[1]);
    }
    if (adminAdQuestions && method === "POST") {
      await requireRole("admin", "super_admin");
      return ops.adminAddQuestion(adminAdQuestions[1], body);
    }
    const adminAdStatus = path.match(/^\/admin\/ads\/([^/]+)\/status$/);
    if (adminAdStatus && method === "PATCH") {
      await requireRole("admin", "super_admin");
      return ops.adminPatchAdStatus(adminAdStatus[1], String(body.status ?? ""));
    }
    const adminAdId = path.match(/^\/admin\/ads\/([^/]+)$/);
    if (adminAdId && method === "PUT") {
      await requireRole("admin", "super_admin");
      return ops.adminUpdateAd(adminAdId[1], body);
    }
    if (adminAdId && method === "DELETE") {
      await requireRole("admin", "super_admin");
      return ops.adminDeleteAd(adminAdId[1]);
    }
    const adminQuestion = path.match(/^\/admin\/questions\/([^/]+)$/);
    if (adminQuestion && method === "PATCH") {
      await requireRole("admin", "super_admin");
      return ops.adminPatchQuestion(adminQuestion[1], body);
    }
    if (adminQuestion && method === "DELETE") {
      await requireRole("admin", "super_admin");
      return ops.adminDeleteQuestion(adminQuestion[1]);
    }
    const adminBrandPatch = path.match(/^\/admin\/brands\/([^/]+)$/);
    if (adminBrandPatch && method === "PATCH") {
      await requireRole("admin", "super_admin");
      return ops.adminPatchBrand(adminBrandPatch[1], body);
    }

    // Trusted writes → Edge Functions
    if (path === "/admin/points/adjust" && method === "POST") {
      await requireRole("admin", "super_admin");
      return { status: 200, body: await invokeEdge("adjust-points", body) };
    }
    const redemptionMatch = path.match(/^\/admin\/redemptions\/([^/]+)\/status$/);
    if (redemptionMatch && method === "PATCH") {
      await requireRole("admin", "super_admin");
      return { status: 200, body: await invokeEdge("update-redemption", { id: redemptionMatch[1], ...body }) };
    }
    const sessionDelMatch = path.match(/^\/admin\/sessions\/([^/]+)$/);
    if (sessionDelMatch && method === "DELETE") {
      await requireRole("admin", "super_admin");
      return { status: 200, body: await invokeEdge("revoke-session", { sessionId: sessionDelMatch[1] }) };
    }
    if (path === "/admin/users" && method === "POST") {
      await requireRole("super_admin");
      return { status: 201, body: await invokeEdge("admin-user-ops", { action: "create", ...body }) };
    }
    const roleMatch = path.match(/^\/admin\/users\/([^/]+)\/role$/);
    if (roleMatch && method === "PATCH") {
      await requireRole("super_admin");
      return { status: 200, body: await invokeEdge("admin-user-ops", { action: "change_role", userId: roleMatch[1], ...body }) };
    }
    const userDelMatch = path.match(/^\/admin\/users\/([^/]+)$/);
    if (userDelMatch && method === "DELETE") {
      await requireRole("super_admin");
      return { status: 200, body: await invokeEdge("admin-user-ops", { action: "delete", userId: userDelMatch[1] }) };
    }
    const purchaseMatch = path.match(/^\/brands\/packages\/([^/]+)\/purchase$/);
    if (purchaseMatch && method === "POST") {
      await requireRole("brand", "admin", "super_admin");
      return { status: 200, body: await invokeEdge("purchase-package", { packageId: purchaseMatch[1] }) };
    }
    if (path === "/brands/analytics/organize-comments" && method === "POST") {
      await requireRole("brand", "admin", "super_admin");
      try {
        return { status: 200, body: await invokeEdge("organize-comments", body) };
      } catch {
        return { status: 200, body: { themes: [] } };
      }
    }
    if (path === "/brands/analytics/ai-summary" && method === "POST") {
      await requireRole("brand", "admin", "super_admin");
      return ops.aiSummary(body);
    }
    if (path === "/storage/uploads" && method === "POST") {
      await requireRole("brand", "admin", "super_admin");
      return ops.storageUpload(init);
    }

    // Admin packages/settings writes (safe with RLS — direct)
    if (path === "/admin/packages" && method === "POST") {
      await requireRole("admin", "super_admin");
      const { data, error } = await supabase!.from(ADSPOT_PACKAGES).insert(body).select().single();
      if (error) throw error;
      return { status: 201, body: data };
    }
    const pkgMatch = path.match(/^\/admin\/packages\/([^/]+)$/);
    if (pkgMatch && (method === "PATCH" || method === "DELETE")) {
      await requireRole("admin", "super_admin");
      if (method === "DELETE") {
        const { error } = await supabase!.from(ADSPOT_PACKAGES).delete().eq("id", pkgMatch[1]);
        if (error) throw error;
        return { status: 204, body: null };
      }
      const { data, error } = await supabase!.from(ADSPOT_PACKAGES).update(body).eq("id", pkgMatch[1]).select().single();
      if (error) throw error;
      return { status: 200, body: data };
    }
    if (path === "/admin/settings" && method === "PATCH") {
      await requireRole("admin", "super_admin");
      const settings = body.settings as Record<string, unknown> | undefined;
      if (settings) {
        for (const [key, value] of Object.entries(settings)) {
          await supabase!.from(ADSPOT_PLATFORM_SETTINGS).upsert({ key, value });
        }
      }
      return adminSettings();
    }

    return err(404, "not_found", `No Supabase route for ${method} ${path}`);
  } catch (e: unknown) {
    const ex = e as Error & { status?: number; code?: string };
    if (isMissingRelation(ex)) {
      // Schema not applied yet — return empty payloads so admin UI does not spam unauthorized.
      if (method === "GET") {
        if (path.startsWith("/admin/")) {
          return adminEmptyPayload();
        }
        return emptyOk({ ads: [], entries: [], packages: [], snapshots: [], videos: [], total: 0 });
      }
      return err(503, "schema_missing", "AdSpot ops tables missing — run adspot-migrate / SQL migration.");
    }
    // Soft owner / owner-without-profile: never surface raw unauthorized on admin reads.
    if (
      method === "GET" &&
      path.startsWith("/admin/") &&
      (ex.status === 401 || isOwnerSoftSession() || /Unauthorized|Profile not found/i.test(ex.message || ""))
    ) {
      const email = await resolveAuthEmail().catch(() => "");
      if (isOwnerSoftSession() || isOwnerEmail(email)) return adminEmptyPayload();
    }
    const status = ex.status ?? 500;
    return err(status, status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal_error", ex.message);
  }
}

export async function isSupabaseBackend(): Promise<boolean> {
  return !!supabase && !!(await getSessionToken() || supabase);
}
