/**
 * Applied during Netlify build when SUPABASE_ACCESS_TOKEN is set.
 * Runs AdSpot ops schema + ComNavig seed against shared Zonic Supabase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REF = process.env.SUPABASE_PROJECT_REF || "ukhdjvbzbidxoieauhpr";
const TOK = process.env.SUPABASE_ACCESS_TOKEN;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runFile(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    console.log("skip missing", rel);
    return;
  }
  const query = fs.readFileSync(full, "utf8");
  console.log("Applying", rel, `(${query.length} chars)…`);
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOK}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(rel, res.status, text.slice(0, 400));
  // Soft-fail: never break the Netlify/site build if management SQL is unavailable.
  if (!res.ok) console.warn(`SQL soft-fail for ${rel}: ${res.status}`);
  return res.ok;
}

async function main() {
  if (!TOK) {
    console.warn(
      "SUPABASE_ACCESS_TOKEN not set — skipping SQL apply. Admin console will 401 " +
        "until the AdSpot auth + ops migrations are applied to the Supabase project.",
    );
    return;
  }
  const failed = [];
  for (const f of [
    // Foundation first: adspot_profiles/brands/reviewer_profiles, adspot_is_admin(),
    // signup trigger and the owner super_admin row. Every ops policy below calls
    // adspot_is_admin(), so applying ops first fails on a DB that never got this.
    "supabase/migrations/20260829_auth_smooth_trigger_rls.sql",
    "supabase/migrations/20260829_adspot_ops_00.sql",
    "supabase/migrations/20260829_adspot_ops_01.sql",
    "supabase/migrations/20260829_adspot_ops_02.sql",
    "supabase/migrations/20260829_adspot_ops_03.sql",
    "supabase/migrations/20260829_adspot_ops_schema_seed.sql",
    // These three were written but never listed here, so they never reached
    // the project: partners/rewards tables plus the `adspot-assets` bucket
    // (without which every brand ad upload failed with "Bucket not found"),
    // the leaderboard eligibility functions, and the approval queue +
    // public-stats RPCs.
    "supabase/migrations/20260830_adspot_partners_rewards.sql",
    "supabase/migrations/20260830_adspot_leaderboard_integrity.sql",
    "supabase/migrations/20260902_adspot_admin_access_public_stats.sql",
  ]) {
    if (!(await runFile(f))) failed.push(f);
  }
  if (!(await runFile("supabase/migrations/20260829_adspot_comnavig_seed.sql"))) {
    failed.push("comnavig seed");
  }
  console.log(
    failed.length
      ? `AdSpot SQL apply finished with ${failed.length} soft-failure(s): ${failed.join(", ")}`
      : "AdSpot SQL apply complete — all files applied",
  );
}

main().catch((e) => {
  console.error("AdSpot SQL apply error (non-fatal):", e);
});
