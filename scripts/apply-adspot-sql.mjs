/**
 * Applied during Netlify build when SUPABASE_ACCESS_TOKEN is set.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REF = process.env.SUPABASE_PROJECT_REF || "bnfbgqtdwyiockkxvapp";
const TOK = process.env.SUPABASE_ACCESS_TOKEN;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

async function runFile(rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) { console.log("skip missing", rel); return; }
  const query = fs.readFileSync(full, "utf8");
  console.log("Applying", rel, "("+query.length+" chars)…");
  const res = await fetch("https://api.supabase.com/v1/projects/"+REF+"/database/query", {
    method: "POST",
    headers: { Authorization: "Bearer "+TOK, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  console.log(rel, res.status, text.slice(0, 400));
  if (!res.ok) throw new Error("SQL failed for "+rel+": "+res.status);
}

async function main() {
  if (!TOK) { console.log("SUPABASE_ACCESS_TOKEN not set — skip SQL apply"); return; }
  await runFile("supabase/migrations/20260829_adspot_ops_schema_seed.sql");
  await runFile("supabase/migrations/20260829_adspot_comnavig_seed.sql");
  console.log("AdSpot SQL apply complete");
}

main().catch((e) => { console.error(e); process.exit(1); });
