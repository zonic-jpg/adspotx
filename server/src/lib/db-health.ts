import { pool } from "@workspace/db";
import {
  isDatabaseConnectionError,
  isPlaceholderDatabaseUrl,
} from "./db-health-utils";

export { isDatabaseConnectionError, isPlaceholderDatabaseUrl } from "./db-health-utils";

export async function checkDatabaseConnection(): Promise<{
  ok: boolean;
  latencyMs?: number;
  error?: string;
  placeholder?: boolean;
}> {
  const url = process.env["DATABASE_URL"];
  if (isPlaceholderDatabaseUrl(url)) {
    return {
      ok: false,
      placeholder: true,
      error:
        "DATABASE_URL is unset or still contains template placeholders (HOST/USER/PASSWORD). Copy server/.env.example → server/.env and set a real Postgres URL.",
    };
  }

  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Database connection failed";
    return { ok: false, latencyMs: Date.now() - start, error: message };
  }
}
