import express, { type Express } from "express";
import path from "node:path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Security headers. CSP is disabled because this server also serves the SPA
// bundle; enable a tuned CSP at the CDN/proxy layer if desired.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS: same-origin by default (the SPA is served by this server). To allow
// external origins (e.g. a separate web deployment), set CORS_ORIGINS to a
// comma-separated allowlist.
const corsOrigins = (process.env["CORS_ORIGINS"] ?? "").split(",").map((o) => o.trim()).filter(Boolean);
app.use(cors(corsOrigins.length > 0 ? { origin: corsOrigins } : { origin: false }));

// Rate limiting: a global ceiling plus a strict window on auth endpoints
// (login/registration brute-force protection).
app.use("/api", rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));
app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "rate_limited", message: "Too many attempts. Try again later." } }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Unified deployment ───────────────────────────────────────────────────────
// When STATIC_DIR is set (e.g. ../app/dist), this server also serves the built
// frontend with an SPA fallback, so the app and the /api routes share one
// origin — no separate web server or proxy needed. API routes stay untouched.
const staticDir = process.env["STATIC_DIR"];
if (staticDir) {
  const resolved = path.resolve(staticDir);

  // Legacy bare /admin URLs → admin console under /brands (before SPA fallback).
  app.get("/admin", (_req, res) => res.redirect(301, "/brands/admin/dashboard"));
  app.get(/^\/admin\/(.+)/, (req, res) => {
    const rest = req.path.replace(/^\/admin\/?/, "");
    res.redirect(301, `/brands/admin/${rest}`);
  });

  app.use(express.static(resolved));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(resolved, "index.html"));
  });
  logger.info({ staticDir: resolved }, "Serving frontend (SPA fallback enabled)");
}

export default app;
