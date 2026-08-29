import { pgTable, text, timestamp, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const redemptionTypeEnum = pgEnum("redemption_type", ["airtime", "cash", "voucher"]);
export const redemptionStatusEnum = pgEnum("redemption_status", [
  "pending",
  "processing",
  "completed",
  "failed",
]);

export const redemptionsTable = pgTable("redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  amountPoints: integer("amount_points").notNull(),
  redemptionType: redemptionTypeEnum("redemption_type").notNull(),
  status: redemptionStatusEnum("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRedemptionSchema = createInsertSchema(redemptionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertRedemption = z.infer<typeof insertRedemptionSchema>;
export type Redemption = typeof redemptionsTable.$inferSelect;
