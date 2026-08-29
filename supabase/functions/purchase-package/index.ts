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
    const { packageId } = await req.json();

    const { data: pkg } = await admin.from("ad_packages").select("*").eq("id", packageId).single();
    if (!pkg) return errorResponse("Package not found", 404);

    await admin.from("events_log").insert({
      event_type: "package_purchase",
      actor_id: authData.user.id,
      entity_type: "ad_package",
      entity_id: packageId,
      metadata: { packageName: pkg.name, price: pkg.price },
    });

    return jsonResponse({ ok: true, package: pkg, note: "Payment stub — log only" });
  } catch (e) {
    return errorResponse((e as Error).message, 500);
  }
});
