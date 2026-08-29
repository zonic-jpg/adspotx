import { db } from "@workspace/db";
import type { Queryable } from "./db-types";
import { giftCatalogTable, giftGrantsTable } from "@workspace/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";

// Draw one gift from the active pool for this ad (ad-specific OR global), weighted
// by `weight`. Returns the granted gift, or null if no gifts are configured.
export async function drawGift(
  userId: string, adId: string, reviewSessionId: string, tx?: Queryable
) {
  const runner = tx ?? db;
  const pool = await runner
    .select()
    .from(giftCatalogTable)
    .where(and(eq(giftCatalogTable.active, true),
               or(eq(giftCatalogTable.adId, adId), isNull(giftCatalogTable.adId))));

  if (!pool.length) return null;

  const total = pool.reduce((n: number, g: { weight: number }) => n + Math.max(1, g.weight), 0);
  let r = Math.random() * total;
  let chosen = pool[0];
  for (const g of pool) {
    r -= Math.max(1, g.weight);
    if (r <= 0) { chosen = g; break; }
  }

  const [grant] = await runner.insert(giftGrantsTable).values({
    userId, giftId: chosen.id, reviewSessionId,
    type: chosen.type, label: chosen.label, value: chosen.value, status: "granted",
  }).returning();
  return grant;
}
