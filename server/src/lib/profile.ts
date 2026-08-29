/** The mandatory profile dimensions. A reviewer must complete ALL of these to
 *  appear on (and win from) the leaderboard — richer, complete demographics
 *  are what make brand analytics trustworthy. */
export const REQUIRED_PROFILE_FIELDS = [
  "gender", "ageBand", "state", "city", "employmentStatus",
  "educationLevel", "incomeBand", "occupationSector", "deviceType", "maritalStatus",
] as const;

export type RequiredProfileField = (typeof REQUIRED_PROFILE_FIELDS)[number];

export interface ProfileLike extends Partial<Record<RequiredProfileField, unknown>> {
  interests?: unknown;
}

export function missingProfileFields(p: ProfileLike | null | undefined): RequiredProfileField[] {
  if (!p) return [...REQUIRED_PROFILE_FIELDS];
  return REQUIRED_PROFILE_FIELDS.filter((f) => {
    const v = p[f];
    return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  });
}

export function isProfileComplete(p: ProfileLike | null | undefined): boolean {
  return missingProfileFields(p).length === 0;
}

/** 0–100, interests counts as a bonus dimension. */
export function profileCompleteness(p: ProfileLike | null | undefined): number {
  const total = REQUIRED_PROFILE_FIELDS.length + 1;
  if (!p) return 0;
  const filled = REQUIRED_PROFILE_FIELDS.length - missingProfileFields(p).length
    + (Array.isArray(p.interests) && p.interests.length > 0 ? 1 : 0);
  return Math.round((filled / total) * 100);
}
