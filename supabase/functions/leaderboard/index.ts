import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());

    const { data: ledger } = await admin
      .from("points_ledger")
      .select("user_id, amount")
      .gte("created_at", weekStart.toISOString())
      .gt("amount", 0);

    const totals = new Map<string, number>();
    for (const row of ledger ?? []) {
      totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.amount);
    }

    const ranked = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const userIds = ranked.map(([id]) => id);
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, username, email").in("id", userIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const entries = ranked.map(([userId, points], i) => ({
      rank: i + 1,
      userId,
      username: profileMap.get(userId)?.username ?? "Reviewer",
      points,
    }));

    // Snapshot write (async-safe)
    await admin.from("leaderboard_snapshots").insert({
      week_start: weekStart.toISOString().slice(0, 10),
      entries,
    });

    return jsonResponse({ weekStart: weekStart.toISOString(), entries });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
