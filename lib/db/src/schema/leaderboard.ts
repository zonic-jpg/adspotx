import { pgTable, timestamp, uuid, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const leaderboardSnapshotsTable = pgTable("leaderboard_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id),
  weekStart: date("week_start").notNull(),
  pointsTotal: integer("points_total").notNull().default(0),
  rank: integer("rank").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLeaderboardSnapshotSchema = createInsertSchema(leaderboardSnapshotsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertLeaderboardSnapshot = z.infer<typeof insertLeaderboardSnapshotSchema>;
export type LeaderboardSnapshot = typeof leaderboardSnapshotsTable.$inferSelect;
