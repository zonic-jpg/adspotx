#!/usr/bin/env node
/**
 * Capture AdSpotX screenshots via system Chrome (puppeteer-core).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "docs/adspotx-screenshots");
const BASE = process.env.ADSPOT_BASE_URL ?? "http://localhost:3002";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PASSWORD = "password123";

const MOCK_AD_ID = "00000000-0000-4000-8000-000000000a01";
const MOCK_SESSION_ID = "00000000-0000-4000-8000-000000000s01";

const MOCK_AD = {
  id: MOCK_AD_ID,
  title: "Summer Splash Campaign",
  description: "Watch our summer launch video and share your honest feedback on the creative.",
  assetUrl: "dQw4w9WgXcQ",
  assetType: "youtube",
  minWatchSeconds: 5,
  pointReward: 120,
  multiplierFactor: "1.0",
  brandId: "00000000-0000-4000-8000-000000000004",
  brandName: "Demo Brand",
  questions: [
    {
      id: "00000000-0000-4000-8000-000000000q01",
      adId: MOCK_AD_ID,
      questionText: "What product category was featured in this ad?",
      questionType: "mcq",
      options: ["Beverages", "Electronics", "Fashion", "Food"],
      sortOrder: 0,
    },
    {
      id: "00000000-0000-4000-8000-000000000q02",
      adId: MOCK_AD_ID,
      questionText: "How would you rate the overall message clarity?",
      questionType: "rating",
      options: null,
      sortOrder: 1,
    },
  ],
};

const MOCK_ANALYTICS = {
  summary: {
    totalViews: 12480,
    completedReviews: 8920,
    avgWatchSeconds: 42,
    completionRate: 0.71,
    totalSpend: 2450000,
    avgPositivity: 0.82,
  },
  viewsByDay: [
    { date: "2026-07-28", views: 420, completions: 310 },
    { date: "2026-07-29", views: 510, completions: 380 },
    { date: "2026-07-30", views: 480, completions: 350 },
    { date: "2026-07-31", views: 620, completions: 450 },
    { date: "2026-08-01", views: 590, completions: 420 },
    { date: "2026-08-02", views: 710, completions: 520 },
    { date: "2026-08-03", views: 680, completions: 490 },
  ],
  demographics: {
    gender: { male: 0.48, female: 0.52 },
    ageBands: [
      { band: "18-24", count: 3200 },
      { band: "25-34", count: 4100 },
      { band: "35-44", count: 2100 },
      { band: "45+", count: 680 },
    ],
    states: [
      { state: "Lagos", count: 4200 },
      { state: "FCT – Abuja", count: 1800 },
      { state: "Rivers", count: 980 },
    ],
  },
  ads: [
    { id: MOCK_AD_ID, title: "Summer Splash Campaign", views: 5200, completions: 3800 },
    { id: "00000000-0000-4000-8000-000000000a02", title: "Brand Awareness Video", views: 4100, completions: 2900 },
  ],
};

mkdirSync(OUT_DIR, { recursive: true });

async function loginApi(email) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`Login failed for ${email}: ${r.status}`);
  return r.json();
}

async function setupReviewerMocks(page) {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/ads/") && !url.endsWith("/api/ads")) {
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_AD) });
      return;
    }
    if (url.includes("/api/ads")) {
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ads: [{ ...MOCK_AD, questionCount: 2, status: "active", createdAt: new Date().toISOString() }],
          total: 1,
          offset: 0,
          limit: 20,
        }),
      });
      return;
    }
    if (url.includes("/api/reviews/start")) {
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: MOCK_SESSION_ID, adId: MOCK_AD_ID, status: "in_progress" }),
      });
      return;
    }
    if (url.includes("/api/points/balance")) {
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ balance: 2840 }) });
      return;
    }
    if (url.includes("/api/points/ledger")) {
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: [], total: 0 }) });
      return;
    }
    if (url.includes("/api/leaderboard")) {
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ entries: [{ rank: 1, username: "alice", points: 2840 }], myRank: 1 }),
      });
      return;
    }
    req.continue();
  });
}

async function setupBrandMocks(page) {
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/brands/analytics/comments")) {
      req.respond({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          comments: [
            { comment: "Great summer vibe!", sentiment: "positive", reviewer: { gender: "female", state: "Lagos" } },
            { comment: "Message was clear and fun.", sentiment: "positive", reviewer: { gender: "male", state: "FCT – Abuja" } },
          ],
        }),
      });
      return;
    }
    if (url.includes("/api/brands/analytics")) {
      req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_ANALYTICS) });
      return;
    }
    req.continue();
  });
}

async function setSession(page, tokenKey, token) {
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.evaluate((key, val) => localStorage.setItem(key, val), tokenKey, token);
}

async function shot(page, name, url, waitMs = 2000) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await new Promise((r) => setTimeout(r, waitMs));
  const path = join(OUT_DIR, name);
  await page.screenshot({ path, fullPage: false });
  console.log(`  ✓ ${name}`);
}

async function main() {
  console.log(`Capturing screenshots from ${BASE} → ${OUT_DIR}`);

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 900 },
  });

  const page = await browser.newPage();

  await shot(page, "01-landing-hero.png", `${BASE}/`, 1500);

  const reviewer = await loginApi("alice@reviewer.demo");
  await setupReviewerMocks(page);
  await setSession(page, "adspot_token", reviewer.token);
  await shot(page, "02-reviewer-dashboard.png", `${BASE}/earn/dashboard`, 2500);
  await shot(page, "03-reviewer-campaign-review.png", `${BASE}/earn/review/${MOCK_AD_ID}`, 5000);

  const brand = await loginApi("brand@adspot.demo");
  const brandPage = await browser.newPage();
  await setupBrandMocks(brandPage);
  await setSession(brandPage, "adspot_brand_token", brand.token);
  await shot(brandPage, "04-brand-login.png", `${BASE}/brands/login`, 1000);
  await shot(brandPage, "05-brand-dashboard.png", `${BASE}/brands/dashboard`, 3500);

  const admin = await loginApi("admin@adspot.demo");
  const adminPage = await browser.newPage();
  await setSession(adminPage, "adspot_brand_token", admin.token);
  await shot(adminPage, "06-admin-users.png", `${BASE}/brands/admin/users`, 2500);
  await shot(adminPage, "07-admin-events.png", `${BASE}/brands/admin/events`, 2500);
  await shot(adminPage, "08-admin-financials.png", `${BASE}/brands/admin/financials`, 3000);
  await shot(adminPage, "09-admin-adspotx.png", `${BASE}/brands/admin/adspotx`, 3000);

  const partnerPage = await browser.newPage();
  await shot(partnerPage, "10-partner-portal.png", `${BASE}/partners`, 2000);
  await shot(partnerPage, "11-partner-integration.png", `${BASE}/partners/integration`, 2500);

  await browser.close();

  writeFileSync(
    join(OUT_DIR, "manifest.json"),
    JSON.stringify({ baseUrl: BASE, capturedAt: new Date().toISOString(), files: 11 }, null, 2),
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
