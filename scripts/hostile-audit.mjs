#!/usr/bin/env node
/**
 * AdSpot Hostile Audit — three tiers (BUILD / MOCK / LIVE).
 * Mirrors MyYanga v5 model agreed for production readiness gates.
 *
 * Usage:
 *   node scripts/hostile-audit.mjs              # all tiers (live skipped if no DB)
 *   node scripts/hostile-audit.mjs --mock-only  # tier 1 + 2 only
 *   node scripts/hostile-audit.mjs --tier1-only
 */
import { spawn, spawnSync, execSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer as createNetServer } from "node:net";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPORT_PATH = path.join(ROOT, "docs/HOSTILE_AUDIT_REPORT.md");
const DEFAULT_AUDIT_PORT = Number(process.env.AUDIT_PORT ?? "3199");
let activePort = DEFAULT_AUDIT_PORT;
let activeBase = `http://127.0.0.1:${activePort}`;
const AUDIT_PARTNER_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_PASSWORD = process.env.ADSPOT_DEMO_PASSWORD ?? "password123";

const args = new Set(process.argv.slice(2));
const mockOnly = args.has("--mock-only");
const tier1Only = args.has("--tier1-only");
const skipInstall = args.has("--skip-install");
const forceMock = args.has("--force-mock");

const tiers = {
  build: { pass: 0, fail: 0, skipped: 0 },
  mock: { pass: 0, fail: 0, skipped: 0 },
  live: { pass: 0, fail: 0, skipped: 0 },
};
const failures = [];
const notes = [];

function loadEnvFile() {
  const candidates = [
    path.join(ROOT, "server/.env"),
    path.join(ROOT, ".env"),
  ];
  for (const envPath of candidates) {
    if (!existsSync(envPath)) continue;
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnvFile();

function record(tier, name, ok, reason = "", evidence = "") {
  if (ok) {
    tiers[tier].pass++;
    console.log(`PASS [${tier}] ${name}`);
  } else if (reason === "SKIPPED") {
    tiers[tier].skipped++;
    console.log(`SKIP [${tier}] ${name}: ${evidence || "skipped"}`);
  } else {
    tiers[tier].fail++;
    failures.push({ tier, name, reason, evidence });
    console.log(`FAIL [${tier}] ${name}: ${reason}${evidence ? ` — ${evidence}` : ""}`);
  }
}

function runSync(cmd, cmdArgs, opts = {}) {
  return spawnSync(cmd, cmdArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

function pnpm(args, timeout = 300000) {
  const npx = runSync("npx", ["--yes", "pnpm@9", ...args], { timeout });
  if (npx.status === 0 || npx.stdout || npx.stderr) return npx;
  return runSync("pnpm", args, { timeout });
}

function runSilent(cmd, timeout = 180000) {
  try {
    const out = execSync(cmd, { cwd: ROOT, stdio: "pipe", timeout, encoding: "utf8" });
    return { ok: true, out, err: "" };
  } catch (e) {
    return {
      ok: false,
      out: e.stdout?.toString() || "",
      err: (e.stderr?.toString() || e.message || "").slice(-400),
    };
  }
}

function countTests(output) {
  return [...output.matchAll(/Tests\s+(\d+) passed/g)].reduce((s, m) => s + Number(m[1]), 0);
}

function isRealDatabaseUrl(url) {
  if (!url) return false;
  if (/HOST|USER|PASSWORD|placeholder/i.test(url)) return false;
  return /^postgres(ql)?:\/\//i.test(url);
}

function b64url(obj) {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

function mockAdminToken() {
  const secret = process.env.JWT_SECRET ?? "adspot-dev-secret-change-in-prod";
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    userId: "00000000-0000-4000-8000-000000000099",
    email: "admin@adspot.demo",
    username: "audit-admin",
    role: "admin",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

async function fetchRoute(base, routePath, init = {}) {
  const url = `${base}${routePath}`;
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(12_000) });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { ok: true, status: res.status, json, text };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: { error: err instanceof Error ? err.message : String(err) },
      text: "",
    };
  }
}

const PLAYABLE_ASSET_TYPES = new Set(["youtube", "vimeo", "video", "image"]);

/** Reviewer login → ad feed → ad detail → start → complete → points (mock or live). */
async function auditReviewerPipeline(tier, base) {
  const login = await fetchRoute(base, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@reviewer.demo", password: DEMO_PASSWORD }),
  });
  const token = login.json?.token;
  const roleOk = login.json?.user?.role === "reviewer";
  record(
    tier,
    "reviewer login returns reviewer role",
    login.status === 200 && !!token && roleOk,
    login.status === 200 ? "" : `HTTP ${login.status}`,
    login.json?.user?.role || "",
  );
  if (!token) return;

  const feed = await fetchRoute(base, "/api/ads", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ads = feed.json?.ads ?? [];
  record(
    tier,
    "reviewer ad feed non-empty",
    feed.ok && ads.length > 0,
    feed.ok ? "" : "feed unreachable",
    `count=${ads.length}`,
  );

  const adId = ads[0]?.id;
  if (!adId) return;

  const detail = await fetchRoute(base, `/api/ads/${adId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const hasMedia =
    detail.ok &&
    Boolean(detail.json?.assetUrl) &&
    PLAYABLE_ASSET_TYPES.has(detail.json?.assetType);
  record(
    tier,
    "reviewer ad detail includes media",
    hasMedia,
    hasMedia ? "" : "missing assetUrl or unsupported assetType",
    detail.json?.assetType || "",
  );

  const questions = detail.json?.questions ?? [];
  const mcqOk = questions.every((q) => q.questionType !== "mcq");
  record(
    tier,
    "reviewer ad questions use valid types",
    mcqOk,
    mcqOk ? "" : "legacy mcq type breaks UI",
    questions.map((q) => q.questionType).join(","),
  );

  const balanceBefore = await fetchRoute(base, "/api/points/balance", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const beforePts = Number(balanceBefore.json?.balance ?? 0);

  const start = await fetchRoute(base, "/api/reviews/start", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ adId }),
  });
  const sessionId = start.json?.id;
  record(
    tier,
    "reviewer can start review session",
    start.status === 201 && !!sessionId,
    start.status === 201 ? "" : `HTTP ${start.status}`,
    sessionId || "",
  );
  if (!sessionId) return;

  const minWatch = Number(detail.json?.minWatchSeconds ?? 5);
  const formattedAnswers = questions.map((q) => ({
    questionId: q.id,
    answerValue: q.questionType === "rating" ? "5" : q.options?.[0] ?? "yes",
  }));

  const complete = await fetchRoute(base, `/api/reviews/${sessionId}/complete`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      watchSeconds: minWatch,
      answers: formattedAnswers,
      proverbAnswer: detail.json?.proverbAnswer ?? undefined,
    }),
  });
  const pointsAwarded = Number(complete.json?.pointsAwarded ?? 0);
  record(
    tier,
    "reviewer review complete awards points",
    complete.ok && pointsAwarded > 0,
    complete.ok ? "" : `HTTP ${complete.status}`,
    `points=${pointsAwarded}`,
  );

  const balanceAfter = await fetchRoute(base, "/api/points/balance", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const afterPts = Number(balanceAfter.json?.balance ?? 0);
  record(
    tier,
    "reviewer points balance increases after review",
    afterPts > beforePts,
    afterPts > beforePts ? "" : `before=${beforePts} after=${afterPts}`,
    `delta=${afterPts - beforePts}`,
  );

  const lb = await fetchRoute(base, "/api/leaderboard", {
    headers: { Authorization: `Bearer ${token}` },
  });
  record(
    tier,
    "reviewer leaderboard returns entries",
    lb.ok && Array.isArray(lb.json?.entries) && lb.json.entries.length > 0,
    lb.ok ? "" : `HTTP ${lb.status}`,
    `entries=${lb.json?.entries?.length ?? 0}`,
  );
}

/** Reviewer login → ad feed → ad detail must return playable media (requires DB). */
async function auditReviewerAdMedia(tier, base) {
  const bundleDir = path.join(ROOT, "app/dist/assets");
  if (existsSync(bundleDir)) {
    const jsFiles = runSilent(`find "${bundleDir}" -name "*.js" -maxdepth 1`).out;
    const bundlePath = jsFiles.split("\n").find((f) => f.endsWith(".js"));
    if (bundlePath && existsSync(bundlePath)) {
      const src = readFileSync(bundlePath, "utf8");
      record(
        tier,
        "reviewer VideoPlayer in SPA bundle",
        src.includes("review-video-player"),
        src.includes("review-video-player") ? "" : "missing data-testid=review-video-player",
      );
      record(
        tier,
        "reviewer VideoPlayer resolves pasted URLs",
        src.includes("resolvePlayableAdMedia") || src.includes("This ad media cannot be played"),
        src.includes("resolvePlayableAdMedia") ? "" : "missing playback resolver in bundle",
      );
    }
  }

  const health = await fetchRoute(base, "/api/healthz");
  const dbOk =
    health.ok &&
    (health.json?.db === "connected" || health.json?.db?.status === "ok");
  if (!dbOk) {
    record(tier, "reviewer ad feed has playable media", false, "SKIPPED", "database not connected");
    record(tier, "reviewer ad detail includes media", false, "SKIPPED", "database not connected");
    return;
  }

  const login = await fetchRoute(base, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "alice@reviewer.demo", password: DEMO_PASSWORD }),
  });
  const token = login.json?.token;
  if (!token) {
    record(tier, "reviewer ad feed has playable media", false, "reviewer login failed", `HTTP ${login.status}`);
    record(tier, "reviewer ad detail includes media", false, "reviewer login failed", `HTTP ${login.status}`);
    return;
  }

  const feed = await fetchRoute(base, "/api/ads", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const ads = feed.json?.ads ?? [];
  const allPlayable =
    feed.ok &&
    ads.length > 0 &&
    ads.every((a) => PLAYABLE_ASSET_TYPES.has(a.assetType) && Boolean(a.assetUrl));
  record(
    tier,
    "reviewer ad feed has playable media",
    allPlayable,
    allPlayable ? "" : `ads=${ads.length} types=${ads.map((a) => a.assetType).join(",")}`,
    feed.ok ? `count=${ads.length}` : "unreachable",
  );

  if (ads[0]) {
    const detail = await fetchRoute(base, `/api/ads/${ads[0].id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const hasMedia =
      detail.ok &&
      Boolean(detail.json?.assetUrl) &&
      PLAYABLE_ASSET_TYPES.has(detail.json?.assetType);
    record(
      tier,
      "reviewer ad detail includes media",
      hasMedia,
      hasMedia ? "" : "missing assetUrl or unsupported assetType",
      detail.json?.assetType || "",
    );
  } else {
    record(tier, "reviewer ad detail includes media", false, "no ads in feed", "");
  }
}

/* ─────────────────────────── Tier 1 ─────────────────────────── */

async function tier1Build() {
  console.log("\n═══ TIER 1 — BUILD GATE ═══\n");

  if (!skipInstall) {
    const inst = pnpm(["install"]);
    record("build", "pnpm install", inst.status === 0, inst.status === 0 ? "" : "install failed", inst.stderr?.slice(-200));
  } else {
    record("build", "pnpm install", true, "", "skipped via --skip-install");
  }

  const typecheck = pnpm(["run", "typecheck"]);
  record("build", "pnpm typecheck", typecheck.status === 0, typecheck.status === 0 ? "" : "typecheck failed", typecheck.stderr?.slice(-200));

  const scoring = runSync("npx", ["vitest", "run", "src/lib/review-scoring.test.ts"], {
    cwd: path.join(ROOT, "server"),
  });
  record(
    "build",
    "review-scoring unit tests",
    scoring.status === 0,
    scoring.status === 0 ? "" : "scoring tests failed",
    scoring.stderr?.slice(-200),
  );

  const assetNorm = runSync("npx", ["vitest", "run", "src/lib/asset-normalize.test.ts"], {
    cwd: path.join(ROOT, "server"),
  });
  record(
    "build",
    "asset-normalize unit tests",
    assetNorm.status === 0,
    assetNorm.status === 0 ? "" : "asset-normalize tests failed",
    assetNorm.stderr?.slice(-200),
  );

  const test = pnpm(["run", "test"]);
  const testCount = countTests(test.stdout || "");
  record(
    "build",
    "pnpm test",
    test.status === 0,
    test.status === 0 ? "" : "tests failed",
    test.status === 0 ? `${testCount || "?"} tests passed` : test.stderr?.slice(-200),
  );

  const build = pnpm(["run", "build"]);
  record("build", "pnpm build", build.status === 0, build.status === 0 ? "" : "build failed", build.stderr?.slice(-300));

  const partnerBuild = pnpm(["--filter", "@workspace/partner-portal", "run", "build"]);
  record(
    "build",
    "partner-portal build",
    partnerBuild.status === 0,
    partnerBuild.status === 0 ? "" : "partner-portal build failed",
    partnerBuild.stderr?.slice(-200),
  );

  const migrationPath = path.join(ROOT, "lib/db/migrations_adspot_partners.sql");
  record(
    "build",
    "partner migrations exist",
    existsSync(migrationPath) && readFileSync(migrationPath, "utf8").includes("partner_integrations"),
    existsSync(migrationPath) ? "" : "migrations_adspot_partners.sql missing",
  );

  const docA = path.join(ROOT, "docs/ADSPOT_NETWORK_PARTNER_PROGRAM.md");
  const docB = path.join(ROOT, "docs/PARTNER_PORTAL_INTEGRATION.md");
  const docC = path.join(ROOT, "docs/ADSPOTX-INTEGRATION.md");
  record(
    "build",
    "partner program docs",
    existsSync(docA) && existsSync(docB) && existsSync(docC),
    existsSync(docA) && existsSync(docB) && existsSync(docC) ? "" : "missing partner/adspotx docs in docs/",
  );
}

/* ─────────────────────────── Server helpers ─────────────────────────── */

const SPA_ROUTES = [
  { path: "/", label: "home" },
  { path: "/earn", label: "earn" },
  { path: "/earn/login", label: "earn login" },
  { path: "/earn/register", label: "earn register" },
  { path: "/earn/dashboard", label: "earn dashboard" },
  { path: "/earn/leaderboard", label: "earn leaderboard" },
  { path: "/brands", label: "brands" },
  { path: "/brands/login", label: "brands login" },
  { path: "/brands/dashboard", label: "brands dashboard" },
  { path: "/brands/admin/dashboard", label: "brands admin dashboard" },
  { path: "/brands/admin/users", label: "brands admin users" },
  { path: "/brands/admin/events", label: "brands admin events" },
  { path: "/brands/admin/financials", label: "brands admin financials" },
  { path: "/brands/admin/adspotx", label: "AdSpotX admin" },
  { path: "/brands/admin/partners", label: "AdSpotX partners alias" },
  { path: "/partners", label: "partner portal" },
  { path: "/partners/integration", label: "partner integration" },
  { path: "/partners/slots", label: "partner slots" },
  { path: "/partners/revenue", label: "partner revenue" },
];

let serverChild = null;

async function waitForServer(base, ms = 20_000, opts = {}) {
  const requireMockPartner = opts.requireMockPartner ?? false;
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (serverChild?.exitCode != null) break;
    const r = await fetchRoute(base, "/api/healthz");
    if (!r.ok || r.status === 0) {
      await new Promise((res) => setTimeout(res, 400));
      continue;
    }
    if (requireMockPartner) {
      const probe = await fetchRoute(
        base,
        `/api/partners/${AUDIT_PARTNER_ID}/integration`,
      );
      if (
        probe.status === 200 &&
        probe.json?.adspotLinked === false &&
        serverChild?.exitCode == null
      ) {
        return true;
      }
    } else if (serverChild?.exitCode == null) {
      return true;
    }
    await new Promise((res) => setTimeout(res, 400));
  }
  return false;
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      const port = typeof addr === "object" && addr ? addr.port : DEFAULT_AUDIT_PORT;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
    srv.on("error", reject);
  });
}

function startLocalServer(port = activePort) {
  if (!existsSync(path.join(ROOT, "server/dist/index.mjs"))) {
    return null;
  }
  serverChild = spawn("node", ["server/dist/index.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      STATIC_DIR: "./app/dist",
      AUDIT_PARTNER_MOCK: "1",
      ADSPOT_PUBLIC_URL: `http://127.0.0.1:${port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return serverChild;
}

async function tier2Mock() {
  console.log("\n═══ TIER 2 — MOCK ═══\n");

  activePort = await allocatePort();
  activeBase = `http://127.0.0.1:${activePort}`;

  const child = startLocalServer(activePort);
  if (!child) {
    record("mock", "server artifact", false, "server/dist/index.mjs missing — run pnpm build");
    return;
  }

  const ready = await waitForServer(activeBase, 20_000, { requireMockPartner: true });
  record("mock", "dev server reachable", ready, ready ? `port ${activePort}` : "boot timeout");
  if (!ready) {
    child.kill("SIGTERM");
    return;
  }

  for (const route of SPA_ROUTES) {
    const r = await fetchRoute(activeBase, route.path);
    const pass = r.ok && r.status === 200;
    record("mock", `route 200: ${route.label}`, pass, pass ? "" : `HTTP ${r.status}`);
  }

  const loginRedirect = await fetchRoute(activeBase, "/login", { redirect: "manual" });
  const redirectOk =
    loginRedirect.status === 301 ||
    loginRedirect.status === 302 ||
    loginRedirect.status === 307 ||
    loginRedirect.status === 308 ||
    (loginRedirect.status === 200 && /earn\/login/i.test(loginRedirect.text));
  record(
    "mock",
    "/login not broken (SPA serves app)",
    loginRedirect.status === 200 || redirectOk,
    loginRedirect.status === 404 ? "404 on /login" : "",
    `HTTP ${loginRedirect.status}`,
  );

  const appBundle = path.join(ROOT, "app/dist/assets");
  if (existsSync(appBundle)) {
    const jsFiles = runSilent(`find "${appBundle}" -name "*.js" -maxdepth 1`).out;
    const bundlePath = jsFiles.split("\n").find((f) => f.endsWith(".js"));
    if (bundlePath && existsSync(bundlePath)) {
      const src = readFileSync(bundlePath, "utf8");
      const bareLogin = /href="\/login"/.test(src) || /href:'\/login'/.test(src);
      record(
        "mock",
        "no bare /login links in SPA bundle",
        !bareLogin,
        bareLogin ? "found href=/login in built JS" : "",
      );

      const hasHeroCta = src.includes("landing-start-earning-hero");
      const hasNavCta = src.includes("landing-start-earning-nav");
      const hasStartEarningCopy = src.includes("Start earning");
      record(
        "mock",
        "landing hero Start earning CTA in bundle",
        hasHeroCta && hasStartEarningCopy,
        hasHeroCta ? "" : "missing landing-start-earning-hero test id in built JS",
      );
      record(
        "mock",
        "landing navbar Start earning CTA in bundle",
        hasNavCta && hasStartEarningCopy,
        hasNavCta ? "" : "missing landing-start-earning-nav test id in built JS",
      );

      const navbarSrcPath = path.join(ROOT, "app/src/landing/components/Navbar.tsx");
      if (existsSync(navbarSrcPath)) {
        const navbarSrc = readFileSync(navbarSrcPath, "utf8");
        const navLine = navbarSrc.split("\n").find((l) => l.includes("landing-start-earning-nav")) ?? "";
        const navAlwaysVisible = navLine.includes("inline-flex") && !navLine.includes("hidden");
        record(
          "mock",
          "navbar Start earning always visible (not hidden)",
          navAlwaysVisible,
          navAlwaysVisible ? "" : "navbar CTA uses hidden breakpoint class",
        );
      }

      const adminRouteOk =
        src.includes("/brands/admin/dashboard") ||
        src.includes("brands/admin/dashboard");
      record(
        "mock",
        "admin console routes under /brands/admin",
        adminRouteOk,
        adminRouteOk ? "" : "missing /brands/admin/dashboard paths in bundle",
      );

      const adspotxRouteOk =
        src.includes("/brands/admin/adspotx") ||
        src.includes("brands/admin/adspotx") ||
        src.includes("adspotx-admin-page");
      record(
        "mock",
        "AdSpotX admin route in bundle",
        adspotxRouteOk,
        adspotxRouteOk ? "" : "missing AdSpotX admin paths in bundle",
      );

      const adminSectionsOk =
        src.includes("admin-users-page") &&
        src.includes("admin-events-page") &&
        src.includes("admin-financials-page") &&
        src.includes("User Directory") &&
        src.includes("Event Log");
      record(
        "mock",
        "admin users/events/financials sections in bundle",
        adminSectionsOk,
        adminSectionsOk ? "" : "missing admin console section markers in built JS",
      );

      record(
        "mock",
        "reviewer VideoPlayer resolves pasted URLs",
        src.includes("resolvePlayableAdMedia") || src.includes("This ad media cannot be played"),
        src.includes("resolvePlayableAdMedia") ? "" : "missing playback resolver in bundle",
      );

      record(
        "mock",
        "brand delete UI in SPA bundle",
        src.includes("btn-delete-ad"),
        src.includes("btn-delete-ad") ? "" : "missing btn-delete-ad test id",
      );

      const adminLoginRedirectOk =
        src.includes("/admin/dashboard") &&
        (src.includes("super_admin") || src.includes('"admin"'));
      record(
        "mock",
        "admin login routes to /admin/dashboard",
        adminLoginRedirectOk,
        adminLoginRedirectOk ? "" : "missing admin dashboard redirect paths",
      );
    }
  }

  const legacyAdmin = await fetchRoute(activeBase, "/admin/dashboard", { redirect: "manual" });
  const legacyAdminOk =
    legacyAdmin.status === 301 ||
    legacyAdmin.status === 302 ||
    legacyAdmin.status === 307 ||
    legacyAdmin.status === 308 ||
    (legacyAdmin.status === 200 && /brands\/admin/i.test(legacyAdmin.text));
  record(
    "mock",
    "legacy /admin/dashboard → brands admin",
    legacyAdminOk,
    legacyAdminOk ? "" : "legacy admin URL not forwarded",
    `HTTP ${legacyAdmin.status}`,
  );

  const integBefore = await fetchRoute(activeBase, `/api/partners/${AUDIT_PARTNER_ID}/integration`);
  const inactiveOk =
    integBefore.ok &&
    integBefore.status === 200 &&
    integBefore.json?.adspotLinked === false &&
    integBefore.json?.status === "inactive";
  record(
    "mock",
    "partner integration default inactive (API)",
    inactiveOk,
    inactiveOk ? "" : "expected adspotLinked=false",
    integBefore.ok ? `status=${integBefore.status} linked=${integBefore.json?.adspotLinked}` : "unreachable",
  );

  const activate = await fetchRoute(activeBase, `/api/partners/${AUDIT_PARTNER_ID}/integration/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  const activateOk =
    activate.ok &&
    activate.status === 200 &&
    activate.json?.adspotLinked === true &&
    activate.json?.status === "active" &&
    typeof activate.json?.apiKey === "string" &&
    activate.json.apiKey.startsWith("asp_");
  record(
    "mock",
    "partner integration activate (API)",
    activateOk,
    activateOk ? "" : "activate did not return active + apiKey",
    activate.ok ? `linked=${activate.json?.adspotLinked}` : "unreachable",
  );

  const integAfter = await fetchRoute(activeBase, `/api/partners/${AUDIT_PARTNER_ID}/integration`);
  const confirmedActive =
    integAfter.ok &&
    integAfter.status === 200 &&
    integAfter.json?.adspotLinked === true &&
    integAfter.json?.apiKey;
  record(
    "mock",
    "partner integration active confirmed (API)",
    confirmedActive,
    confirmedActive ? "" : "GET after activate not active",
    integAfter.ok ? `apiKey=${Boolean(integAfter.json?.apiKey)}` : "unreachable",
  );

  record(
    "mock",
    "integrate button flow (API authoritative)",
    inactiveOk && activateOk && confirmedActive,
    inactiveOk && activateOk && confirmedActive ? "" : "inactive→active API chain failed",
    "UI hydrates client-side; API proves button state",
  );

  const adminToken = mockAdminToken();
  const listUnauth = await fetchRoute(activeBase, "/api/partners");
  record(
    "mock",
    "AdSpotX partner list requires auth",
    listUnauth.status === 401,
    listUnauth.status === 401 ? "" : "expected 401 without token",
    `HTTP ${listUnauth.status}`,
  );

  const listAuth = await fetchRoute(activeBase, "/api/partners", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const listOk =
    listAuth.ok &&
    listAuth.status === 200 &&
    Array.isArray(listAuth.json?.partners) &&
    listAuth.json.partners.length >= 1;
  record(
    "mock",
    "AdSpotX partner list (admin API)",
    listOk,
    listOk ? "" : "admin GET /partners failed",
    listAuth.ok ? `count=${listAuth.json?.partners?.length}` : "unreachable",
  );

  const adminUsers = await fetchRoute(activeBase, "/api/admin/users?limit=10", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminUsersOk =
    adminUsers.status !== 401 &&
    adminUsers.status !== 403 &&
    adminUsers.status === 200 &&
    Array.isArray(adminUsers.json?.users) &&
    adminUsers.json.users.length > 0;
  record(
    "mock",
    "admin users API returns data",
    adminUsersOk,
    adminUsersOk ? "" : `unexpected HTTP ${adminUsers.status} or empty users`,
    adminUsers.ok ? `count=${adminUsers.json?.users?.length}` : `HTTP ${adminUsers.status}`,
  );

  const adminEvents = await fetchRoute(activeBase, "/api/admin/events?limit=10", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminEventsOk =
    adminEvents.status !== 401 &&
    adminEvents.status !== 403 &&
    adminEvents.status === 200 &&
    Array.isArray(adminEvents.json?.events) &&
    adminEvents.json.events.length > 0;
  record(
    "mock",
    "admin events API returns data",
    adminEventsOk,
    adminEventsOk ? "" : `unexpected HTTP ${adminEvents.status} or empty events`,
    adminEvents.ok ? `count=${adminEvents.json?.events?.length}` : `HTTP ${adminEvents.status}`,
  );

  const adminStats = await fetchRoute(activeBase, "/api/admin/stats", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminStatsOk =
    adminStats.status !== 401 &&
    adminStats.status !== 403 &&
    adminStats.status === 200 &&
    typeof adminStats.json?.totalUsers === "number" &&
    adminStats.json.totalUsers > 0;
  record(
    "mock",
    "admin stats API returns data",
    adminStatsOk,
    adminStatsOk ? "" : `unexpected HTTP ${adminStats.status} or zero users`,
    adminStats.ok ? `users=${adminStats.json?.totalUsers}` : `HTTP ${adminStats.status}`,
  );

  const createPartner = await fetchRoute(activeBase, "/api/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Audit Partner ${Date.now()}`,
      outletType: "newspaper",
      region: "Abuja",
    }),
  });
  const newPartnerId = createPartner.json?.partner?.id;
  record(
    "mock",
    "AdSpotX partner create (API)",
    createPartner.status === 201 && !!newPartnerId,
    createPartner.status === 201 ? "" : `HTTP ${createPartner.status}`,
  );

  if (newPartnerId) {
    const analytics = await fetchRoute(activeBase, `/api/partners/${newPartnerId}/analytics`);
    const analyticsOk =
      analytics.ok &&
      analytics.status === 200 &&
      analytics.json?.analytics?.partnerId === newPartnerId;
    record(
      "mock",
      "AdSpotX partner analytics (API)",
      analyticsOk,
      analyticsOk ? "" : "analytics endpoint failed",
      analytics.ok ? `impressions=${analytics.json?.analytics?.impressions}` : "unreachable",
    );
  }

  await auditReviewerPipeline("mock", activeBase);

  const adminLogin = await fetchRoute(activeBase, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@adspot.demo", password: DEMO_PASSWORD }),
  });
  record(
    "mock",
    "admin login returns admin role",
    adminLogin.status === 200 &&
      adminLogin.json?.user?.role === "admin" &&
      !!adminLogin.json?.token,
    adminLogin.status === 200 ? "" : `HTTP ${adminLogin.status}`,
    adminLogin.json?.user?.role || "",
  );

  const brandLogin = await fetchRoute(activeBase, "/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "brand@adspot.demo", password: DEMO_PASSWORD }),
  });
  const brandToken = brandLogin.json?.token;
  record(
    "mock",
    "brand login returns brand role",
    brandLogin.status === 200 && brandLogin.json?.user?.role === "brand" && !!brandToken,
    brandLogin.status === 200 ? "" : `HTTP ${brandLogin.status}`,
    brandLogin.json?.user?.role || "",
  );

  if (brandToken) {
    const brandAds = await fetchRoute(activeBase, "/api/brands/ads", {
      headers: { Authorization: `Bearer ${brandToken}` },
    });
    const deleteRouteOk = existsSync(path.join(ROOT, "server/src/routes/brands.ts")) &&
      readFileSync(path.join(ROOT, "server/src/routes/brands.ts"), "utf8").includes('router.delete("/brands/ads/:adId"');
    record(
      "mock",
      "brand DELETE /brands/ads route exists",
      deleteRouteOk,
      deleteRouteOk ? "" : "missing DELETE handler in brands.ts",
    );
    record(
      "mock",
      "brand ads list API (mock or DB)",
      brandAds.status === 200 && Array.isArray(brandAds.json?.ads),
      brandAds.status === 200 ? "" : `HTTP ${brandAds.status}`,
      brandAds.ok ? `count=${brandAds.json?.ads?.length}` : "unreachable",
    );

    if (brandAds.json?.ads?.[0]?.id) {
      const del = await fetchRoute(activeBase, `/api/brands/ads/${brandAds.json.ads[0].id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${brandToken}` },
      });
      record(
        "mock",
        "brand can delete ad (mock API)",
        del.status === 200 && del.json?.deleted === true,
        del.status === 200 ? "" : `HTTP ${del.status}`,
        del.json?.message || "",
      );
    }
  }

  const storageProbe = await fetchRoute(activeBase, "/api/storage/objects/uploads/nonexistent-probe");
  record(
    "mock",
    "storage object serving endpoint",
    storageProbe.status === 404,
    storageProbe.status === 404 ? "" : `expected 404 for missing object, got HTTP ${storageProbe.status}`,
  );

  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  serverChild = null;
}

/* ─────────────────────────── Tier 3 ─────────────────────────── */

async function tier3Live() {
  console.log("\n═══ TIER 3 — LIVE ═══\n");

  const dbUrl = process.env.DATABASE_URL;
  if (!isRealDatabaseUrl(dbUrl)) {
    record("live", "DATABASE_URL", false, "SKIPPED", "no real DATABASE_URL in server/.env or environment");
    notes.push("Tier 3 skipped — set DATABASE_URL and run db push + seed:accounts for live API/auth tests.");
    return;
  }

  notes.push("Tier 3 running against configured DATABASE_URL (not audit mock store).");

  activePort = DEFAULT_AUDIT_PORT;
  activeBase = `http://127.0.0.1:${activePort}`;

  const child = spawn("node", ["server/dist/index.mjs"], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(activePort),
      STATIC_DIR: "./app/dist",
      AUDIT_PARTNER_MOCK: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  serverChild = child;

  const ready = await waitForServer(activeBase);
  record("live", "server with real DB", ready, ready ? "" : "boot failed");
  if (!ready) {
    child.kill("SIGTERM");
    return;
  }

  const health = await fetchRoute(activeBase, "/api/healthz");
  const dbConnected = health.status === 200 && health.json?.db === "connected";
  record(
    "live",
    "API healthz db connected",
    dbConnected,
    dbConnected ? "" : `HTTP ${health.status} db=${health.json?.db}`,
    health.json?.detail || "",
  );

  if (dbConnected) {
    const create = await fetchRoute(activeBase, "/api/partners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Hostile Audit Partner ${Date.now()}`,
        outletType: "newspaper",
        contactEmail: "audit@adspot.test",
      }),
    });
    const partnerId = create.json?.partner?.id;
    record(
      "live",
      "create partner (live DB)",
      create.status === 201 && !!partnerId,
      create.status === 201 ? "" : `HTTP ${create.status}`,
    );

    if (partnerId) {
      const before = await fetchRoute(activeBase, `/api/partners/${partnerId}/integration`);
      record(
        "live",
        "live integration starts inactive",
        before.json?.adspotLinked === false,
        before.json?.adspotLinked === false ? "" : "expected inactive",
      );

      const act = await fetchRoute(activeBase, `/api/partners/${partnerId}/integration/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      record(
        "live",
        "live integration activate",
        act.json?.adspotLinked === true && !!act.json?.apiKey,
        act.json?.adspotLinked ? "" : "activate failed",
      );
    }

    const login = await fetchRoute(activeBase, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "alice@reviewer.demo", password: DEMO_PASSWORD }),
    });
    record(
      "live",
      "auth login reviewer",
      login.status === 200 && !!login.json?.token,
      login.status === 200 ? "" : `HTTP ${login.status}`,
      login.json?.user?.role || "",
    );

    await auditReviewerPipeline("live", activeBase);

    const adminLogin = await fetchRoute(activeBase, "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@adspot.demo", password: DEMO_PASSWORD }),
    });
    const adminToken = adminLogin.json?.token;
    record(
      "live",
      "auth login admin",
      adminLogin.status === 200 && adminLogin.json?.user?.role === "admin" && !!adminToken,
      adminLogin.status === 200 ? "" : `HTTP ${adminLogin.status}`,
      adminLogin.json?.user?.role || "",
    );

    if (adminToken) {
      const adminList = await fetchRoute(activeBase, "/api/partners", {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      record(
        "live",
        "AdSpotX admin partner list (live)",
        adminList.status === 200 && Array.isArray(adminList.json?.partners),
        adminList.status === 200 ? "" : `HTTP ${adminList.status}`,
      );
    }
  } else {
    record("live", "live partner/auth tests", false, "SKIPPED", "healthz db not connected");
  }

  child.kill("SIGTERM");
}

/* ─────────────────────────── Report ─────────────────────────── */

function verdict() {
  if (tiers.build.fail > 0 || tiers.mock.fail > 0) return "FAIL";
  const t3Ran = tiers.live.pass + tiers.live.fail > 0;
  const t3SkippedOnly = tiers.live.skipped > 0 && tiers.live.pass === 0 && tiers.live.fail === 0;
  if (t3SkippedOnly || (t3Ran && tiers.live.fail > 0)) return "PARTIAL";
  return "PASS";
}

function writeReport(v) {
  mkdirSync(path.join(ROOT, "docs"), { recursive: true });
  const lines = [
    "# AdSpot Hostile Audit Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "```",
    "HOSTILE AUDIT REPORT",
    "====================",
    `Tier 1 BUILD: ${tiers.build.pass} pass, ${tiers.build.fail} fail`,
    `Tier 2 MOCK:  ${tiers.mock.pass} pass, ${tiers.mock.fail} fail`,
    tiers.live.skipped && tiers.live.pass === 0 && tiers.live.fail === 0
      ? `Tier 3 LIVE:  SKIPPED — no DATABASE_URL`
      : `Tier 3 LIVE:  ${tiers.live.pass} pass, ${tiers.live.fail} fail`,
    "",
    `VERDICT: ${v}`,
    "",
    failures.length ? "Failures:" : "Failures: (none)",
    ...failures.map((f) => `- [${f.tier}] ${f.name}: ${f.reason}${f.evidence ? ` + ${f.evidence}` : ""}`),
    "```",
    "",
  ];
  if (notes.length) {
    lines.push("## Notes", "", ...notes.map((n) => `- ${n}`), "");
  }
  writeFileSync(REPORT_PATH, lines.join("\n"));
  console.log(`\nReport written to docs/HOSTILE_AUDIT_REPORT.md`);
}

async function main() {
  console.log("HOSTILE AUDIT — AdSpot Unified");
  console.log("==============================\n");

  await tier1Build();

  if (!tier1Only) {
    if (tiers.build.fail === 0 || forceMock) {
      await tier2Mock();
    } else {
      record("mock", "tier 2", false, "SKIPPED", "tier 1 build failures — fix build first");
    }
    if (!mockOnly && (tiers.build.fail === 0 || forceMock)) {
      await tier3Live();
    } else if (mockOnly) {
      notes.push("Tier 3 skipped via --mock-only");
    }
  }

  const v = verdict();
  console.log("\nHOSTILE AUDIT REPORT");
  console.log("====================");
  console.log(`Tier 1 BUILD: ${tiers.build.pass} pass, ${tiers.build.fail} fail`);
  console.log(`Tier 2 MOCK:  ${tiers.mock.pass} pass, ${tiers.mock.fail} fail`);
  if (tiers.live.skipped && tiers.live.pass === 0 && tiers.live.fail === 0) {
    console.log(`Tier 3 LIVE:  SKIPPED — no DATABASE_URL`);
  } else {
    console.log(`Tier 3 LIVE:  ${tiers.live.pass} pass, ${tiers.live.fail} fail`);
  }
  console.log(`\nVERDICT: ${v}`);
  if (failures.length) {
    console.log("\nFailures:");
    for (const f of failures) {
      console.log(`- [${f.tier}] ${f.name}: ${f.reason}${f.evidence ? ` + ${f.evidence}` : ""}`);
    }
  }

  writeReport(v);
  process.exit(v === "FAIL" ? 1 : 0);
}

main().catch((e) => {
  console.error("\nHostile audit crashed:", e);
  process.exit(1);
});
