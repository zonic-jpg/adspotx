import "./load-env";
import app from "./app";
import { logger } from "./lib/logger";
import { checkDatabaseConnection, isPlaceholderDatabaseUrl } from "./lib/db-health";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const dbUrl = process.env.DATABASE_URL;
const dbLabel = !dbUrl
  ? "MISSING"
  : isPlaceholderDatabaseUrl(dbUrl)
    ? "PLACEHOLDER (edit server/.env)"
    : "set";

console.log(
  `[BOOT SUMMARY] port=${process.env.PORT ?? "3001"} static=${process.env.STATIC_DIR ?? "(none: API-only)"} cors=${process.env.CORS_ORIGINS ?? "same-origin only"} db=${dbLabel} jwt=${process.env.JWT_SECRET ? "set" : "MISSING"}`,
);

void checkDatabaseConnection().then((db) => {
  if (!db.ok) {
    logger.warn({ detail: db.error, placeholder: db.placeholder }, "Database not ready — /api/healthz will return 503 until DATABASE_URL is fixed");
  } else {
    logger.info({ latencyMs: db.latencyMs }, "Database connection verified at boot");
  }
});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
