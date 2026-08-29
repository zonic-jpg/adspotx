import { pgTable, text, timestamp, uuid, integer, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const referralStatusEnum = pgEnum("referral_status", [
  "pending",    // invite sent / code shared, not yet signed up
  "signed_up",  // invitee registered
  "qualified",  // invitee completed first review -> referrer earns
  "rewarded",   // bonus issued to referrer
]);

// Each user has a stable referral code (for "invite outside the orbit").
export const referralCodesTable = pgTable("referral_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  code: text("code").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per invited person.
export const referralsTable = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  inviteeEmail: text("invitee_email"),
  inviteeUserId: uuid("invitee_user_id").references(() => usersTable.id),
  channel: text("channel"),                    // whatsapp / link / sms / etc.
  status: referralStatusEnum("status").notNull().default("pending"),
  rewardPoints: integer("reward_points").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
}, (t) => ({
  uniqInvitee: uniqueIndex("uniq_referral_invitee").on(t.referrerId, t.inviteeUserId),
}));

export const insertReferralSchema = createInsertSchema(referralsTable).omit({ id: true, createdAt: true });
export type Referral = typeof referralsTable.$inferSelect;
export type ReferralCode = typeof referralCodesTable.$inferSelect;
