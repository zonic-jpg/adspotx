/**
 * Reviewer mid-review draft persistence.
 *
 * A reviewer's survey answers, comment, attention-check answer, and watch
 * time used to live entirely in React state, so a refresh (or an accidental
 * back/forward nav) silently discarded all of it and made them start the ad
 * over from zero. This module gives that state a lightweight localStorage
 * backing so it survives a reload, mirroring the draft-persistence pattern
 * used elsewhere in the product suite (e.g. Rubba's planner wizard,
 * src/lib/plannerDraft.ts, and this app's own create-ad wizard draft,
 * src/brands/lib/adDraft.ts).
 *
 * Scoped per-ad (a reviewer can only be mid-review on one ad's page at a
 * time, but keying by adId keeps a stale draft for ad A from leaking into
 * ad B if the reviewer navigates between two review sessions in one tab)
 * and cleared once the review is submitted.
 */

const KEY_PREFIX = "adspot_review_draft_v1:";

export type ReviewDraft = {
  watchSeconds: number;
  answers: Record<string, string>;
  comment: string;
  proverbAnswer: string;
};

function keyFor(adId: string): string {
  return `${KEY_PREFIX}${adId}`;
}

export function loadReviewDraft(adId: string | undefined | null): ReviewDraft | null {
  if (!adId) return null;
  try {
    const raw = localStorage.getItem(keyFor(adId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReviewDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      watchSeconds: typeof parsed.watchSeconds === "number" ? parsed.watchSeconds : 0,
      answers: parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {},
      comment: typeof parsed.comment === "string" ? parsed.comment : "",
      proverbAnswer: typeof parsed.proverbAnswer === "string" ? parsed.proverbAnswer : "",
    };
  } catch {
    return null;
  }
}

export function saveReviewDraft(adId: string | undefined | null, draft: ReviewDraft): void {
  if (!adId) return;
  try {
    localStorage.setItem(keyFor(adId), JSON.stringify(draft));
  } catch {
    /* quota exceeded / private-mode storage — non-fatal, just isn't saved */
  }
}

export function clearReviewDraft(adId: string | undefined | null): void {
  if (!adId) return;
  try {
    localStorage.removeItem(keyFor(adId));
  } catch {
    /* ignore */
  }
}
