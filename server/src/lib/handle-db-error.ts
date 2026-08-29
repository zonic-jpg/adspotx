import type { Response } from "express";
import { isDatabaseConnectionError } from "./db-health-utils";

/** Map DB connectivity failures to 503 instead of opaque 500s. */
export function respondIfDatabaseUnavailable(
  res: Response,
  err: unknown,
  fallbackMessage: string,
): boolean {
  if (!isDatabaseConnectionError(err)) return false;
  res.status(503).json({
    error: "service_unavailable",
    message: "Database is not reachable. Check DATABASE_URL and that Postgres is running.",
    detail: fallbackMessage,
  });
  return true;
}
