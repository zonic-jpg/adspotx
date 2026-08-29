import { describe, expect, it } from "vitest";
import {
  isDatabaseConnectionError,
  isPlaceholderDatabaseUrl,
} from "./db-health-utils";

describe("isPlaceholderDatabaseUrl", () => {
  it("flags template example URLs", () => {
    expect(
      isPlaceholderDatabaseUrl("postgres://USER:PASSWORD@HOST:5432/adspot"),
    ).toBe(true);
    expect(isPlaceholderDatabaseUrl(undefined)).toBe(true);
  });

  it("accepts real-looking URLs", () => {
    expect(
      isPlaceholderDatabaseUrl(
        "postgres://adspot:secret@db.example.com:5432/adspot",
      ),
    ).toBe(false);
  });
});

describe("isDatabaseConnectionError", () => {
  it("detects drizzle-wrapped pg errors", () => {
    const err = {
      cause: { code: "ENOTFOUND", hostname: "HOST" },
    };
    expect(isDatabaseConnectionError(err)).toBe(true);
  });

  it("ignores validation errors", () => {
    expect(isDatabaseConnectionError(new Error("validation failed"))).toBe(false);
  });
});
