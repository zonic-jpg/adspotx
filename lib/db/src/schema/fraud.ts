import { pgTable, text, timestamp, uuid, integer, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

// Fraud flag lifecycle.
export const fraudFlagStatusEnum = pgEnum("fraud_flag_status", [
  "open",        // newly raised
  "reviewing",   // admin looking at it
  "dismissed",   // false positive
  "actioned",    // led to suspension/adjustment
]);

// Immutable fraud flags with an audit trail (one row per detection).
export const fraudFlagsTable = pgTable("fraud_flags", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  score: integer("score").notNull(),                 // contribution of this flag
  reason: text("reason").notNull(),                  // e.g. "same_device", "excessive_daily_earnings"
  details: jsonb("details"),                         // evidence snapshot
  status: fraudFlagStatusEnum("status").notNull().default("open"),
  reviewedBy: uuid("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Admin-configurable scoring weights + thresholds (one row, editable).
export const fraudRulesTable = pgTable("fraud_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  // weights
  sameDeviceScore: integer("same_device_score").notNull().default(50),
  sameIpScore: integer("same_ip_score").notNull().default(20),
  excessiveDailyScore: integer("excessive_daily_score").notNull().default(30),
  suspiciousPatternScore: integer("suspicious_pattern_score").notNull().default(50),
  // thresholds
  warnThreshold: integer("warn_threshold").notNull().default(50),
  reviewThreshold: integer("review_threshold").notNull().default(100),
  autoSuspendThreshold: integer("auto_suspend_threshold").notNull().default(150),
  // limits used by the rules
  maxDailyEarnings: integer("max_daily_earnings").notNull().default(500),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Device/session signals captured per review (server-side, never trusted from client alone).
export const deviceSignalsTable = pgTable("device_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  reviewSessionId: uuid("review_session_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceFingerprint: text("device_fingerprint"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFraudFlagSchema = createInsertSchema(fraudFlagsTable).omit({ id: true, createdAt: true });
export type FraudFlag = typeof fraudFlagsTable.$inferSelect;
export type FraudRules = typeof fraudRulesTable.$inferSelect;
export type DeviceSignal = typeof deviceSignalsTable.$inferSelect;
export const insertDeviceSignalSchema = createInsertSchema(deviceSignalsTable).omit({ id: true, createdAt: true });
