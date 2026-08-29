/**
 * seed-settings.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent seed for platform_settings table.
 * Uses ON CONFLICT DO NOTHING — safe to re-run without clobbering live values.
 *
 * Run:  pnpm --filter @workspace/db seed:settings
 */
import { db, pool } from "./index";
import { platformSettingsTable } from "./schema";

const DEFAULTS = [
  {
    key: "demo_mode",
    value: "true",
    label: "Demo Mode",
    description:
      "When enabled, seeded demo accounts (.demo emails) are included in all stats and feeds. Disable before going live so only real production data is served.",
    type: "boolean",
  },
  {
    key: "platform_name",
    value: "AdSpot",
    label: "Platform Name",
    description: "Display name shown in emails, page headers, and public-facing pages.",
    type: "string",
  },
  {
    key: "min_watch_seconds_default",
    value: "15",
    label: "Default Min Watch Time (seconds)",
    description:
      "Minimum seconds a reviewer must watch an ad before points are awarded. Brands may override this per ad.",
    type: "number",
  },
  {
    key: "point_reward_default",
    value: "25",
    label: "Default Point Reward",
    description:
      "Points awarded per completed review when the brand has not set a custom amount.",
    type: "number",
  },
  {
    key: "leaderboard_size",
    value: "10",
    label: "Leaderboard Size",
    description: "Number of top reviewers shown on the weekly leaderboard.",
    type: "number",
  },
  {
    key: "max_daily_reviews",
    value: "50",
    label: "Max Daily Reviews Per User",
    description: "Maximum ad reviews a single reviewer may complete in one calendar day.",
    type: "number",
  },
] as const;

async function main() {
  console.log("🌱  Seeding platform settings…\n");
  for (const setting of DEFAULTS) {
    await db
      .insert(platformSettingsTable)
      .values(setting)
      .onConflictDoNothing();
    console.log(`  ✓  ${setting.key.padEnd(28)} = ${setting.value}`);
  }
  console.log("\n✅  Platform settings seed complete.");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
