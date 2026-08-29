#!/usr/bin/env node
/**
 * End-to-end reviewer pipeline smoke test (mock or live server).
 * Covers: login → feed → media → start → complete → points → leaderboard.
 *
 * Usage: node scripts/test-reviewer-flow.mjs [baseUrl]
 */
const BASE = process.argv[2] ?? "http://127.0.0.1:3199";
const DEMO_PASSWORD = process.env.ADSPOT_DEMO_PASSWORD ?? "password123";

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

function assert(name, ok, detail = "") {
  console.log(ok ? `✓ ${name}` : `✗ ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const PLAYABLE = new Set(["youtube", "vimeo", "video", "image"]);

async function main() {
  console.log(`Reviewer pipeline test @ ${BASE}\n`);

  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "alice@reviewer.demo", password: DEMO_PASSWORD }),
  });
  assert(
    "login (reviewer role + JWT)",
    login.status === 200 && login.json?.user?.role === "reviewer" && !!login.json?.token,
    `HTTP ${login.status} role=${login.json?.user?.role}`,
  );
  const token = login.json?.token;
  if (!token) return;

  const auth = { Authorization: `Bearer ${token}` };

  const feed = await api("/api/ads", { headers: auth });
  assert("ad feed non-empty", feed.status === 200 && (feed.json?.ads?.length ?? 0) > 0);
  const ad = feed.json?.ads?.[0];
  if (!ad) return;

  const detail = await api(`/api/ads/${ad.id}`, { headers: auth });
  assert(
    "ad detail playable media",
    Boolean(detail.json?.assetUrl) && PLAYABLE.has(detail.json?.assetType),
    `type=${detail.json?.assetType}`,
  );

  const questions = detail.json?.questions ?? [];
  assert(
    "questions use valid types",
    questions.every((q) => q.questionType !== "mcq"),
    questions.map((q) => q.questionType).join(","),
  );

  const start = await api("/api/reviews/start", {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ adId: ad.id }),
  });
  assert("start review session", start.status === 201 && start.json?.id);
  const sessionId = start.json.id;

  const answers = questions.map((q) => ({
    questionId: q.id,
    answerValue: q.questionType === "rating" ? "5" : q.options?.[0] ?? "yes",
  }));

  const before = await api("/api/points/balance", { headers: auth });
  const minWatch = Number(detail.json?.minWatchSeconds ?? 5);

  const complete = await api(`/api/reviews/${sessionId}/complete`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      watchSeconds: minWatch,
      answers,
      proverbAnswer: detail.json?.proverbAnswer ?? undefined,
    }),
  });
  const pointsAwarded = Number(complete.json?.pointsAwarded ?? 0);
  assert(
    "complete review awards points",
    complete.status === 200 && pointsAwarded > 0,
    `HTTP ${complete.status} points=${pointsAwarded}`,
  );

  if (detail.json?.proverbAnswer && detail.json?.proverbBonusPoints) {
    const baseReward = Number(ad.pointReward ?? 0);
    const gotBonus = pointsAwarded > baseReward;
    assert("proverb bonus on correct answer", gotBonus, `awarded=${pointsAwarded} base=${baseReward}`);
  }

  const after = await api("/api/points/balance", { headers: auth });
  assert(
    "points balance increased",
    Number(after.json?.balance) > Number(before.json?.balance),
    `${before.json?.balance} → ${after.json?.balance}`,
  );

  const lbBefore = await api("/api/leaderboard", { headers: auth });
  assert(
    "leaderboard returns entries",
    lbBefore.status === 200 && Array.isArray(lbBefore.json?.entries) && lbBefore.json.entries.length > 0,
  );

  const me = lbBefore.json?.entries?.find((e) => e.isCurrentUser);
  assert(
    "leaderboard reflects earned points",
    me && Number(me.pointsTotal ?? me.points ?? 0) > 0,
    `rank=${me?.rank}`,
  );

  console.log(process.exitCode ? "\nFAILED" : "\nPASSED");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
