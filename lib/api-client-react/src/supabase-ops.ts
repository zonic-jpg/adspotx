/**
 * Remaining Supabase API handlers: brand/admin writes, rewards, analytics, profile, storage, health.
 */
import { supabase } from "./supabase-client";
import { invokeEdge } from "./supabase-auth";
import {
  ADSPOT_ADS,
  ADSPOT_QUESTIONS,
  ADSPOT_BRANDS,
  ADSPOT_REVIEW_SESSIONS,
  ADSPOT_REVIEWER_PROFILES,
  ADSPOT_PROFILES,
  ADSPOT_EVENTS_LOG,
  ADSPOT_AD_REWARDS,
  ADSPOT_REWARD_CLAIMS,
  ADSPOT_STORAGE_BUCKET,
} from "./adspot-tables";

export type RouteResult = { status: number; body: unknown };

function brandOwnerId(row: { adspot_brands?: unknown }): string {
  const brands = row.adspot_brands;
  if (Array.isArray(brands)) return String((brands[0] as { user_id?: string })?.user_id ?? "");
  return String((brands as { user_id?: string } | null)?.user_id ?? "");
}

function err(status: number, error: string, message?: string): RouteResult {
  return { status, body: { error, message } };
}

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const code = (error as { code?: string })?.code ?? "";
  return code === "PGRST205" || /Could not find the table|schema cache|does not exist/i.test(msg);
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
    multiplierFactor: a.multiplier_factor != null ? String(a.multiplier_factor) : undefined,
    proverbQuestion: a.proverb_question,
    proverbAnswer: a.proverb_answer,
    proverbBonusPoints: a.proverb_bonus_points,
    questionCount: Array.isArray(a.adspot_questions) ? a.adspot_questions.length : 0,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

function adPatchFromBody(body: Record<string, unknown>) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.status !== undefined) patch.status = body.status;
  if (body.minWatchSeconds !== undefined) patch.min_watch_seconds = body.minWatchSeconds;
  if (body.pointReward !== undefined) patch.point_reward = body.pointReward;
  if (body.multiplierFactor !== undefined) patch.multiplier_factor = body.multiplierFactor;
  if (body.assetUrl !== undefined) patch.asset_url = body.assetUrl;
  if (body.assetType !== undefined) patch.asset_type = body.assetType;
  if (body.proverbQuestion !== undefined) patch.proverb_question = body.proverbQuestion;
  if (body.proverbAnswer !== undefined) patch.proverb_answer = body.proverbAnswer;
  if (body.proverbBonusPoints !== undefined) patch.proverb_bonus_points = body.proverbBonusPoints;
  return patch;
}

export async function brandUpdateAd(adId: string, userId: string, role: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { data, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("*, adspot_brands!inner(user_id), adspot_questions(*)")
    .eq("id", adId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found", "Ad not found");
  const ownerId = brandOwnerId(data as { adspot_brands?: unknown });
  if (role === "brand" && ownerId !== userId) return err(403, "forbidden");

  const { data: updated, error: upErr } = await supabase!
    .from(ADSPOT_ADS)
    .update(adPatchFromBody(body))
    .eq("id", adId)
    .select("*, adspot_questions(*)")
    .single();
  if (upErr) throw upErr;
  return { status: 200, body: { ...mapBrandAd(updated as Record<string, unknown>), questions: (updated as { adspot_questions?: unknown[] }).adspot_questions ?? [] } };
}

export async function brandDeleteAd(adId: string, userId: string, role: string): Promise<RouteResult> {
  const { data, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("*, adspot_brands!inner(user_id)")
    .eq("id", adId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found", "Ad not found");
  const ownerId = brandOwnerId(data as { adspot_brands?: unknown });
  if (role === "brand" && ownerId !== userId) return err(403, "forbidden");

  const { count } = await supabase!
    .from(ADSPOT_REVIEW_SESSIONS)
    .select("id", { count: "exact", head: true })
    .eq("ad_id", adId);
  const sessions = count ?? 0;

  if (sessions > 0) {
    await supabase!.from(ADSPOT_ADS).update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", adId);
    return {
      status: 200,
      body: {
        deleted: false,
        archived: true,
        message: "Campaign archived — it has review history and cannot be permanently deleted.",
      },
    };
  }

  await supabase!.from(ADSPOT_QUESTIONS).delete().eq("ad_id", adId);
  await supabase!.from(ADSPOT_ADS).delete().eq("id", adId);
  return { status: 200, body: { deleted: true, archived: false, message: "Campaign deleted." } };
}

export async function brandAddQuestion(adId: string, userId: string, role: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { data: ad, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("id, adspot_brands!inner(user_id)")
    .eq("id", adId)
    .maybeSingle();
  if (error) throw error;
  if (!ad) return err(404, "not_found", "Ad not found");
  const ownerId = brandOwnerId(ad as { adspot_brands?: unknown });
  if (role === "brand" && ownerId !== userId) return err(403, "forbidden");

  const { data: q, error: qErr } = await supabase!
    .from(ADSPOT_QUESTIONS)
    .insert({
      ad_id: adId,
      sort_order: body.sortOrder ?? 0,
      question_type: body.questionType,
      question_text: body.questionText,
      options: body.options ?? null,
    })
    .select()
    .single();
  if (qErr) throw qErr;
  return {
    status: 201,
    body: {
      id: q.id,
      adId: q.ad_id,
      sortOrder: q.sort_order,
      questionType: q.question_type,
      questionText: q.question_text,
      options: q.options,
    },
  };
}

export async function adminGetAdQuestions(adId: string): Promise<RouteResult> {
  const { data, error } = await supabase!
    .from(ADSPOT_QUESTIONS)
    .select("*")
    .eq("ad_id", adId)
    .order("sort_order");
  if (error) throw error;
  const questions = (data ?? []).map((q) => ({
    id: q.id,
    adId: q.ad_id,
    sortOrder: q.sort_order,
    questionType: q.question_type,
    questionText: q.question_text,
    options: q.options,
  }));
  return { status: 200, body: { questions, total: questions.length } };
}

export async function adminPatchAdStatus(adId: string, status: string): Promise<RouteResult> {
  if (!["draft", "active", "paused", "archived"].includes(status)) {
    return err(400, "bad_request", "Invalid status");
  }
  const { data, error } = await supabase!
    .from(ADSPOT_ADS)
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", adId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found");
  return { status: 200, body: data };
}

export async function adminUpdateAd(adId: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { data, error } = await supabase!
    .from(ADSPOT_ADS)
    .update(adPatchFromBody(body))
    .eq("id", adId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found");
  return { status: 200, body: data };
}

export async function adminDeleteAd(adId: string): Promise<RouteResult> {
  const { data: existing } = await supabase!.from(ADSPOT_ADS).select("id, title").eq("id", adId).maybeSingle();
  if (!existing) return err(404, "not_found");
  await supabase!.from(ADSPOT_QUESTIONS).delete().eq("ad_id", adId);
  const { error } = await supabase!.from(ADSPOT_ADS).delete().eq("id", adId);
  if (error) throw error;
  return { status: 200, body: { success: true, deleted: adId } };
}

export async function adminAddQuestion(adId: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { data: ad } = await supabase!.from(ADSPOT_ADS).select("id").eq("id", adId).maybeSingle();
  if (!ad) return err(404, "not_found", "Ad not found");
  const { data, error } = await supabase!
    .from(ADSPOT_QUESTIONS)
    .insert({
      ad_id: adId,
      sort_order: body.sortOrder ?? 0,
      question_type: body.questionType,
      question_text: body.questionText,
      options: body.options ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return { status: 201, body: data };
}

export async function adminPatchQuestion(questionId: string, body: Record<string, unknown>): Promise<RouteResult> {
  const patch: Record<string, unknown> = {};
  if (body.questionText !== undefined) patch.question_text = body.questionText;
  if (body.questionType !== undefined) patch.question_type = body.questionType;
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
  if (body.options !== undefined) patch.options = body.options;
  const { data, error } = await supabase!
    .from(ADSPOT_QUESTIONS)
    .update(patch)
    .eq("id", questionId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found");
  return { status: 200, body: data };
}

export async function adminDeleteQuestion(questionId: string): Promise<RouteResult> {
  const { error } = await supabase!.from(ADSPOT_QUESTIONS).delete().eq("id", questionId);
  if (error) throw error;
  return { status: 200, body: { success: true } };
}

export async function adminPatchBrand(brandId: string, body: Record<string, unknown>): Promise<RouteResult> {
  const patch: Record<string, unknown> = {};
  if (body.companyName !== undefined) patch.company_name = body.companyName;
  if (body.website !== undefined) patch.website = body.website;
  if (body.logoUrl !== undefined) patch.logo_url = body.logoUrl;
  const { data, error } = await supabase!
    .from(ADSPOT_BRANDS)
    .update(patch)
    .eq("id", brandId)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (!data) return err(404, "not_found");
  return { status: 200, body: data };
}

export async function adminHealth(): Promise<RouteResult> {
  const started = Date.now();
  let dbStatus: "ok" | "warning" | "error" = "ok";
  let dbMessage = "Supabase reachable";
  try {
    const { error } = await supabase!.from(ADSPOT_PROFILES).select("id", { count: "exact", head: true });
    if (error) {
      dbStatus = isMissingRelation(error) ? "warning" : "error";
      dbMessage = error.message;
    }
  } catch (e) {
    dbStatus = "error";
    dbMessage = (e as Error).message;
  }
  const latencyMs = Date.now() - started;
  const checks = [
    {
      id: "supabase",
      name: "Supabase",
      category: "database",
      status: dbStatus,
      message: dbMessage,
      latencyMs,
      fallbacks: [],
      fixOptions: [],
    },
    {
      id: "auth",
      name: "Auth",
      category: "security",
      status: "ok" as const,
      message: "Supabase Auth session backend",
      fallbacks: [],
      fixOptions: [],
    },
    {
      id: "storage",
      name: "Storage",
      category: "storage",
      status: "ok" as const,
      message: `Bucket ${ADSPOT_STORAGE_BUCKET} (upload via client)`,
      fallbacks: [],
      fixOptions: [],
    },
    {
      id: "runtime",
      name: "Client runtime",
      category: "runtime",
      status: "ok" as const,
      message: "Browser Supabase router active",
      fallbacks: [],
      fixOptions: [],
    },
  ];
  const errorCount = checks.filter((c) => c.status === "error").length;
  const warnCount = checks.filter((c) => c.status === "warning").length;
  const status = errorCount > 0 ? "critical" : warnCount > 0 ? "degraded" : "healthy";
  return {
    status: 200,
    body: {
      status,
      summary:
        errorCount > 0
          ? `${errorCount} critical issue(s)`
          : warnCount > 0
            ? `${warnCount} warning(s) — operational`
            : "All systems operational",
      checks,
      checkedAt: new Date().toISOString(),
      uptime: 0,
    },
  };
}

export async function adminEventsExport(params: URLSearchParams): Promise<RouteResult> {
  const limit = Math.min(Number(params.get("limit") ?? 5000), 10000);
  let q = supabase!.from(ADSPOT_EVENTS_LOG).select("*").order("created_at", { ascending: false }).limit(limit);
  const eventType = params.get("eventType");
  const from = params.get("from");
  const to = params.get("to");
  if (eventType) q = q.eq("event_type", eventType);
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  const { data, error } = await q;
  if (error) throw error;
  const rows = data ?? [];
  const header = "id,event_type,actor_id,created_at,payload\n";
  const csv =
    header +
    rows
      .map((r) => {
        const payload = JSON.stringify(r.payload ?? {}).replace(/"/g, '""');
        return `${r.id},${r.event_type},${r.actor_id ?? ""},${r.created_at},"${payload}"`;
      })
      .join("\n");
  return { status: 200, body: { csv, filename: "events-export.csv" } };
}

function mapReviewerProfile(row: Record<string, unknown> | null, userId: string) {
  const required = ["gender", "age_band", "state"] as const;
  const missing = required
    .filter((f) => !row?.[f])
    .map((f) => (f === "age_band" ? "ageBand" : f));
  const filled = required.length - missing.length;
  const completenessPct = Math.round((filled / required.length) * 100);
  return {
    userId,
    gender: row?.gender ?? null,
    ageBand: row?.age_band ?? null,
    state: row?.state ?? null,
    city: row?.city ?? null,
    employmentStatus: row?.employment_status ?? null,
    educationLevel: row?.education_level ?? null,
    incomeBand: row?.income_band ?? null,
    occupationSector: row?.occupation_sector ?? null,
    deviceType: row?.device_type ?? null,
    maritalStatus: row?.marital_status ?? null,
    interests: row?.interests ?? [],
    displayName: row?.display_name ?? null,
    completenessPct,
    missingFields: missing,
    profileComplete: missing.length === 0,
  };
}

export async function authProfileGet(userId: string): Promise<RouteResult> {
  const { data, error } = await supabase!
    .from(ADSPOT_REVIEWER_PROFILES)
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && !isMissingRelation(error)) throw error;
  return { status: 200, body: mapReviewerProfile((data as Record<string, unknown>) ?? null, userId) };
}

export async function authProfilePatch(userId: string, body: Record<string, unknown>): Promise<RouteResult> {
  const patch: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (body.gender != null) patch.gender = body.gender;
  if (body.ageBand != null || body.age_band != null) patch.age_band = body.ageBand ?? body.age_band;
  if (body.state != null) patch.state = body.state;
  if (body.city != null) patch.city = body.city;
  if (body.employmentStatus != null || body.employment_status != null) {
    patch.employment_status = body.employmentStatus ?? body.employment_status;
  }
  if (body.educationLevel != null || body.education_level != null) {
    patch.education_level = body.educationLevel ?? body.education_level;
  }
  if (body.incomeBand != null || body.income_band != null) patch.income_band = body.incomeBand ?? body.income_band;
  if (body.occupationSector != null || body.occupation_sector != null) {
    patch.occupation_sector = body.occupationSector ?? body.occupation_sector;
  }
  if (body.deviceType != null || body.device_type != null) patch.device_type = body.deviceType ?? body.device_type;
  if (body.maritalStatus != null || body.marital_status != null) {
    patch.marital_status = body.maritalStatus ?? body.marital_status;
  }
  if (body.displayName != null || body.display_name != null) {
    patch.display_name = String(body.displayName ?? body.display_name ?? "").trim() || null;
  }
  if (Array.isArray(body.interests)) patch.interests = body.interests.slice(0, 12).map(String);

  const { data, error } = await supabase!
    .from(ADSPOT_REVIEWER_PROFILES)
    .upsert(patch, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return { status: 200, body: mapReviewerProfile((data as Record<string, unknown>) ?? null, userId) };
}

async function brandIdForUser(userId: string): Promise<string | null> {
  const { data } = await supabase!.from(ADSPOT_BRANDS).select("id").eq("user_id", userId).maybeSingle();
  return data?.id ?? null;
}

export async function brandAnalytics(userId: string, params: URLSearchParams): Promise<RouteResult> {
  const brandId = await brandIdForUser(userId);
  if (!brandId) return err(404, "not_found", "Brand profile not found");

  const { data: ads, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("id, title, status, point_reward")
    .eq("brand_id", brandId);
  if (error) throw error;
  if (!ads?.length) return { status: 200, body: { hasCampaigns: false } };

  const adIdFilter = params.get("adId");
  const filtered = adIdFilter ? ads.filter((a) => a.id === adIdFilter) : ads;
  if (!filtered.length) return { status: 200, body: { hasCampaigns: false } };
  const adIds = filtered.map((a) => a.id);

  const { data: sessions } = await supabase!
    .from(ADSPOT_REVIEW_SESSIONS)
    .select("id, user_id, ad_id, status, watch_seconds, points_awarded, completed_at, comment")
    .in("ad_id", adIds);

  const allSessions = sessions ?? [];
  const completed = allSessions.filter((s) => s.status === "completed");
  const userIds = [...new Set(completed.map((s) => s.user_id))];
  const { data: profiles } = userIds.length
    ? await supabase!.from(ADSPOT_REVIEWER_PROFILES).select("*").in("user_id", userIds)
    : { data: [] as Record<string, unknown>[] };
  const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));

  const genderFilter = params.get("gender");
  const ageBandFilter = params.get("ageBand");
  const stateFilter = (params.get("state") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const demoOk = (uid: string) => {
    const rp = profileByUser.get(uid) as Record<string, unknown> | undefined;
    if (genderFilter && rp?.gender !== genderFilter) return false;
    if (ageBandFilter && rp?.age_band !== ageBandFilter) return false;
    if (stateFilter.length && !stateFilter.includes(String(rp?.state ?? ""))) return false;
    return true;
  };

  const filteredSessions = completed.filter((s) => demoOk(s.user_id));
  const totalViews = allSessions.length;
  const totalCompletions = filteredSessions.length;
  const avgWatch =
    totalCompletions > 0
      ? Math.round(filteredSessions.reduce((s, r) => s + (r.watch_seconds ?? 0), 0) / totalCompletions)
      : 0;
  const totalPoints = filteredSessions.reduce((s, r) => s + (r.points_awarded ?? 0), 0);

  const bucket = (keyFn: (uid: string) => string | null) => {
    const map = new Map<string, number>();
    for (const s of filteredSessions) {
      const k = keyFn(s.user_id);
      if (!k) continue;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
    return [...map.entries()].map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / total) * 100),
    }));
  };

  const dayMap = new Map<string, number>();
  for (const s of filteredSessions) {
    if (!s.completed_at) continue;
    const day = String(s.completed_at).slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const trend = [...dayMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, completions]) => ({ date, completions }));

  const adsPerformance = filtered.map((a) => {
    const forAd = allSessions.filter((s) => s.ad_id === a.id);
    const done = forAd.filter((s) => s.status === "completed").length;
    return { id: a.id, title: a.title, status: a.status, total: forAd.length, completed: done };
  });

  return {
    status: 200,
    body: {
      hasCampaigns: true,
      overview: {
        totalViews,
        totalCompletions,
        completionRate: totalViews > 0 ? totalCompletions / totalViews : 0,
        avgWatchSeconds: avgWatch,
        totalPoints,
      },
      demographics: {
        gender: bucket((uid) => (profileByUser.get(uid) as { gender?: string } | undefined)?.gender ?? null),
        ageBand: bucket((uid) => (profileByUser.get(uid) as { age_band?: string } | undefined)?.age_band ?? null),
        state: bucket((uid) => (profileByUser.get(uid) as { state?: string } | undefined)?.state ?? null),
        employmentStatus: bucket(
          (uid) => (profileByUser.get(uid) as { employment_status?: string } | undefined)?.employment_status ?? null,
        ),
        totalProfiled: userIds.filter((u) => profileByUser.has(u)).length,
      },
      surveyInsights: [],
      adsPerformance,
      allAds: ads.map((a) => ({ id: a.id, title: a.title, status: a.status })),
      trend,
      dailyTrend: trend,
    },
  };
}

export async function brandAnalyticsComments(userId: string, params: URLSearchParams): Promise<RouteResult> {
  const brandId = await brandIdForUser(userId);
  if (!brandId) return err(404, "not_found", "Brand profile not found");
  const { data: ads } = await supabase!.from(ADSPOT_ADS).select("id, title").eq("brand_id", brandId);
  if (!ads?.length) return { status: 200, body: { comments: [], total: 0 } };
  const adIdFilter = params.get("adId");
  const adIds = adIdFilter ? [adIdFilter] : ads.map((a) => a.id);
  const titleById = new Map(ads.map((a) => [a.id, a.title]));

  const { data: sessions, error } = await supabase!
    .from(ADSPOT_REVIEW_SESSIONS)
    .select("id, user_id, ad_id, comment, completed_at, status")
    .in("ad_id", adIds)
    .eq("status", "completed")
    .not("comment", "is", null)
    .order("completed_at", { ascending: false })
    .limit(200);
  if (error) {
    if (isMissingRelation(error) || /column.*comment/i.test(error.message)) {
      return { status: 200, body: { comments: [], total: 0 } };
    }
    throw error;
  }

  const userIds = [...new Set((sessions ?? []).map((s) => s.user_id))];
  const [{ data: profiles }, { data: users }] = await Promise.all([
    userIds.length
      ? supabase!.from(ADSPOT_REVIEWER_PROFILES).select("*").in("user_id", userIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    userIds.length
      ? supabase!.from(ADSPOT_PROFILES).select("id, username").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; username: string }[] }),
  ]);
  const profileByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p]));
  const nameById = new Map((users ?? []).map((u) => [u.id, u.username]));

  const genderFilter = params.get("gender");
  const ageBandFilter = params.get("ageBand");
  const stateFilter = (params.get("state") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const comments = (sessions ?? [])
    .filter((s) => s.comment)
    .filter((s) => {
      const rp = profileByUser.get(s.user_id) as Record<string, unknown> | undefined;
      if (genderFilter && rp?.gender !== genderFilter) return false;
      if (ageBandFilter && rp?.age_band !== ageBandFilter) return false;
      if (stateFilter.length && !stateFilter.includes(String(rp?.state ?? ""))) return false;
      return true;
    })
    .map((s) => {
      const rp = profileByUser.get(s.user_id) as Record<string, unknown> | undefined;
      return {
        id: s.id,
        comment: s.comment,
        completedAt: s.completed_at,
        adTitle: titleById.get(s.ad_id) ?? "",
        reviewer: {
          username: nameById.get(s.user_id) ?? "Reviewer",
          gender: rp?.gender ?? null,
          ageBand: typeof rp?.age_band === "string" ? String(rp.age_band).replace(/_/g, "-").replace("plus", "+") : null,
          state: rp?.state ?? null,
        },
      };
    });

  return { status: 200, body: { comments, total: comments.length } };
}

export async function brandAnalyticsDeep(userId: string, params: URLSearchParams): Promise<RouteResult> {
  const base = await brandAnalytics(userId, params);
  if (base.status !== 200) return base;
  const body = base.body as {
    hasCampaigns?: boolean;
    overview?: { totalCompletions: number; avgWatchSeconds: number };
    demographics?: Record<string, Array<{ label: string; count: number }>>;
    trend?: Array<{ date: string; completions: number }>;
  };
  if (!body.hasCampaigns) {
    return {
      status: 200,
      body: {
        totals: { completions: 0, uniqueReviewers: 0, avgWatch: 0, avgWatchPct: 0 },
        breakdowns: {},
        timeseries: [],
      },
    };
  }
  const toBuckets = (rows?: Array<{ label: string; count: number }>) =>
    (rows ?? []).map((r) => ({
      key: r.label,
      completions: r.count,
      avgWatch: body.overview?.avgWatchSeconds ?? 0,
      avgWatchPct: 0,
    }));
  return {
    status: 200,
    body: {
      totals: {
        completions: body.overview?.totalCompletions ?? 0,
        uniqueReviewers: 0,
        avgWatch: body.overview?.avgWatchSeconds ?? 0,
        avgWatchPct: 0,
      },
      breakdowns: {
        gender: toBuckets(body.demographics?.gender),
        ageBand: toBuckets(body.demographics?.ageBand),
        state: toBuckets(body.demographics?.state),
        city: [],
        incomeBand: [],
        deviceType: [],
        educationLevel: [],
        employmentStatus: toBuckets(body.demographics?.employmentStatus),
        maritalStatus: [],
      },
      timeseries: (body.trend ?? []).map((t) => ({ day: t.date, completions: t.completions })),
    },
  };
}

export async function brandAnalyticsFilters(userId: string): Promise<RouteResult> {
  const brandId = await brandIdForUser(userId);
  if (!brandId) return err(404, "not_found", "No brand");
  const { data: ads } = await supabase!
    .from(ADSPOT_ADS)
    .select("id, title")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  const adIds = (ads ?? []).map((a) => a.id);
  let states: string[] = [];
  if (adIds.length) {
    const { data: sessions } = await supabase!
      .from(ADSPOT_REVIEW_SESSIONS)
      .select("user_id")
      .in("ad_id", adIds)
      .eq("status", "completed");
    const uids = [...new Set((sessions ?? []).map((s) => s.user_id))];
    if (uids.length) {
      const { data: profiles } = await supabase!
        .from(ADSPOT_REVIEWER_PROFILES)
        .select("state")
        .in("user_id", uids);
      states = [...new Set((profiles ?? []).map((p) => p.state).filter(Boolean))] as string[];
    }
  }
  return {
    status: 200,
    body: {
      ads: (ads ?? []).map((a) => ({ id: a.id, title: a.title })),
      state: states.sort(),
      city: [],
    },
  };
}

export async function aiSummary(body: Record<string, unknown>): Promise<RouteResult> {
  try {
    const result = await invokeEdge<{ summary?: string; content?: string }>("ai-summary", body);
    const summary = result?.summary ?? result?.content ?? JSON.stringify(result);
    return { status: 200, body: { summary } };
  } catch {
    const adId = body.adId ? ` for campaign ${body.adId}` : "";
    return {
      status: 200,
      body: {
        summary:
          `Campaign portfolio summary${adId}.\n\n` +
          "Completions and demographics are available in the analytics dashboard. " +
          "AI narrative generation requires the ai-summary edge function to be deployed with a configured model key.",
      },
    };
  }
}

export async function adsRewardGet(adId: string, userId: string): Promise<RouteResult> {
  try {
    const { data: reward, error } = await supabase!
      .from(ADSPOT_AD_REWARDS)
      .select("*")
      .eq("ad_id", adId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (error) {
      if (isMissingRelation(error)) return { status: 200, body: { reward: null } };
      throw error;
    }
    if (!reward) return { status: 200, body: { reward: null } };

    const { data: existing } = await supabase!
      .from(ADSPOT_REWARD_CLAIMS)
      .select("*")
      .eq("reward_id", reward.id)
      .eq("user_id", userId)
      .maybeSingle();

    const spotsLeft =
      reward.type === "wildcard" && reward.max_claims != null
        ? Math.max(0, reward.max_claims - (reward.claims_count ?? 0))
        : null;
    const available = !existing && (reward.type === "general" || (spotsLeft !== null && spotsLeft > 0));

    return {
      status: 200,
      body: {
        reward: {
          id: reward.id,
          type: reward.type,
          title: reward.title,
          description: reward.description,
          rewardValueText: reward.reward_value_text,
          discountCode: existing ? reward.discount_code : null,
          spotsLeft,
          alreadyClaimed: !!existing,
          claimedCode: existing?.redemption_code ?? null,
          available,
        },
      },
    };
  } catch (e) {
    if (isMissingRelation(e)) return { status: 200, body: { reward: null } };
    throw e;
  }
}

export async function meRewards(userId: string): Promise<RouteResult> {
  try {
    const { data, error } = await supabase!
      .from(ADSPOT_REWARD_CLAIMS)
      .select("*, adspot_ad_rewards(*)")
      .eq("user_id", userId)
      .order("claimed_at", { ascending: false });
    if (error) {
      if (isMissingRelation(error)) return { status: 200, body: { claims: [] } };
      throw error;
    }
    const claims = (data ?? []).map((c) => {
      const r = c.adspot_ad_rewards as Record<string, unknown> | null;
      return {
        id: c.id,
        redemptionCode: c.redemption_code,
        claimedAt: c.claimed_at,
        rewardTitle: r?.title ?? "",
        rewardValueText: r?.reward_value_text ?? "",
        discountCode: r?.discount_code ?? null,
        rewardType: r?.type ?? "general",
        adId: r?.ad_id ?? "",
      };
    });
    return { status: 200, body: { claims } };
  } catch (e) {
    if (isMissingRelation(e)) return { status: 200, body: { claims: [] } };
    throw e;
  }
}

export async function brandCreateReward(adId: string, userId: string, role: string, body: Record<string, unknown>): Promise<RouteResult> {
  const { data: ad, error } = await supabase!
    .from(ADSPOT_ADS)
    .select("id, adspot_brands!inner(user_id)")
    .eq("id", adId)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return err(503, "schema_missing", "adspot_ad_rewards missing — run partners/rewards migration");
    throw error;
  }
  if (!ad) return err(404, "not_found", "Ad not found");
  const ownerId = brandOwnerId(ad as { adspot_brands?: unknown });
  if (role === "brand" && ownerId !== userId) return err(403, "forbidden");

  const { data: reward, error: rErr } = await supabase!
    .from(ADSPOT_AD_REWARDS)
    .insert({
      ad_id: adId,
      type: body.type ?? "general",
      title: body.title,
      description: body.description,
      reward_value_text: body.rewardValueText ?? body.reward_value_text,
      discount_code: body.discountCode ?? null,
      max_claims: body.type === "wildcard" ? (body.maxClaims ?? 1) : null,
    })
    .select()
    .single();
  if (rErr) {
    if (isMissingRelation(rErr)) return err(503, "schema_missing", "adspot_ad_rewards missing — run partners/rewards migration");
    throw rErr;
  }
  return { status: 201, body: { reward } };
}

export async function brandListRewards(adId: string): Promise<RouteResult> {
  try {
    const { data, error } = await supabase!.from(ADSPOT_AD_REWARDS).select("*").eq("ad_id", adId);
    if (error) {
      if (isMissingRelation(error)) return { status: 200, body: { rewards: [] } };
      throw error;
    }
    return { status: 200, body: { rewards: data ?? [] } };
  } catch (e) {
    if (isMissingRelation(e)) return { status: 200, body: { rewards: [] } };
    throw e;
  }
}

export async function claimRewardDirect(rewardId: string, userId: string): Promise<RouteResult> {
  try {
    const result = await invokeEdge("claim-reward", { rewardId });
    return { status: 200, body: result };
  } catch {
    /* fall through to direct table write */
  }

  const { data: reward, error } = await supabase!
    .from(ADSPOT_AD_REWARDS)
    .select("*")
    .eq("id", rewardId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    if (isMissingRelation(error)) return err(503, "schema_missing", "Rewards tables missing");
    throw error;
  }
  if (!reward) return err(404, "not_found", "Reward not found");

  const { data: existing } = await supabase!
    .from(ADSPOT_REWARD_CLAIMS)
    .select("*")
    .eq("reward_id", rewardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) {
    return err(409, "already_claimed", "You have already claimed this reward");
  }

  if (reward.type === "wildcard" && reward.max_claims != null && reward.claims_count >= reward.max_claims) {
    return err(410, "no_slots", "All wildcard slots have been claimed");
  }

  const redemptionCode = `ADS-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const { data: claim, error: cErr } = await supabase!
    .from(ADSPOT_REWARD_CLAIMS)
    .insert({ reward_id: rewardId, user_id: userId, redemption_code: redemptionCode })
    .select()
    .single();
  if (cErr) throw cErr;

  await supabase!
    .from(ADSPOT_AD_REWARDS)
    .update({ claims_count: (reward.claims_count ?? 0) + 1 })
    .eq("id", rewardId);

  return {
    status: 201,
    body: {
      claim: {
        id: claim.id,
        redemptionCode: claim.redemption_code,
        rewardTitle: reward.title,
        rewardValueText: reward.reward_value_text,
        discountCode: reward.discount_code,
        rewardType: reward.type,
        adId: reward.ad_id,
        claimedAt: claim.claimed_at,
      },
    },
  };
}

export async function storageUpload(init?: RequestInit): Promise<RouteResult> {
  let file: File | Blob | null = null;
  let fileName = `upload-${Date.now()}`;

  if (typeof FormData !== "undefined" && init?.body && typeof init.body === "object" && init.body instanceof FormData) {
    const f = init.body.get("file");
    if (typeof File !== "undefined" && f instanceof File) {
      file = f;
      fileName = f.name || fileName;
    } else if (f && typeof Blob !== "undefined" && f instanceof Blob) {
      file = f;
    }
  } else if (typeof init?.body === "string") {
    try {
      const parsed = JSON.parse(init.body) as { filename?: string; contentType?: string; dataUrl?: string; base64?: string };
      fileName = parsed.filename || fileName;
      const raw = parsed.dataUrl || parsed.base64;
      if (raw) {
        const b64 = raw.includes(",") ? raw.split(",")[1] : raw;
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        file = new Blob([bytes], { type: parsed.contentType || "application/octet-stream" });
      }
    } catch {
      /* ignore */
    }
  }

  if (!file) return err(400, "validation_error", "Missing file upload");

  const path = `uploads/${crypto.randomUUID()}-${fileName.replace(/[^\w.\-]+/g, "_")}`;
  const { error } = await supabase!.storage.from(ADSPOT_STORAGE_BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) {
    return err(503, "storage_error", error.message);
  }
  const { data } = supabase!.storage.from(ADSPOT_STORAGE_BUCKET).getPublicUrl(path);
  return {
    status: 200,
    body: {
      objectPath: `/objects/${path}`,
      publicUrl: data.publicUrl,
    },
  };
}
