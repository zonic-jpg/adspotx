import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventsLogTable = pgTable("events_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  actorId: uuid("actor_id"),
  entityType: text("entity_type"),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEventSchema = createInsertSchema(eventsLogTable).omit({
  id: true,
  createdAt: true,
});

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type EventLog = typeof eventsLogTable.$inferSelect;

export const EVENT_TYPES = {
  USER_LOGIN: "user_login",
  USER_REGISTER: "user_register",
  PROFILE_VIEWED: "profile_viewed",
  AD_FEED_VIEWED: "ad_feed_viewed",
  AD_VIEWED: "ad_viewed",
  AD_VIEW_START: "ad_view_start",
  AD_VIEW_COMPLETE: "ad_view_complete",
  QUESTION_ANSWERED: "question_answered",
  REVIEW_SUBMITTED: "review_submitted",
  POINTS_AWARDED: "points_awarded",
  POINTS_BALANCE_VIEWED: "points_balance_viewed",
  POINTS_LEDGER_VIEWED: "points_ledger_viewed",
  SHARE_CREATED: "share_created",
  LEADERBOARD_UPDATED: "leaderboard_updated",
  LEADERBOARD_VIEWED: "leaderboard_viewed",
  LEADERBOARD_HISTORY_VIEWED: "leaderboard_history_viewed",
  REDEMPTION_REQUESTED: "redemption_requested",
  AD_CREATED: "ad_created",
  AD_UPDATED: "ad_updated",
  AD_STATUS_CHANGED: "ad_status_changed",
  BRAND_ADS_VIEWED: "brand_ads_viewed",
  BRAND_AD_VIEWED: "brand_ad_viewed",
  BRAND_AD_STATS_VIEWED: "brand_ad_stats_viewed",
  BRAND_STATS_VIEWED: "brand_stats_viewed",
  ADMIN_EVENTS_QUERIED: "admin_events_queried",
  ADMIN_ADS_QUERIED: "admin_ads_queried",
  ADMIN_USERS_QUERIED: "admin_users_queried",
  ADMIN_EVENTS_EXPORTED: "admin_events_exported",
} as const;
