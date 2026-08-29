import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/cors.ts";

const OWNER_EMAIL = "oadeagbo@gmail.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errorResponse("Unauthorized", 401, "unauthorized");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: authData, error: authErr } = await supabaseUser.auth.getUser();
    if (authErr || !authData.user) return errorResponse("Unauthorized", 401, "unauthorized");

    const body = await req.json();
    const { username, role, companyName } = body as {
      username?: string;
      role?: "reviewer" | "brand" | "admin" | "super_admin";
      companyName?: string;
    };

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const email = authData.user.email?.toLowerCase() ?? "";
    const isOwner = email === OWNER_EMAIL;
    let profileRole = role ?? "reviewer";
    let approvalStatus: string | null = "approved";

    if (isOwner) {
      profileRole = "super_admin";
      approvalStatus = "approved";
    }

    const { error: profileErr } = await admin.from("profiles").upsert({
      id: authData.user.id,
      email,
      username: username ?? email.split("@")[0],
      role: profileRole,
      approval_status: approvalStatus,
      suspended: false,
    });
    if (profileErr) return errorResponse(profileErr.message, 500, "internal_error");

    if (profileRole === "brand") {
      await admin.from("brands").upsert({
        user_id: authData.user.id,
        company_name: companyName?.trim() || username || "Brand",
      });
    }

    if (profileRole === "reviewer") {
      await admin.from("reviewer_profiles").upsert({ user_id: authData.user.id });
    }

    return jsonResponse({ ok: true, role: profileRole });
  } catch (e) {
    return errorResponse((e as Error).message, 500, "internal_error");
  }
});
