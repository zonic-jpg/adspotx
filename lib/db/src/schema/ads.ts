import { pgTable, text, timestamp, uuid, integer, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { brandsTable } from "./brands";

export const adStatusEnum = pgEnum("ad_status", ["draft", "active", "paused", "archived"]);

export const adsTable = pgTable("ads", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").notNull().references(() => brandsTable.id),
  title: text("title").notNull(),
  description: text("description"),
  assetUrl: text("asset_url").notNull(),
  assetType: text("asset_type").notNull().default("image"),
  minWatchSeconds: integer("min_watch_seconds").notNull().default(15),
  pointReward: integer("point_reward").notNull().default(10),
  multiplierFactor: numeric("multiplier_factor", { precision: 3, scale: 1 }).notNull().default("1.0"),
  // Proverb bonus question — an attention check the brand configures. The reviewer
  // answers it; a match to the brand's preferred answer awards bonus points and
  // verifies genuine attention (filtering bots/skimmers).
  proverbQuestion: text("proverb_question"),
  proverbAnswer: text("proverb_answer"),
  proverbBonusPoints: integer("proverb_bonus_points").notNull().default(5),
  status: adStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdSchema = createInsertSchema(adsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAd = z.infer<typeof insertAdSchema>;
export type Ad = typeof adsTable.$inferSelect;
