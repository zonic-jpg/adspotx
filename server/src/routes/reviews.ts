import { Router } from "express";
import { db } from "@workspace/db";
import {
  reviewSessionsTable,
  answersTable,
  adsTable,
  pointsLedgerTable,
  questionsTable,
} from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateParams, schemas, paramSchemas } from "../middlewares/validate";
import { logEvent, EVENT_TYPES } from "../lib/events";
import { drawGift } from "../lib/gifts";
import { recordDeviceSignal, evaluateFraud } from "../lib/fraud";
import { qualifyReferral } from "../lib/referrals";
import { notify } from "../lib/notify";
import { computePointsAwarded, computeWatchPercentage } from "../lib/review-scoring";
import { completeMockReview, createMockReviewSession, reviewerMockEnabled } from "../lib/reviewer-mock-store";

const router = Router();

router.post(
  "/reviews/start",
  requireAuth,
  requireRole("reviewer"),
  validateBody(schemas.startReview),
  async (req, res) => {
    try {
      const { adId } = req.body;
      const userId = req.user!.userId;

      if (reviewerMockEnabled()) {
        const session = createMockReviewSession(adId, userId);
        if (!session) {
          res.status(404).json({ error: "not_found", message: "Ad not found or not active" });
          return;
        }
        res.status(201).json(session);
        return;
      }

      const [ad] = await db
        .select()
        .from(adsTable)
        .where(and(eq(adsTable.id, adId), eq(adsTable.status, "active")))
        .limit(1);

      if (!ad) {
        res.status(404).json({ error: "not_found", message: "Ad not found or not active" });
        return;
      }

      const session = await db.transaction(async (tx) => {
        const [newSession] = await tx
          .insert(reviewSessionsTable)
          .values({ userId, adId, status: "in_progress" })
          .returning();

        await logEvent(
          {
            eventType: EVENT_TYPES.AD_VIEW_START,
            actorId: userId,
            entityType: "review_session",
            entityId: newSession.id,
            metadata: { adId },
          },
          tx
        );

        return newSession;
      });

      res.status(201).json(session);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "internal_error", message: "Failed to start review" });
    }
  }
);

router.post(
  "/reviews/:sessionId/complete",
  requireAuth,
  requireRole("reviewer"),
  validateParams(paramSchemas.sessionId),
  validateBody(schemas.completeReview),
  async (req, res) => {
    try {
      const sessionId = String(req.params["sessionId"]);
      const { watchSeconds, answers, comment, proverbAnswer } = req.body;
      const userId = req.user!.userId;

      if (reviewerMockEnabled()) {
        try {
          const result = completeMockReview(sessionId, userId, watchSeconds, proverbAnswer);
          if (!result) {
            res.status(404).json({ error: "not_found", message: "Review session not found" });
            return;
          }
          res.json(result);
          return;
        } catch (err) {
          if ((err as Error & { code?: string }).code === "ALREADY_COMPLETED") {
            res.status(400).json({ error: "bad_request", message: "Review already completed" });
            return;
          }
          throw err;
        }
      }

      const [session] = await db
        .select()
        .from(reviewSessionsTable)
        .where(and(eq(reviewSessionsTable.id, sessionId), eq(reviewSessionsTable.userId, userId)))
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "not_found", message: "Review session not found" });
        return;
      }

      const [ad] = await db.select().from(adsTable).where(eq(adsTable.id, session.adId)).limit(1);
      if (!ad) {
        res.status(404).json({ error: "not_found", message: "Ad not found" });
        return;
      }

      if (watchSeconds < ad.minWatchSeconds) {
        res.status(400).json({
          error: "bad_request",
          message: `Must watch at least ${ad.minWatchSeconds} seconds before submitting`,
        });
        return;
      }

      const questions = await db
        .select()
        .from(questionsTable)
        .where(eq(questionsTable.adId, session.adId));

      const expectedIds = new Set(questions.map((q) => q.id));
      const submittedIds = (answers as Array<{ questionId: string }>).map((a) => a.questionId);

      if (submittedIds.length !== expectedIds.size) {
        res.status(400).json({
          error: "bad_request",
          message: `Expected exactly ${expectedIds.size} answers, got ${submittedIds.length}`,
        });
        return;
      }

      const uniqueSubmitted = new Set(submittedIds);
      if (uniqueSubmitted.size !== submittedIds.length) {
        res.status(400).json({ error: "bad_request", message: "Duplicate question IDs in answers" });
        return;
      }

      for (const id of submittedIds) {
        if (!expectedIds.has(id)) {
          res.status(400).json({
            error: "bad_request",
            message: `Question ${id} does not belong to this ad`,
          });
          return;
        }
      }

      let pointsAwarded = computePointsAwarded(ad.pointReward, ad.multiplierFactor);

      if (
        proverbAnswer &&
        ad.proverbAnswer &&
        proverbAnswer.trim().toLowerCase() === ad.proverbAnswer.trim().toLowerCase()
      ) {
        pointsAwarded += ad.proverbBonusPoints ?? 0;
      }

      // Fraud signals captured server-side (never trust client maths).
      const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
      const userAgent = (req.headers["user-agent"] as string) || null;
      const deviceFingerprint = (req.body?.deviceFingerprint as string) || null;
      const watchPercentage = computeWatchPercentage(watchSeconds, ad.minWatchSeconds);

      const { updatedSession, totalBalance, gift } = await db.transaction(async (tx) => {
        // Atomically claim the session: only succeeds if status is still 'in_progress'.
        // This prevents double-completion under concurrent requests without a pre-check race.
        const [updated] = await tx
          .update(reviewSessionsTable)
          .set({ status: "completed", completedAt: new Date(), watchSeconds, pointsAwarded, comment: comment ?? null,
                 watchPercentage, ipAddress, userAgent, deviceFingerprint })
          .where(and(eq(reviewSessionsTable.id, sessionId), eq(reviewSessionsTable.status, "in_progress")))
          .returning();

        if (!updated) {
          const err = new Error("Review already completed") as Error & { code: string };
          err.code = "ALREADY_COMPLETED";
          throw err;
        }

        if (answers.length > 0) {
          await tx.insert(answersTable).values(
            (answers as Array<{ questionId: string; answerText?: string; answerValue?: string }>).map((a) => ({
              reviewSessionId: sessionId,
              questionId: a.questionId,
              answerText: a.answerText ?? null,
              answerValue: a.answerValue ?? null,
            }))
          );

          for (const a of answers as Array<{ questionId: string; answerText?: string; answerValue?: string }>) {
            await logEvent(
              {
                eventType: EVENT_TYPES.QUESTION_ANSWERED,
                actorId: userId,
                entityType: "review_session",
                entityId: sessionId,
                metadata: {
                  adId: session.adId,
                  questionId: a.questionId,
                  answerValue: a.answerValue ?? null,
                },
              },
              tx
            );
          }
        }

        await tx.insert(pointsLedgerTable).values({
          userId,
          amount: pointsAwarded,
          source: "review",
          referenceId: sessionId,
          description: `Completed review for "${ad.title}"`,
        });

        await logEvent(
          {
            eventType: EVENT_TYPES.AD_VIEW_COMPLETE,
            actorId: userId,
            entityType: "review_session",
            entityId: sessionId,
            metadata: { adId: session.adId, watchSeconds },
          },
          tx
        );

        await logEvent(
          {
            eventType: EVENT_TYPES.REVIEW_SUBMITTED,
            actorId: userId,
            entityType: "review_session",
            entityId: sessionId,
            metadata: { adId: session.adId, watchSeconds, pointsAwarded, answerCount: answers.length },
          },
          tx
        );

        await logEvent(
          {
            eventType: EVENT_TYPES.POINTS_AWARDED,
            actorId: userId,
            entityType: "user",
            entityId: userId,
            metadata: { amount: pointsAwarded, source: "review", referenceId: sessionId },
          },
          tx
        );

        const balanceResult = await tx.execute(
          sql`SELECT COALESCE(SUM(amount), 0) as balance FROM points_ledger WHERE user_id = ${userId}`
        );
        const balance = Number((balanceResult.rows[0] as { balance: string }).balance);

        // Record device signal for fraud analysis.
        await recordDeviceSignal(userId, sessionId, { ipAddress, userAgent, deviceFingerprint }, tx);

        // Random gift on completion (generic: discount / cash / airtime / other).
        const gift = await drawGift(userId, session.adId, sessionId, tx);

        // In-app notifications for the reward (and gift, if any).
        await notify(userId, "reward", "Reward earned", `You earned ${pointsAwarded} points for completing a review.`, tx);
        if (gift) await notify(userId, "gift", "You won a gift!", `${gift.label} — check your rewards.`, tx);

        return { updatedSession: updated, totalBalance: balance, gift };
      });

      // Post-commit (own queries): fraud evaluation + first-review referral qualification.
      try { await evaluateFraud(userId, { ipAddress, userAgent, deviceFingerprint }); } catch { /* non-blocking */ }
      try { await qualifyReferral(userId); } catch { /* non-blocking */ }

      res.json({ session: updatedSession, pointsAwarded, totalBalance, gift });
    } catch (err) {
      if ((err as Error & { code?: string }).code === "ALREADY_COMPLETED") {
        res.status(400).json({ error: "bad_request", message: "Review already completed" });
        return;
      }
      console.error(err);
      res.status(500).json({ error: "internal_error", message: "Failed to complete review" });
    }
  }
);

export default router;
