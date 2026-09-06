import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);

    const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData } = await supabaseUser.auth.getUser();
    if (!authData.user) return errorResponse("Unauthorized", 401);

    const { rewardId } = await req.json();
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: reward } = await admin.from("adspot_ad_rewards").select("*").eq("id", rewardId).eq("is_active", true).single();
    if (!reward) return errorResponse("Reward not found", 404);

    const { count } = await admin.from("adspot_reward_claims").select("id", { count: "exact", head: true }).eq("reward_id", rewardId);
    if (reward.max_claims && (count ?? 0) >= reward.max_claims) {
      return errorResponse("All reward slots claimed", 409, "conflict");
    }

    const code = `ADSPOT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: claim, error } = await admin.from("adspot_reward_claims").insert({
      user_id: authData.user.id,
      reward_id: rewardId,
      redemption_code: code,
    }).select().single();
    if (error) return errorResponse(error.message, 400);

    await admin.from("adspot_ad_rewards").update({ claims_count: (reward.claims_count ?? 0) + 1 }).eq("id", rewardId);

    return jsonResponse({ claim, redemptionCode: code });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
