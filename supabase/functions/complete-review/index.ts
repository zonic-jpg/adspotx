import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData } = await supabaseUser.auth.getUser();
    if (!authData.user) return errorResponse("Unauthorized", 401);

    const body = await req.json();
    const { sessionId, watchSeconds, answers, comment, proverbAnswer, deviceFingerprint } = body;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const userId = authData.user.id;

    const { data: session } = await admin
      .from("adspot_review_sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!session) return errorResponse("Review session not found", 404, "not_found");
    if (session.status !== "in_progress") return errorResponse("Review already completed", 400);

    const { data: ad } = await admin.from("adspot_ads").select("*").eq("id", session.ad_id).single();
    if (!ad) return errorResponse("Ad not found", 404);

    if (watchSeconds < ad.min_watch_seconds) {
      return errorResponse(`Must watch at least ${ad.min_watch_seconds} seconds`, 400);
    }

    const { data: questions } = await admin.from("adspot_questions").select("id").eq("ad_id", session.ad_id);
    const expectedIds = new Set((questions ?? []).map((q) => q.id));
    const submitted = (answers ?? []) as Array<{ questionId: string; answerText?: string; answerValue?: string }>;
    if (submitted.length !== expectedIds.size) {
      return errorResponse(`Expected ${expectedIds.size} answers`, 400);
    }

    let pointsAwarded = Math.round(ad.point_reward * Number(ad.multiplier_factor ?? 1));
    if (proverbAnswer && ad.proverb_answer && String(proverbAnswer).trim().toLowerCase() === String(ad.proverb_answer).trim().toLowerCase()) {
      pointsAwarded += ad.proverb_bonus_points ?? 0;
    }

    const { data: updated, error: updErr } = await admin
      .from("adspot_review_sessions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        watch_seconds: watchSeconds,
        points_awarded: pointsAwarded,
      })
      .eq("id", sessionId)
      .eq("status", "in_progress")
      .select()
      .single();
    if (updErr || !updated) return errorResponse("Review already completed", 400);

    if (submitted.length) {
      await admin.from("adspot_answers").insert(
        submitted.map((a) => ({
          review_session_id: sessionId,
          question_id: a.questionId,
          answer_text: a.answerText ?? null,
          answer_value: a.answerValue ?? null,
        })),
      );
    }

    await admin.from("adspot_points_ledger").insert({
      user_id: userId,
      amount: pointsAwarded,
      source: "review",
      session_id: sessionId,
      description: `Completed review for "${ad.title}"${comment ? ` — "${comment}"` : ""}`,
    });

    const { data: ledger } = await admin.from("adspot_points_ledger").select("amount").eq("user_id", userId);
    const totalBalance = (ledger ?? []).reduce((s, r) => s + r.amount, 0);

    return jsonResponse({
      session: {
        id: updated.id,
        userId: updated.user_id,
        adId: updated.ad_id,
        startedAt: updated.started_at,
        status: updated.status,
      },
      pointsAwarded,
      totalBalance,
      // No gift-draw feature in the current schema (adspot_ad_rewards /
      // claim-reward already cover brand-side rewards); kept as null so
      // the client's existing "gift" handling doesn't need a change.
      gift: null,
      deviceFingerprint: deviceFingerprint ?? null,
    });
  } catch (e) {
    return errorResponse((e as Error).message, 500, "internal_error");
  }
});
