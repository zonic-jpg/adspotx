import { db } from "@workspace/db";
import type { Queryable } from "./db-types";
import {
  fraudFlagsTable, fraudRulesTable, deviceSignalsTable, pointsLedgerTable, usersTable,
} from "@workspace/db/schema";
import { eq, and, gte, sql, ne } from "drizzle-orm";

async function getRules(runner: Queryable) {
  const [r] = await runner.select().from(fraudRulesTable).limit(1);
  return r ?? {
    sameDeviceScore: 50, sameIpScore: 20, excessiveDailyScore: 30, suspiciousPatternScore: 50,
    warnThreshold: 50, reviewThreshold: 100, autoSuspendThreshold: 150, maxDailyEarnings: 500,
  };
}

// Evaluate a user against the fraud rules using their recent device signals + earnings.
// Raises immutable fraud_flags and, past the suspend threshold, suspends the user.
export async function evaluateFraud(userId: string, signal: {
  ipAddress?: string | null; userAgent?: string | null; deviceFingerprint?: string | null;
}, tx?: Queryable) {
  const runner = tx ?? db;
  const rules = await getRules(runner);
  const flags: { reason: string; score: number; details: Record<string, unknown> }[] = [];

  // same device used by a DIFFERENT user?
  if (signal.deviceFingerprint) {
    const [row] = await runner.select({ n: sql<number>`count(distinct ${deviceSignalsTable.userId})` })
      .from(deviceSignalsTable)
      .where(and(eq(deviceSignalsTable.deviceFingerprint, signal.deviceFingerprint),
                 ne(deviceSignalsTable.userId, userId)));
    if (Number(row?.n ?? 0) > 0) flags.push({ reason: "same_device", score: rules.sameDeviceScore, details: { deviceFingerprint: signal.deviceFingerprint } });
  }
  // same IP used by a different user?
  if (signal.ipAddress) {
    const [row] = await runner.select({ n: sql<number>`count(distinct ${deviceSignalsTable.userId})` })
      .from(deviceSignalsTable)
      .where(and(eq(deviceSignalsTable.ipAddress, signal.ipAddress),
                 ne(deviceSignalsTable.userId, userId)));
    if (Number(row?.n ?? 0) > 0) flags.push({ reason: "same_ip", score: rules.sameIpScore, details: { ipAddress: signal.ipAddress } });
  }
  // excessive earnings today?
  const [earn] = await runner.select({ total: sql<number>`coalesce(sum(${pointsLedgerTable.amount}),0)` })
    .from(pointsLedgerTable)
    .where(and(eq(pointsLedgerTable.userId, userId),
               gte(pointsLedgerTable.createdAt, sql`date_trunc('day', now())`)));
  if (Number(earn?.total ?? 0) > rules.maxDailyEarnings)
    flags.push({ reason: "excessive_daily_earnings", score: rules.excessiveDailyScore, details: { todayTotal: Number(earn?.total ?? 0) } });

  // persist flags
  for (const f of flags) {
    await runner.insert(fraudFlagsTable).values({ userId, reason: f.reason, score: f.score, details: f.details, status: "open" });
  }

  // cumulative open score -> action
  const [agg] = await runner.select({ total: sql<number>`coalesce(sum(${fraudFlagsTable.score}),0)` })
    .from(fraudFlagsTable)
    .where(and(eq(fraudFlagsTable.userId, userId), eq(fraudFlagsTable.status, "open")));
  const totalScore = Number(agg?.total ?? 0);

  let action: "none" | "warn" | "review" | "suspend" = "none";
  if (totalScore >= rules.autoSuspendThreshold) action = "suspend";
  else if (totalScore >= rules.reviewThreshold) action = "review";
  else if (totalScore >= rules.warnThreshold) action = "warn";

  if (action === "suspend") {
    await runner.update(usersTable).set({ suspended: true }).where(eq(usersTable.id, userId)).catch(() => {});
  }
  return { totalScore, action, raised: flags.length };
}

export async function recordDeviceSignal(userId: string, reviewSessionId: string | null, signal: {
  ipAddress?: string | null; userAgent?: string | null; deviceFingerprint?: string | null;
}, tx?: Queryable) {
  const runner = tx ?? db;
  await runner.insert(deviceSignalsTable).values({ userId, reviewSessionId, ...signal });
}
