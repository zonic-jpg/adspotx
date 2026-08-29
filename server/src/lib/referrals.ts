import { db } from "@workspace/db";
import { referralCodesTable, referralsTable, pointsLedgerTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { notify } from "./notify";

const REFERRAL_REWARD = 50; // points to referrer when an invitee qualifies

function genCode() {
  return "ZM" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// Ensure the user has a stable shareable referral code.
export async function ensureReferralCode(userId: string): Promise<string> {
  const [existing] = await db.select().from(referralCodesTable).where(eq(referralCodesTable.userId, userId)).limit(1);
  if (existing) return existing.code;
  const code = genCode();
  await db.insert(referralCodesTable).values({ userId, code }).onConflictDoNothing();
  const [row] = await db.select().from(referralCodesTable).where(eq(referralCodesTable.userId, userId)).limit(1);
  return row?.code ?? code;
}

// Called when a new user signs up with a referral code (invited from outside the orbit).
export async function recordReferralSignup(code: string, inviteeUserId: string, inviteeEmail?: string) {
  const [owner] = await db.select().from(referralCodesTable).where(eq(referralCodesTable.code, code)).limit(1);
  if (!owner || owner.userId === inviteeUserId) return;
  await db.insert(referralsTable).values({
    referrerId: owner.userId, inviteeUserId, inviteeEmail: inviteeEmail ?? null,
    status: "signed_up",
  }).onConflictDoNothing();
}

// Called when an invitee completes their FIRST review -> referrer earns the bonus (atomic).
export async function qualifyReferral(inviteeUserId: string) {
  const [ref] = await db.select().from(referralsTable)
    .where(and(eq(referralsTable.inviteeUserId, inviteeUserId), eq(referralsTable.status, "signed_up")))
    .limit(1);
  if (!ref) return;

  await db.transaction(async (tx) => {
    await tx.update(referralsTable)
      .set({ status: "rewarded", rewardPoints: REFERRAL_REWARD, qualifiedAt: new Date() })
      .where(eq(referralsTable.id, ref.id));
    await tx.insert(pointsLedgerTable).values({
      userId: ref.referrerId, amount: REFERRAL_REWARD, source: "share_bonus",
      referenceId: ref.id, description: "Referral reward",
    });
    await notify(ref.referrerId, "referral", "Referral reward",
      `You earned ${REFERRAL_REWARD} points — someone you invited completed their first review.`, tx);
  });
}
