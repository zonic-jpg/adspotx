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

    const { id, status } = await req.json();
    const { data, error } = await admin.from("redemptions").update({ status }).eq("id", id).select().single();
    if (error) return errorResponse(error.message, 400);
    return jsonResponse({ redemption: data });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
