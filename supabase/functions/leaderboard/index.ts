import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

// Weeks run Monday→Monday in WAT (UTC+1); no drift with server/DB timezone.
const TZ_OFFSET_MIN = 60;
const TZ = "+01:00";

function weekStartLabel(d: Date): string {
  const z = new Date(d.getTime() + TZ_OFFSET_MIN * 60000);
  const day = z.getUTCDay(); // 0=Sun … 6=Sat
  const toMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(z.getTime());
  monday.setUTCDate(z.getUTCDate() + toMonday);
  return monday.toISOString().slice(0, 10);
}
function weekStartNAgo(d: Date, n: number): string {
  return weekStartLabel(new Date(d.getTime() - n * 7 * 86400000));
}
function bounds(weekStart: string): { startTs: string; endTs: string } {
  const end = new Date(`${weekStart}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 7);
  return {
    startTs: `${weekStart}T00:00:00${TZ}`,
    endTs: `${end.toISOString().slice(0, 10)}T00:00:00${TZ}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, "unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anon = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await anon.auth.getUser();
    const currentUserId = userData.user?.id ?? null;

    const reqUrl = new URL(req.url);

    // ── History: GET ?weeks=N ────────────────────────────────────────────────
    const weeksParam = reqUrl.searchParams.get("weeks");
    if (req.method === "GET" && weeksParam) {
      const weeks = Math.min(Math.max(parseInt(weeksParam, 10) || 0, 1), 12);
      const labels = Array.from({ length: weeks }, (_, i) => weekStartNAgo(new Date(), i + 1));
      const { data: snaps, error } = await admin
        .from("adspot_leaderboard_snapshots")
        .select("week_start, entries")
        .in("week_start", labels);
      if (error) return errorResponse(error.message, 500, "internal_error");
      const byWeek = new Map((snaps ?? []).map((s) => [s.week_start, s.entries]));
      const result = labels.map((w) => ({
        weekStart: w,
        entries: ((byWeek.get(w) as unknown[]) ?? []).map((e) => ({
          ...(e as Record<string, unknown>),
          isCurrentUser: (e as { userId?: string }).userId === currentUserId,
        })),
      }));
      return jsonResponse({ weeks: result });
    }

    // ── Finalize: POST (admin/super_admin only) ──────────────────────────────
    if (req.method === "POST") {
      if (!currentUserId) return errorResponse("Unauthorized", 401, "unauthorized");
      const { data: prof } = await admin
        .from("adspot_profiles").select("role").eq("id", currentUserId).single();
      if (!prof || (prof.role !== "admin" && prof.role !== "super_admin")) {
        return errorResponse("Admin required", 403, "forbidden");
      }
      const body = await req.json().catch(() => ({}));
      const weekStart =
        typeof body?.weekStart === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)
          ? body.weekStart
          : weekStartNAgo(new Date(), 1);
      const { data, error } = await admin.rpc("adspot_leaderboard_finalize", { p_week_start: weekStart });
      if (error) return errorResponse(error.message, 500, "internal_error");
      return jsonResponse({ weekStart, finalized: data });
    }

    // ── Live board: GET ──────────────────────────────────────────────────────
    const weekStart = weekStartLabel(new Date());
    const { startTs, endTs } = bounds(weekStart);

    const { data: rows, error: e1 } = await admin.rpc("adspot_leaderboard_week", {
      p_start: startTs, p_end: endTs, p_limit: 10,
    });
    if (e1) return errorResponse(e1.message, 500, "internal_error");

    const entries = ((rows ?? []) as Array<{ user_id: string; username: string; points_total: number; rank: number }>)
      .map((r) => ({
        rank: Number(r.rank),
        userId: r.user_id,
        username: r.username,
        points: Number(r.points_total),
        isCurrentUser: r.user_id === currentUserId,
      }));

    let currentUserRank: number | null = null;
    let currentUserPoints: number | null = null;
    if (currentUserId) {
      const { data: me } = await admin.rpc("adspot_leaderboard_user_rank", {
        p_user: currentUserId, p_start: startTs, p_end: endTs,
      });
      const row = Array.isArray(me) ? me[0] : me;
      if (row) {
        currentUserRank = Number(row.rank);
        currentUserPoints = Number(row.points_total);
      }
    }

    // Refresh (not accumulate) the current-week snapshot; delete-then-write.
    await admin.rpc("adspot_leaderboard_finalize", { p_week_start: weekStart });

    return jsonResponse({ weekStart, entries, currentUserRank, currentUserPoints });
  } catch (e) {
    return errorResponse((e as Error).message, 500, "internal_error");
  }
});
