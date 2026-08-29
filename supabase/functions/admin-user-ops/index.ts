import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const OWNER_EMAIL = "oadeagbo@gmail.com";

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
    const { data: actor } = await admin.from("profiles").select("role, email").eq("id", authData.user.id).single();
    if (!actor || actor.role !== "super_admin") return errorResponse("Forbidden", 403);

    const body = await req.json();
    const { action, userId, role, email, username, password, companyName } = body;

    if (action === "create") {
      const { data: created, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) return errorResponse(error.message, 400);
      await admin.from("profiles").insert({
        id: created.user.id,
        email,
        username,
        role,
        approval_status: "approved",
      });
      if (role === "brand") {
        await admin.from("brands").insert({ user_id: created.user.id, company_name: companyName ?? username });
      }
      return jsonResponse({ userId: created.user.id });
    }

    if (action === "change_role") {
      const { data: target } = await admin.from("profiles").select("email").eq("id", userId).single();
      if (target?.email === OWNER_EMAIL) return errorResponse("Cannot change owner role", 403);
      await admin.from("profiles").update({ role }).eq("id", userId);
      return jsonResponse({ ok: true });
    }

    if (action === "delete") {
      const { data: target } = await admin.from("profiles").select("email").eq("id", userId).single();
      if (target?.email === OWNER_EMAIL) return errorResponse("Cannot delete owner", 403);
      await admin.auth.admin.deleteUser(userId);
      return jsonResponse({ ok: true });
    }

    return errorResponse("Unknown action", 400);
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
