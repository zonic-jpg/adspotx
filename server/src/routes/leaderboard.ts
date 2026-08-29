import { Router } from "express";
import { db } from "@workspace/db";
import { isProfileComplete, missingProfileFields } from "../lib/profile";
import { reviewerProfilesTable } from "@workspace/db/schema";
import { usersTable, leaderboardSnapshotsTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";
import { validateQuery, querySchemas } from "../middlewares/validate";
import { logEventSafe, EVENT_TYPES } from "../lib/events";
import { getMockLeaderboard, reviewerMockEnabled } from "../lib/reviewer-mock-store";

const router = Router();

function getWeekStart(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  return date.toISOString().split("T")[0]!;
}

function weekEndStr(weekStart: string): string {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 7);
  return d.toISOString().split("T")[0]!;
}

async function computeWeekEntries(
  weekStart: string,
  weekEnd: string,
  currentUserId?: string
): Promise<
  Array<{
    rank: number;
    userId: string;
    username: string;
    pointsTotal: number;
    isCurrentUser: boolean;
  }>
> {
  const rows = await db.execute(
    sql`SELECT 
      pl.user_id,
      u.username,
      COALESCE(SUM(pl.amount), 0) as points_total,
      ROW_NUMBER() OVER (ORDER BY COALESCE(SUM(pl.amount), 0) DESC) as rank
    FROM points_ledger pl
    JOIN users u ON u.id = pl.user_id
    WHERE pl.created_at >= ${weekStart}::date 
      AND pl.created_at < ${weekEnd}::date
      AND pl.amount > 0
    GROUP BY pl.user_id, u.username
    ORDER BY points_total DESC
    LIMIT 10`
  );

  return (
    rows.rows as Array<{ user_id: string; username: string; points_total: string; rank: string }>
  ).map((r) => ({
    rank: Number(r.rank),
    userId: r.user_id,
    username: r.username,
    pointsTotal: Number(r.points_total),
    isCurrentUser: r.user_id === currentUserId,
  }));
}

async function writeWeekSnapshot(weekStart: string, entries: Array<{ userId: string; pointsTotal: number; rank: number }>) {
  if (entries.length === 0) return;
  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`DELETE FROM leaderboard_snapshots WHERE week_start = ${weekStart}::date`
      );
      for (const e of entries) {
        await tx
          .insert(leaderboardSnapshotsTable)
          .values({ userId: e.userId, weekStart, pointsTotal: e.pointsTotal, rank: e.rank });
      }
    });
    await logEventSafe({
      eventType: EVENT_TYPES.LEADERBOARD_UPDATED,
      actorId: null,
      entityType: "leaderboard",
      entityId: null,
      metadata: { weekStart, entriesCount: entries.length },
    });
  } catch (err) {
    console.error("Failed to write leaderboard snapshot:", err);
  }
}

router.get("/leaderboard", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;

    if (reviewerMockEnabled()) {
      const mock = getMockLeaderboard();
      res.json({
        weekStart: new Date().toISOString().slice(0, 10),
        entries: mock.entries,
        currentUserRank: mock.myRank,
        currentUserPoints: mock.entries[0]?.pointsTotal ?? 0,
      });
      return;
    }

    const weekStart = getWeekStart(new Date());
    const weekEnd = weekEndStr(weekStart);

    const entries = await computeWeekEntries(weekStart, weekEnd, userId);

    const currentUserRow = (
      await db.execute(
        sql`SELECT COALESCE(SUM(amount), 0) as points_total
          FROM points_ledger
          WHERE user_id = ${userId}
            AND created_at >= ${weekStart}::date
            AND created_at < ${weekEnd}::date
            AND amount > 0`
      )
    ).rows[0] as { points_total: string };

    const currentUserPoints = Number(currentUserRow.points_total);
    const currentUserEntry = entries.find((e) => e.userId === userId);

    writeWeekSnapshot(weekStart, entries).catch(() => {});

    await logEventSafe({
      eventType: EVENT_TYPES.LEADERBOARD_VIEWED,
      actorId: userId,
      entityType: "leaderboard",
      entityId: null,
      metadata: { weekStart, entriesCount: entries.length },
    });

    res.json({
      weekStart,
      entries,
      currentUserRank: currentUserEntry?.rank ?? null,
      currentUserPoints: currentUserPoints > 0 ? currentUserPoints : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch leaderboard" });
  }
});

router.get("/leaderboard/history", requireAuth, validateQuery(querySchemas.leaderboardHistory), async (req, res) => {
  try {
    const { weeks } = res.locals["parsedQuery"] as { weeks: number };
    const userId = req.user!.userId;

    const result: Array<{
      weekStart: string;
      entries: Array<{
        rank: number;
        userId: string;
        username: string;
        pointsTotal: number;
        isCurrentUser: boolean;
      }>;
    }> = [];

    for (let i = 1; i <= weeks; i++) {
      const weekStartDate = new Date();
      weekStartDate.setDate(weekStartDate.getDate() - 7 * i);
      const weekStart = getWeekStart(weekStartDate);

      const snapshots = await db
        .select({
          userId: leaderboardSnapshotsTable.userId,
          rank: leaderboardSnapshotsTable.rank,
          pointsTotal: leaderboardSnapshotsTable.pointsTotal,
          username: usersTable.username,
        })
        .from(leaderboardSnapshotsTable)
        .leftJoin(usersTable, eq(leaderboardSnapshotsTable.userId, usersTable.id))
        // Leaderboard participation requires a complete reviewer profile —
        // complete demographics are the price of ranking (and winning).
        .innerJoin(reviewerProfilesTable, eq(leaderboardSnapshotsTable.userId, reviewerProfilesTable.userId))
        .where(sql`week_start = ${weekStart}::date
          AND ${reviewerProfilesTable.gender} IS NOT NULL
          AND ${reviewerProfilesTable.ageBand} IS NOT NULL
          AND ${reviewerProfilesTable.state} IS NOT NULL
          AND ${reviewerProfilesTable.city} IS NOT NULL
          AND ${reviewerProfilesTable.employmentStatus} IS NOT NULL
          AND ${reviewerProfilesTable.educationLevel} IS NOT NULL
          AND ${reviewerProfilesTable.incomeBand} IS NOT NULL
          AND ${reviewerProfilesTable.occupationSector} IS NOT NULL
          AND ${reviewerProfilesTable.deviceType} IS NOT NULL
          AND ${reviewerProfilesTable.maritalStatus} IS NOT NULL`)
        .orderBy(leaderboardSnapshotsTable.rank);

      const entries = snapshots.map((s) => ({
        rank: s.rank,
        userId: s.userId,
        username: s.username ?? "(unknown)",
        pointsTotal: s.pointsTotal,
        isCurrentUser: s.userId === userId,
      }));

      result.push({ weekStart, entries });
    }

    await logEventSafe({
      eventType: EVENT_TYPES.LEADERBOARD_HISTORY_VIEWED,
      actorId: userId,
      entityType: "leaderboard",
      entityId: null,
      metadata: { weeksRequested: weeks, weeksReturned: result.length },
    });

    res.json({ weeks: result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch leaderboard history" });
  }
});

// ─── GET /leaderboard/eligibility ────────────────────────────────────────────
// Whether the current reviewer's profile qualifies them to be ranked.
router.get("/leaderboard/eligibility", requireAuth, async (req, res) => {
  try {
    if (reviewerMockEnabled()) {
      res.json({ eligible: true, missingFields: [] });
      return;
    }

    const [p] = await db.select().from(reviewerProfilesTable)
      .where(eq(reviewerProfilesTable.userId, req.user!.userId)).limit(1);
    res.json({
      eligible: isProfileComplete(p ?? null),
      missingFields: missingProfileFields(p ?? null),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "internal_error", message: "Failed to check eligibility" });
  }
});

export default router;
