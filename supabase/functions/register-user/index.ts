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
    const meta = (authData.user.user_metadata ?? {}) as Record<string, unknown>;
    const metaRole = String(meta.role ?? meta.user_role ?? "").toLowerCase();
    let profileRole = (role ?? (metaRole === "brand" ? "brand" : metaRole === "reviewer" ? "reviewer" : "reviewer")) as
      | "reviewer"
      | "brand"
      | "admin"
      | "super_admin";
    // Normal reviewer/brand always approved. Pending is only for shared-admin password path (app-side).
    let approvalStatus: string | null = "approved";

    if (isOwner) {
      profileRole = "super_admin";
      approvalStatus = "approved";
    } else if (profileRole === "reviewer" || profileRole === "brand") {
      approvalStatus = "approved";
    }

    const resolvedUsername =
      username ??
      (typeof meta.username === "string" ? meta.username : null) ??
      email.split("@")[0];
    const resolvedCompany =
      companyName?.trim() ||
      (typeof meta.company_name === "string" ? meta.company_name : "") ||
      (typeof meta.companyName === "string" ? meta.companyName : "") ||
      resolvedUsername ||
      "Brand";

    const { error: profileErr } = await admin.from("profiles").upsert({
      id: authData.user.id,
      email,
      username: resolvedUsername,
      role: profileRole,
      approval_status: approvalStatus,
      suspended: false,
    });
    if (profileErr) return errorResponse(profileErr.message, 500, "internal_error");

    if (profileRole === "brand") {
      const { data: existingBrand } = await admin.from("brands").select("id").eq("user_id", authData.user.id).maybeSingle();
      if (existingBrand?.id) {
        await admin.from("brands").update({ company_name: resolvedCompany }).eq("id", existingBrand.id);
      } else {
        await admin.from("brands").insert({
          user_id: authData.user.id,
          company_name: resolvedCompany,
        });
      }
    }

    if (profileRole === "reviewer") {
      await admin.from("reviewer_profiles").upsert({ user_id: authData.user.id }, { onConflict: "user_id" });
    }

    return jsonResponse({ ok: true, role: profileRole });
  } catch (e) {
    return errorResponse((e as Error).message, 500, "internal_error");
  }
});
