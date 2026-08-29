import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

async function requireAdmin(authHeader: string) {
  const supabaseUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData } = await supabaseUser.auth.getUser();
  if (!authData.user) throw new Error("Unauthorized");
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile } = await admin.from("profiles").select("role").eq("id", authData.user.id).single();
  if (!profile || !["admin", "super_admin"].includes(profile.role)) throw new Error("Forbidden");
  return { admin, userId: authData.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401);
    const { admin } = await requireAdmin(authHeader);
    const body = await req.json();
    const { userId, amount, description } = body;
    if (!userId || typeof amount !== "number") return errorResponse("userId and amount required", 400);

    const { data, error } = await admin.from("points_ledger").insert({
      user_id: userId,
      amount,
      source: "admin_grant",
      description: description ?? "Admin adjustment",
    }).select().single();
    if (error) return errorResponse(error.message, 400);
    return jsonResponse({ entry: data });
  } catch (e) {
    const msg = (e as Error).message;
    return errorResponse(msg, msg === "Forbidden" ? 403 : 401);
  }
});
