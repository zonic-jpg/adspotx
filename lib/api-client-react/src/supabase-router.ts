/**
 * Routes legacy /api/* paths to Supabase direct reads/writes or Edge Functions.
 * Replaces Express + Netlify demo API when VITE_SUPABASE_* is configured.
 */
import { supabase } from "./supabase-client";
import { getSessionToken, invokeEdge, fetchProfile } from "./supabase-auth";

type RouteResult = { status: number; body: unknown };

function err(status: number, error: string, message?: string): RouteResult {
  return { status, body: { error, message } };
}

async function uid(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function requireUid(): Promise<string> {
  const id = await uid();
  if (!id) throw Object.assign(new Error("Unauthorized"), { status: 401 });
  return id;
}

async function requireRole(...roles: string[]): Promise<{ id: string; role: string }> {
  const id = await requireUid();
  const profile = await fetchProfile(id);
  if (!profile) throw Object.assign(new Error("Profile not found"), { status: 401 });
  const elevated = profile.role === "super_admin";
  if (!elevated && !roles.includes(profile.role)) {
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
    .from("ads")
    .select("*, brands(company_name)")
    .eq("status", "active")
    .limit(limit);
  if (error) throw error;
  const videos = (ads ?? []).map((a: Record<string, unknown>) => ({
    id: a.id,
    title: a.title,
    assetUrl: a.asset_url,
    assetType: a.asset_type,
    brandName: (a.brands as { company_name?: string })?.company_name ?? "",
  }));
  return { status: 200, body: { videos, total: videos.length } };
}

async function publicStats() {
  const [users, brands, sessions, ledger, activeAds] = await Promise.all([
    supabase!.from("profiles").select("id", { count: "exact", head: true }),
    supabase!.from("brands").select("id", { count: "exact", head: true }),
    supabase!.from("review_sessions").select("id", { count: "exact", head: true }).eq("status", "completed"),
    supabase!.from("points_ledger").select("amount"),
    supabase!.from("ads").select("id", { count: "exact", head: true }).eq("status", "active"),
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

async function publicPackages() {
  const { data, error } = await supabase!.from("ad_packages").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return { status: 200, body: { packages: data ?? [] } };
}

// ── Auth ────────────────────────────────────────────────────────────────────

async function authMe() {
  const id = await requireUid();
  const profile = await fetchProfile(id);
  if (!profile) return err(401, "unauthorized", "Not signed in");
  const { data: rp } = await supabase!.from("reviewer_profiles").select("*").eq("user_id", id).maybeSingle();
  return {
    status: 200,
    body: {
      id: profile.id,
      email: profile.email,
      username: profile.username,
      role: profile.role,
      createdAt: profile.created_at,
      profile: rp ?? null,
    },
  };
}

// ── Reviewer ads ────────────────────────────────────────────────────────────

async function adFeed(params: URLSearchParams) {
  await requireUid();
  const limit = Number(params.get("limit") ?? 20);
  const offset = Number(params.get("offset") ?? 0);
  const { data, error, count } = await supabase!
    .from("ads")
    .select("*, brands(company_name), questions(id)", { count: "exact" })
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
    brandName: (a.brands as { company_name?: string })?.company_name ?? "",
    questionCount: Array.isArray(a.questions) ? a.questions.length : 0,
    createdAt: a.created_at,
  }));
  return { status: 200, body: { ads, total: count ?? ads.length, offset, limit } };
}

async function adDetail(adId: string) {
  await requireUid();
  const { data: ad, error } = await supabase!
    .from("ads")
    .select("*, brands(company_name), questions(*)")
    .eq("id", adId)
    .maybeSingle();
  if (error) throw error;
  if (!ad) return err(404, "not_found", "Ad not found");
  const questions = ((ad.questions as Record<string, unknown>[]) ?? [])
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
      brandName: (ad.brands as { company_name?: string })?.company_name ?? "",
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
    .from("review_sessions")
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
  const { data, error } = await supabase!.from("points_ledger").select("amount").eq("user_id", userId);
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
    .from("points_ledger")
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
  await requireUid();
  const result = await invokeEdge("leaderboard");
  return { status: 200, body: result };
}

async function leaderboardHistory(params: URLSearchParams) {
  await requireUid();
  const weeks = Number(params.get("weeks") ?? 4);
  const { data, error } = await supabase!
    .from("leaderboard_snapshots")
    .select("*")
    .order("week_start", { ascending: false })
    .limit(weeks * 10);
  if (error) throw error;
  return { status: 200, body: { snapshots: data ?? [] } };
}

async function leaderboardEligibility() {
  const userId = await requireUid();
  const { data: rp } = await supabase!.from("reviewer_profiles").select("*").eq("user_id", userId).maybeSingle();
  const required = ["gender", "age_band", "state"];
  const missing = required.filter((f) => !rp?.[f]);
  return { status: 200, body: { eligible: missing.length === 0, missingFields: missing } };
}

// ── Brand ads ───────────────────────────────────────────────────────────────

async function brandAdsForUser(userId: string) {
  const { data: brand } = await supabase!.from("brands").select("id").eq("user_id", userId).maybeSingle();
  if (!brand) return [];
  const { data, error } = await supabase!.from("ads").select("*, questions(id)").eq("brand_id", brand.id);
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
    questionCount: Array.isArray(a.questions) ? a.questions.length : 0,
    createdAt: a.created_at,
  };
}

async function brandCreateAd(body: Record<string, unknown>) {
  const userId = await requireUid();
  await requireRole("brand", "admin", "super_admin");
  const { data: brand } = await supabase!.from("brands").select("id").eq("user_id", userId).maybeSingle();
  if (!brand) return err(404, "not_found", "Brand profile not found");
  const { data: ad, error } = await supabase!
    .from("ads")
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
    await supabase!.from("questions").insert(
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
    .from("ads")
    .select("*, brands!inner(user_id), questions(*)")
    .eq("id", adId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found", "Ad not found");
  const ownerId = (data.brands as { user_id: string }).user_id;
  const { role } = await requireRole("brand", "admin", "super_admin");
  if (role === "brand" && ownerId !== userId) return err(403, "forbidden");
  return { status: 200, body: { ...mapBrandAd(data), questions: data.questions ?? [] } };
}

async function brandAdStats(adId: string) {
  await requireUid();
  const { count } = await supabase!
    .from("review_sessions")
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
      .from("review_sessions")
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
    .from("events_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return { status: 200, body: { events: data ?? [], total: count ?? 0 } };
}

async function adminAds(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const limit = Number(params.get("limit") ?? 50);
  const { data, error } = await supabase!.from("ads").select("*, brands(company_name)").limit(limit);
  if (error) throw error;
  return { status: 200, body: { ads: data ?? [], total: data?.length ?? 0 } };
}

async function adminUsers(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const role = params.get("role");
  let q = supabase!.from("profiles").select("*");
  if (role) q = q.eq("role", role);
  const { data, error } = await q.limit(100);
  if (error) throw error;
  return { status: 200, body: { users: data ?? [], total: data?.length ?? 0 } };
}

async function adminPackages() {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from("ad_packages").select("*").order("sort_order");
  if (error) throw error;
  return { status: 200, body: { packages: data ?? [] } };
}

async function adminSettings() {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from("platform_settings").select("*");
  if (error) throw error;
  const settings = Object.fromEntries((data ?? []).map((s: { key: string; value: unknown }) => [s.key, s.value]));
  return { status: 200, body: { settings } };
}

async function adminStats() {
  await requireRole("admin", "super_admin");
  const [profiles, ads, sessions] = await Promise.all([
    supabase!.from("profiles").select("id", { count: "exact", head: true }),
    supabase!.from("ads").select("id", { count: "exact", head: true }),
    supabase!.from("review_sessions").select("id", { count: "exact", head: true }),
  ]);
  return {
    status: 200,
    body: {
      totalUsers: profiles.count ?? 0,
      totalAds: ads.count ?? 0,
      totalSessions: sessions.count ?? 0,
    },
  };
}

async function adminTeam() {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from("profiles").select("*").in("role", ["admin", "super_admin"]);
  if (error) throw error;
  return { status: 200, body: { team: data ?? [], total: data?.length ?? 0 } };
}

async function adminBrands(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from("brands").select("*, profiles(email, username)").limit(100);
  if (error) throw error;
  return { status: 200, body: { brands: data ?? [], total: data?.length ?? 0 } };
}

async function adminPoints(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const limit = Number(params.get("limit") ?? 50);
  const { data, error } = await supabase!
    .from("points_ledger")
    .select("*, profiles(email, username)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return { status: 200, body: { entries: data ?? [], total: data?.length ?? 0 } };
}

async function adminRedemptions(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!.from("redemptions").select("*, profiles(email, username)").limit(100);
  if (error) throw error;
  return { status: 200, body: { redemptions: data ?? [], total: data?.length ?? 0 } };
}

async function adminSessions(params: URLSearchParams) {
  await requireRole("admin", "super_admin");
  const { data, error } = await supabase!
    .from("review_sessions")
    .select("*, profiles(email), ads(title)")
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
    if (path === "/auth/profile" && method === "PATCH") {
      const userId = await requireUid();
      const { error } = await supabase!.from("reviewer_profiles").upsert({
        user_id: userId,
        gender: body.gender,
        age_band: body.ageBand,
        state: body.state,
        employment_status: body.employmentStatus,
      });
      if (error) throw error;
      return { status: 200, body: { ok: true } };
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
    const brandAdMatch = path.match(/^\/brands\/ads\/([^/]+)$/);
    if (brandAdMatch && method === "GET") return brandAdDetail(brandAdMatch[1]);
    const brandStatsMatch = path.match(/^\/brands\/ads\/([^/]+)\/stats$/);
    if (brandStatsMatch && method === "GET") return brandAdStats(brandStatsMatch[1]);

    // Admin reads
    if (path === "/admin/events" && method === "GET") return adminEvents(params);
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
    const rewardClaimMatch = path.match(/^\/rewards\/([^/]+)\/claim$/);
    if (rewardClaimMatch && method === "POST") {
      await requireRole("reviewer");
      return { status: 200, body: await invokeEdge("claim-reward", { rewardId: rewardClaimMatch[1] }) };
    }
    if (path === "/brands/analytics/organize-comments" && method === "POST") {
      await requireRole("brand", "admin", "super_admin");
      return { status: 200, body: await invokeEdge("organize-comments", body) };
    }
    if (path === "/brands/analytics/ai-summary" && method === "POST") {
      await requireRole("brand", "admin", "super_admin");
      return { status: 200, body: await invokeEdge("ai-summary", body) };
    }
    if (path === "/storage/uploads" && method === "POST") {
      await requireRole("brand", "admin", "super_admin");
      return { status: 200, body: await invokeEdge("storage-upload", body) };
    }

    // Admin packages/settings writes (safe with RLS — direct)
    if (path === "/admin/packages" && method === "POST") {
      await requireRole("admin", "super_admin");
      const { data, error } = await supabase!.from("ad_packages").insert(body).select().single();
      if (error) throw error;
      return { status: 201, body: data };
    }
    const pkgMatch = path.match(/^\/admin\/packages\/([^/]+)$/);
    if (pkgMatch && (method === "PATCH" || method === "DELETE")) {
      await requireRole("admin", "super_admin");
      if (method === "DELETE") {
        const { error } = await supabase!.from("ad_packages").delete().eq("id", pkgMatch[1]);
        if (error) throw error;
        return { status: 204, body: null };
      }
      const { data, error } = await supabase!.from("ad_packages").update(body).eq("id", pkgMatch[1]).select().single();
      if (error) throw error;
      return { status: 200, body: data };
    }
    if (path === "/admin/settings" && method === "PATCH") {
      await requireRole("admin", "super_admin");
      const settings = body.settings as Record<string, unknown> | undefined;
      if (settings) {
        for (const [key, value] of Object.entries(settings)) {
          await supabase!.from("platform_settings").upsert({ key, value });
        }
      }
      return adminSettings();
    }

    return err(404, "not_found", `No Supabase route for ${method} ${path}`);
  } catch (e: unknown) {
    const ex = e as Error & { status?: number };
    const status = ex.status ?? 500;
    return err(status, status === 401 ? "unauthorized" : status === 403 ? "forbidden" : "internal_error", ex.message);
  }
}

export async function isSupabaseBackend(): Promise<boolean> {
  return !!supabase && !!(await getSessionToken() || supabase);
}
