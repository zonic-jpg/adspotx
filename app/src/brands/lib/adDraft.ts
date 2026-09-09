/**
 * Create-Ad wizard draft persistence.
 *
 * The campaign creation wizard (details → questions → review) used to live
 * entirely in React state, so a refresh, accidental tab close, or browser
 * crash mid-flow silently discarded everything the brand had entered —
 * including an already-uploaded creative file. This module gives that state
 * a lightweight localStorage backing so it survives a reload, mirroring the
 * draft-persistence pattern used elsewhere in the product suite (e.g.
 * Rubba's planner wizard, src/lib/plannerDraft.ts).
 *
 * The selected File/Blob itself cannot be JSON-serialized into localStorage,
 * so it is never part of the draft. Everything else — text fields,
 * selections, questions, and step position — is persisted. If the upload
 * had not finished before the page was closed, the uploaded file name is
 * dropped from the restored draft and the caller should prompt the brand to
 * re-select their creative; the rest of the form is left intact.
 *
 * Not scoped per-brand/user, matching the fact that only one campaign can be
 * mid-creation in a given browser at a time.
 */

const DRAFT_KEY = "adspot_create_ad_draft_v1";

export type CreateAdDraftQuestion = {
  questionType: "multiple_choice" | "rating" | "open_text" | "emoji" | "yes_no";
  questionText: string;
  options?: string[];
};

export type CreateAdDraftValues = {
  title: string;
  description?: string;
  assetUrl: string;
  assetType: "image" | "video";
  minWatchSeconds: number;
  pointReward: number;
  proverbQuestion?: string;
  proverbAnswer?: string;
  proverbBonusPoints: number;
  questions: CreateAdDraftQuestion[];
};

export type CreateAdDraft = {
  step: number;
  assetInputMode: "url" | "upload";
  /** Informational only — the File itself is never persisted. */
  uploadedFileName: string | null;
  /** Set once the upload finishes; if empty, no upload had completed. */
  uploadComplete: boolean;
  values: CreateAdDraftValues;
};

export function loadCreateAdDraft(): CreateAdDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CreateAdDraft;
    if (!parsed || typeof parsed !== "object" || !parsed.values) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveCreateAdDraft(draft: CreateAdDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota exceeded / private-mode storage — non-fatal, just isn't saved */
  }
}

export function clearCreateAdDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
