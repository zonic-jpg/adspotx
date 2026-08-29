import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { checkDatabaseConnection } from "../lib/db-health";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  const db = await checkDatabaseConnection();
  const status = db.ok ? "ok" : "degraded";
  const data = HealthCheckResponse.parse({ status });
  if (!db.ok) {
    res.status(503).json({
      ...data,
      db: db.placeholder ? "misconfigured" : "unreachable",
      detail: db.error,
    });
    return;
  }
  res.json({ ...data, db: "connected", latencyMs: db.latencyMs });
});

// ─── Types ────────────────────────────────────────────────────────────────────
type CheckStatus = "ok" | "warning" | "error";
type OverallStatus = "healthy" | "degraded" | "critical";

interface Fallback {
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  active: boolean;
}

interface FixOption {
  id: string;
  label: string;
  description: string;
  hint?: string;
}

interface DependencyCheck {
  id: string;
  name: string;
  category: "database" | "security" | "storage" | "runtime" | "network";
  status: CheckStatus;
  message: string;
  detail?: string;
  latencyMs?: number;
  fallbacks: Fallback[];
  fixOptions: FixOption[];
}

// ─── Database check ───────────────────────────────────────────────────────────
async function checkDatabase(): Promise<DependencyCheck> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    const latencyMs = Date.now() - start;

    const isSlowResponse = latencyMs > 500;
    const status: CheckStatus = isSlowResponse ? "warning" : "ok";

    return {
      id: "database",
      name: "PostgreSQL Database",
      category: "database",
      status,
      message: status === "ok"
        ? `Connected · ${latencyMs}ms · ${pool.idleCount}/${pool.totalCount} idle connections`
        : `Connected but slow · ${latencyMs}ms response (threshold: 500ms)`,
      detail: isSlowResponse
        ? "High latency may cause review session timeouts and degraded UX for reviewers. Check for table bloat or lock contention."
        : undefined,
      latencyMs,
      fallbacks: [
        { tier: 1, name: "In-memory query cache", description: "Serve recent results from short-lived in-process cache (up to 60s stale data)", active: false },
        { tier: 2, name: "Read-only degraded mode", description: "Disable write operations (no new reviews/points), continue serving cached reads", active: false },
        { tier: 3, name: "Maintenance mode", description: "Return 503 with a user-facing maintenance page; queue requests for retry when DB recovers", active: false },
      ],
      fixOptions: isSlowResponse ? [
        { id: "db-analyze", label: "Run ANALYZE", description: "Update query planner statistics to improve query speed", hint: "ANALYZE VERBOSE; (run in your DB console)" },
        { id: "db-pool-size", label: "Increase pool size", description: "Allow more concurrent DB connections to prevent queuing", hint: "Set PG_POOL_MAX env var (default: 10)" },
        { id: "db-slow-queries", label: "Find slow queries", description: "Identify queries taking longest using pg_stat_statements", hint: "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;" },
      ] : [],
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const errMessage = err instanceof Error ? err.message : String(err);
    return {
      id: "database",
      name: "PostgreSQL Database",
      category: "database",
      status: "error",
      message: "Cannot connect to database",
      detail: errMessage,
      latencyMs,
      fallbacks: [
        { tier: 1, name: "In-memory cache", description: "Serve last-known-good query results from in-process cache", active: true },
        { tier: 2, name: "Read-only degraded mode", description: "Disable writes; serve any cached data with a degraded-mode banner", active: false },
        { tier: 3, name: "Maintenance mode", description: "Show all users a maintenance page; log all incoming requests for replay", active: false },
      ],
      fixOptions: [
        {
          id: "db-url-check",
          label: "Verify DATABASE_URL",
          description: "Confirm the DATABASE_URL environment variable is correctly set and points to a running database",
          hint: process.env["DATABASE_URL"]
            ? "Variable is set (value hidden for security)"
            : "⚠ DATABASE_URL is NOT set in this environment",
        },
        { id: "db-reconnect", label: "Restart connection pool", description: "Restart the API Server workflow to reinitialise the pg pool", hint: "Use the Workflows panel → API Server → Restart" },
        { id: "db-provision", label: "Provision new database", description: "Create a fresh PostgreSQL database via the Replit Database tool", hint: "Replit sidebar → Database → Create Database" },
      ],
    };
  }
}

// ─── JWT security check ───────────────────────────────────────────────────────
function checkJwtSecurity(): DependencyCheck {
  const secret = process.env["JWT_SECRET"];
  const isDefault = !secret || secret === "adspot-dev-secret-change-in-prod";
  const isProd = process.env["NODE_ENV"] === "production";
  const status: CheckStatus = isProd && isDefault ? "error" : isDefault ? "warning" : "ok";

  return {
    id: "jwt-security",
    name: "JWT Authentication Secret",
    category: "security",
    status,
    message: isDefault
      ? isProd
        ? "Using default dev secret in production — tokens can be forged"
        : "Default dev secret in use (acceptable only in development)"
      : "Custom secret configured",
    detail: isDefault
      ? "Anyone with access to the source code can forge valid authentication tokens, bypassing all role-based access controls."
      : undefined,
    fallbacks: [
      { tier: 1, name: "Force re-login", description: "Immediately invalidate all sessions and require re-authentication after secret rotation", active: false },
      { tier: 2, name: "IP-restricted admin", description: "Temporarily restrict admin endpoints to known IP addresses while rotating secret", active: false },
    ],
    fixOptions: isDefault ? [
      {
        id: "jwt-set-secret",
        label: "Set JWT_SECRET",
        description: "Add a cryptographically strong random secret as a Replit Secret",
        hint: "Generate: openssl rand -hex 64",
      },
    ] : [],
  };
}

// ─── Object storage check ─────────────────────────────────────────────────────
function checkObjectStorage(): DependencyCheck {
  const paths = process.env["PUBLIC_OBJECT_SEARCH_PATHS"];
  const cloudConfigured = Boolean(paths && paths.trim().length > 0);
  const localEnabled = !process.env["PRIVATE_OBJECT_DIR"]?.trim() || process.env["LOCAL_OBJECT_STORAGE"] === "1";
  const isConfigured = cloudConfigured || localEnabled;
  const bucketCount = cloudConfigured ? paths!.split(",").filter(Boolean).length : 0;

  return {
    id: "object-storage",
    name: "Object Storage (Ad Media)",
    category: "storage",
    status: isConfigured ? "ok" : "warning",
    message: cloudConfigured
      ? `Configured · ${bucketCount} bucket path${bucketCount !== 1 ? "s" : ""} registered`
      : localEnabled
        ? "Local disk storage · uploads served from .data/uploads"
        : "Not configured — ad media uploads will fail",
    detail: isConfigured
      ? undefined
      : "Brands cannot upload video or image ad creatives without object storage. Review sessions can still run on URL-linked media.",
    fallbacks: [
      { tier: 1, name: "URL-only ad mode", description: "Accept external media URLs (YouTube, Vimeo, CDN links) instead of direct uploads", active: !isConfigured },
      { tier: 2, name: "Local disk storage", description: "Store uploads under .data/uploads when cloud storage is not configured", active: localEnabled && !cloudConfigured },
      { tier: 3, name: "Upload disabled", description: "Disable the upload UI entirely and show a 'storage unavailable' notice to brands", active: false },
    ],
    fixOptions: isConfigured ? [] : [
      { id: "storage-configure", label: "Configure storage bucket", description: "Set PUBLIC_OBJECT_SEARCH_PATHS to a Replit Object Storage path", hint: "Example: my-bucket/ads,my-bucket/thumbnails" },
      { id: "storage-create", label: "Create storage bucket", description: "Use the Replit Object Storage tool to create a new bucket", hint: "Replit sidebar → Object Storage → New Bucket" },
    ],
  };
}

// ─── Memory check ─────────────────────────────────────────────────────────────
function checkMemory(): DependencyCheck {
  const mem = process.memoryUsage();
  const heapUsedMB = Math.round(mem.heapUsed / 1024 / 1024);
  const heapTotalMB = Math.round(mem.heapTotal / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  const pct = Math.round((mem.heapUsed / mem.heapTotal) * 100);
  const status: CheckStatus = pct > 85 ? "error" : pct > 70 ? "warning" : "ok";

  return {
    id: "memory",
    name: "Server Memory (Heap)",
    category: "runtime",
    status,
    message: `${heapUsedMB} MB / ${heapTotalMB} MB heap (${pct}%) · ${rssMB} MB RSS`,
    detail: status !== "ok"
      ? `Memory pressure at ${pct}%. Sustained high usage can trigger OOM kills and cause silent request failures during peak review load.`
      : undefined,
    fallbacks: [
      { tier: 1, name: "GC hint", description: "Hint V8 to schedule a full garbage collection cycle on the next idle tick", active: false },
      { tier: 2, name: "Request throttling", description: "Cap concurrent review sessions to reduce per-request memory allocation", active: false },
      { tier: 3, name: "Graceful restart", description: "Drain active WebSocket connections then restart the process to fully clear heap", active: false },
    ],
    fixOptions: status !== "ok" ? [
      { id: "memory-restart", label: "Restart API server", description: "Restart the API Server workflow to reclaim all heap memory", hint: "Workflows panel → API Server → Restart" },
      { id: "memory-gc", label: "Force GC (if --expose-gc)", description: "Call global.gc() if the --expose-gc V8 flag is set at startup", hint: "Add --expose-gc to your Node.js start command" },
    ] : [],
  };
}

// ─── Environment variables check ─────────────────────────────────────────────
function checkEnvVars(): DependencyCheck {
  const required = [
    { key: "DATABASE_URL", label: "Database connection string" },
    { key: "PORT", label: "HTTP server port" },
  ];
  const recommended = [
    { key: "JWT_SECRET", label: "JWT signing secret" },
    { key: "NODE_ENV", label: "Node environment (development/production)" },
    { key: "PUBLIC_OBJECT_SEARCH_PATHS", label: "Object storage bucket paths" },
    { key: "LOG_LEVEL", label: "Pino log verbosity level" },
  ];

  const missingRequired = required.filter(v => !process.env[v.key]);
  const missingRecommended = recommended.filter(v => !process.env[v.key]);
  const status: CheckStatus = missingRequired.length > 0 ? "error" : missingRecommended.length > 0 ? "warning" : "ok";

  const message = missingRequired.length > 0
    ? `Missing required vars: ${missingRequired.map(v => v.key).join(", ")}`
    : missingRecommended.length > 0
    ? `${required.length} required set · ${missingRecommended.length} recommended unset`
    : `All ${required.length + recommended.length} tracked variables present`;

  return {
    id: "environment",
    name: "Environment Variables",
    category: "runtime",
    status,
    message,
    detail: missingRecommended.length > 0
      ? `Unset: ${missingRecommended.map(v => v.key).join(", ")}`
      : undefined,
    fallbacks: [],
    fixOptions: [
      ...missingRequired.map(v => ({ id: `env-${v.key}`, label: `Set ${v.key}`, description: `Required: ${v.label}`, hint: "Add via Replit Secrets panel (lock icon in sidebar)" })),
      ...missingRecommended.map(v => ({ id: `env-${v.key}`, label: `Set ${v.key}`, description: `Recommended: ${v.label}`, hint: "Add via Replit Secrets panel" })),
    ],
  };
}

// ─── Uptime check ─────────────────────────────────────────────────────────────
function checkUptime(): DependencyCheck {
  const secs = process.uptime();
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const label = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m ${Math.floor(secs % 60)}s`;

  return {
    id: "uptime",
    name: "API Server Process",
    category: "runtime",
    status: "ok",
    message: `Running for ${label} · Node.js ${process.version} · ${process.platform}`,
    fallbacks: [],
    fixOptions: [],
  };
}

// ─── GET /admin/health ────────────────────────────────────────────────────────
router.get("/admin/health", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const [dbCheck, memCheck] = await Promise.all([
      checkDatabase(),
      Promise.resolve(checkMemory()),
    ]);

    const checks: DependencyCheck[] = [
      dbCheck,
      checkJwtSecurity(),
      checkObjectStorage(),
      memCheck,
      checkEnvVars(),
      checkUptime(),
    ];

    const errorCount = checks.filter(c => c.status === "error").length;
    const warnCount  = checks.filter(c => c.status === "warning").length;
    const status: OverallStatus = errorCount > 0 ? "critical" : warnCount > 0 ? "degraded" : "healthy";

    const summary = errorCount > 0
      ? `${errorCount} critical issue${errorCount !== 1 ? "s" : ""} require${errorCount === 1 ? "s" : ""} immediate attention`
      : warnCount > 0
      ? `${warnCount} warning${warnCount !== 1 ? "s" : ""} detected — system operational`
      : "All systems operational";

    res.json({ status, summary, checks, checkedAt: new Date().toISOString(), uptime: Math.floor(process.uptime()) });
  } catch (err) {
    res.status(500).json({ error: "Health check runner failed", detail: String(err) });
  }
});

export default router;
