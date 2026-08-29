import { pgTable, text, timestamp, uuid, integer, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adsTable } from "./ads";
import { usersTable } from "./users";

export const rewardTypeEnum = pgEnum("reward_type", ["wildcard", "general"]);

export const adRewardsTable = pgTable("ad_rewards", {
  id: uuid("id").primaryKey().defaultRandom(),
  adId: uuid("ad_id").notNull().references(() => adsTable.id, { onDelete: "cascade" }),
  type: rewardTypeEnum("type").notNull().default("general"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  rewardValueText: text("reward_value_text").notNull(),
  discountCode: text("discount_code"),
  maxClaims: integer("max_claims"),
  claimsCount: integer("claims_count").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rewardClaimsTable = pgTable("reward_claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  rewardId: uuid("reward_id").notNull().references(() => adRewardsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  redemptionCode: text("redemption_code").notNull(),
  claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdRewardSchema = createInsertSchema(adRewardsTable).omit({ id: true, createdAt: true, claimsCount: true });
export type InsertAdReward = z.infer<typeof insertAdRewardSchema>;
export type AdReward = typeof adRewardsTable.$inferSelect;
export type RewardClaim = typeof rewardClaimsTable.$inferSelect;
