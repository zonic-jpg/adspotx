import { describe, expect, it } from "vitest";
import { isProfileComplete, missingProfileFields, profileCompleteness, REQUIRED_PROFILE_FIELDS } from "./profile";

const full = Object.fromEntries(REQUIRED_PROFILE_FIELDS.map((f) => [f, "x"]));

describe("profile completeness (leaderboard gate)", () => {
  it("a null profile is incomplete and lists every field", () => {
    expect(isProfileComplete(null)).toBe(false);
    expect(missingProfileFields(null)).toHaveLength(REQUIRED_PROFILE_FIELDS.length);
    expect(profileCompleteness(null)).toBe(0);
  });

  it("a fully-filled profile is complete", () => {
    expect(isProfileComplete(full)).toBe(true);
    expect(missingProfileFields(full)).toHaveLength(0);
  });

  it("one missing field blocks completion and is reported", () => {
    const { city: _city, ...missingCity } = full;
    expect(isProfileComplete(missingCity)).toBe(false);
    expect(missingProfileFields(missingCity)).toEqual(["city"]);
  });

  it("empty strings count as missing (not just null)", () => {
    expect(isProfileComplete({ ...full, state: "   " })).toBe(false);
  });

  it("interests raise completeness as a bonus dimension", () => {
    const withoutInterests = profileCompleteness(full);
    const withInterests = profileCompleteness({ ...full, interests: ["Tech"] });
    expect(withInterests).toBeGreaterThan(withoutInterests);
    expect(withInterests).toBe(100);
  });
});
