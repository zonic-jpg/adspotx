import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await anon.auth.getUser();
    const currentUserId = userData.user?.id ?? null;

    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

    const { data: ledger } = await admin
      .from("adspot_points_ledger")
      .select("user_id, amount")
      .gte("created_at", weekStart.toISOString())
      .gt("amount", 0);

    const totals = new Map<string, number>();
    for (const row of ledger ?? []) {
      totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.amount);
    }

    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const userIds = ranked.map(([id]) => id);

    const { data: profiles } = userIds.length
      ? await admin.from("adspot_profiles").select("id, username").in("id", userIds)
      : { data: [] };
    const { data: reviewers } = userIds.length
      ? await admin.from("adspot_reviewer_profiles").select("user_id, display_name").in("user_id", userIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.username]));
    const displayMap = new Map(
      (reviewers ?? []).map((r) => [r.user_id, r.display_name || profileMap.get(r.user_id) || "Reviewer"]),
    );

    const entries = ranked.map(([userId, points], i) => ({
      rank: i + 1,
      userId,
      username: displayMap.get(userId) || profileMap.get(userId) || "Reviewer",
      points,
      isCurrentUser: userId === currentUserId,
    }));

    await admin.from("adspot_leaderboard_snapshots").insert({
      week_start: weekStart.toISOString().slice(0, 10),
      entries,
    });

    return jsonResponse({ weekStart: weekStart.toISOString(), entries });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
