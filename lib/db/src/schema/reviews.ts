import { pgTable, text, timestamp, uuid, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { adsTable } from "./ads";
import { questionsTable } from "./questions";

export const reviewStatusEnum = pgEnum("review_status", ["in_progress", "completed", "abandoned"]);

export const reviewSessionsTable = pgTable("review_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  adId: uuid("ad_id").notNull().references(() => adsTable.id),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  watchSeconds: integer("watch_seconds"),
  pointsAwarded: integer("points_awarded"),
  status: reviewStatusEnum("status").notNull().default("in_progress"),
  comment: text("comment"),
  // Fraud signals captured server-side per view.
  watchPercentage: integer("watch_percentage"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  deviceFingerprint: text("device_fingerprint"),
});

export const answersTable = pgTable("answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewSessionId: uuid("review_session_id").notNull().references(() => reviewSessionsTable.id),
  questionId: uuid("question_id").notNull().references(() => questionsTable.id),
  answerText: text("answer_text"),
  answerValue: text("answer_value"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReviewSessionSchema = createInsertSchema(reviewSessionsTable).omit({
  id: true,
  startedAt: true,
});

export const insertAnswerSchema = createInsertSchema(answersTable).omit({
  id: true,
  createdAt: true,
});

export type InsertReviewSession = z.infer<typeof insertReviewSessionSchema>;
export type ReviewSession = typeof reviewSessionsTable.$inferSelect;
export type InsertAnswer = z.infer<typeof insertAnswerSchema>;
export type Answer = typeof answersTable.$inferSelect;
