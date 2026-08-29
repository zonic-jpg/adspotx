import { pgTable, text, timestamp, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const pointsSourceEnum = pgEnum("points_source", [
  "review",
  "share_bonus",
  "multiplier",
  "admin_grant",
  "redemption",
]);

export const pointsLedgerTable = pgTable("points_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  amount: integer("amount").notNull(),
  source: pointsSourceEnum("source").notNull(),
  referenceId: uuid("reference_id"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPointsLedgerSchema = createInsertSchema(pointsLedgerTable).omit({
  id: true,
  createdAt: true,
});

export type InsertPointsLedger = z.infer<typeof insertPointsLedgerSchema>;
export type PointsLedger = typeof pointsLedgerTable.$inferSelect;
