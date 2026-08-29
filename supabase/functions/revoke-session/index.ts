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

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).single();
    if (!profile || !["admin", "super_admin"].includes(profile.role)) return errorResponse("Forbidden", 403);

    const { sessionId } = await req.json();
    const { data: session } = await admin.from("review_sessions").select("*").eq("id", sessionId).single();
    if (!session) return errorResponse("Session not found", 404);

    if (session.points_awarded && session.status === "completed") {
      await admin.from("points_ledger").insert({
        user_id: session.user_id,
        amount: -session.points_awarded,
        source: "admin_grant",
        reference_id: sessionId,
        description: "Session revoked by admin",
      });
    }

    await admin.from("answers").delete().eq("review_session_id", sessionId);
    await admin.from("review_sessions").delete().eq("id", sessionId);

    return jsonResponse({ ok: true });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
