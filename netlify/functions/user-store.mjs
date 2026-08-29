/**
 * Production user persistence for Netlify /api — zero npm deps, uses event.blobs + fetch.
 * URL shape matches @netlify/blobs Client: `${edgeURL}/${siteID}/site:${store}/${key}`
 * All lookups fail open (return null) so seeded/demo login always works.
 */
import crypto from "node:crypto";

const STORE_NAME = "adspot-registered-users";
const SITE_STORE = `site:${STORE_NAME}`;
const INDEX_KEY = "__index__";
const BLOB_TIMEOUT_MS = 8000;

/** @type {{ edgeURL: string, token: string, siteID: string } | null} */
let blobCtx = null;

export function connectBlobContext(event) {
  blobCtx = null;
  try {
    if (!event?.blobs) return;
    const data = JSON.parse(Buffer.from(event.blobs, "base64").toString("utf8"));
    const headers = event.headers || {};
    const siteID =
      headers["x-nf-site-id"] ||
      headers["X-Nf-Site-Id"] ||
      process.env.SITE_ID ||
      process.env.NETLIFY_SITE_ID ||
      data.siteID ||
      "";
    const edgeURL = String(data.url || data.edgeURL || "")
      .trim()
      .replace(/\/$/, "");
    const token = data.token;
    if (edgeURL && token && siteID) {
      blobCtx = { edgeURL, token: String(token), siteID: String(siteID) };
    }
  } catch (err) {
    console.error("connectBlobContext:", err);
    blobCtx = null;
  }
}

export function isStorageAvailable() {
  return Boolean(blobCtx?.edgeURL && blobCtx?.token && blobCtx?.siteID);
}

/** Build the official Netlify Blobs edge URL for a key. */
function blobUrl(key) {
  if (!blobCtx) return null;
  // Do not encode store segment — official client uses raw `site:name` in the path.
  const pathKey = String(key)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${blobCtx.edgeURL}/${blobCtx.siteID}/${SITE_STORE}/${pathKey}`;
}

async function blobGet(key) {
  const url = blobUrl(key);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${blobCtx.token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error("blobGet", key, res.status, await res.text().catch(() => ""));
      return null;
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (err) {
    console.error("blobGet error", key, err);
    return null;
  }
}

/** Netlify Blobs can lag briefly after PUT — retry reads before failing open. */
async function blobGetRetry(key, { attempts = 6, delayMs = 250 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i++) {
    last = await blobGet(key);
    if (last != null) return last;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  return last;
}

async function blobSetJSON(key, value) {
  const url = blobUrl(key);
  if (!url) {
    const err = new Error("Registration storage unavailable");
    err.code = "storage_unavailable";
    throw err;
  }
  let res;
  try {
    res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${blobCtx.token}`,
        "Content-Type": "application/json",
        "cache-control": "max-age=0, stale-while-revalidate=60",
      },
      body: JSON.stringify(value),
      signal: AbortSignal.timeout(BLOB_TIMEOUT_MS),
    });
  } catch (err) {
    const fail = new Error("Registration storage write failed");
    fail.code = "storage_unavailable";
    fail.cause = err;
    throw fail;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("blobSetJSON", key, res.status, text);
    const err = new Error(`Registration storage write failed (${res.status})`);
    err.code = "storage_unavailable";
    throw err;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== "string" || !stored.includes(":")) return false;
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actualHex = crypto.scryptSync(String(password), salt, 64).toString("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expectedHex, "hex"), Buffer.from(actualHex, "hex"));
  } catch {
    return false;
  }
}

function userKey(id) {
  return `user:${id}`;
}

function normalizeEmail(email) {
  return String(email || "").toLowerCase().trim();
}

function normalizeUsername(username) {
  return String(username || "").trim();
}

async function readIndex() {
  const raw = await blobGet(INDEX_KEY);
  if (!raw || typeof raw !== "object") return { byEmail: {}, byUsername: {} };
  return {
    byEmail: raw.byEmail && typeof raw.byEmail === "object" ? raw.byEmail : {},
    byUsername: raw.byUsername && typeof raw.byUsername === "object" ? raw.byUsername : {},
  };
}

async function readIndexRetry() {
  const raw = await blobGetRetry(INDEX_KEY, { attempts: 6, delayMs: 200 });
  if (!raw || typeof raw !== "object") return { byEmail: {}, byUsername: {} };
  return {
    byEmail: raw.byEmail && typeof raw.byEmail === "object" ? raw.byEmail : {},
    byUsername: raw.byUsername && typeof raw.byUsername === "object" ? raw.byUsername : {},
  };
}

async function writeIndex(index) {
  await blobSetJSON(INDEX_KEY, index);
}

export async function findRegisteredUserByEmail(email) {
  if (!isStorageAvailable()) return null;
  try {
    const index = await readIndexRetry();
    const id = index.byEmail[normalizeEmail(email)];
    if (!id) return null;
    const user = await blobGetRetry(userKey(id));
    return user && typeof user === "object" ? user : null;
  } catch (err) {
    console.error("findRegisteredUserByEmail:", err);
    return null;
  }
}

export async function findRegisteredUserByUsername(username) {
  if (!isStorageAvailable()) return null;
  try {
    const index = await readIndexRetry();
    const id = index.byUsername[normalizeUsername(username).toLowerCase()];
    if (!id) return null;
    const user = await blobGetRetry(userKey(id));
    return user && typeof user === "object" ? user : null;
  } catch (err) {
    console.error("findRegisteredUserByUsername:", err);
    return null;
  }
}

export async function findRegisteredUser(identity) {
  const normalized = String(identity || "").toLowerCase().trim();
  const byEmail = await findRegisteredUserByEmail(normalized);
  if (byEmail) return byEmail;
  return findRegisteredUserByUsername(normalized);
}

export async function createRegisteredUser({
  email: rawEmail,
  username: rawUsername,
  password,
  role,
  companyName,
  isOwner = false,
}) {
  if (!isStorageAvailable()) {
    throw Object.assign(new Error("Registration storage unavailable"), { code: "storage_unavailable" });
  }

  const email = normalizeEmail(rawEmail);
  const username = normalizeUsername(rawUsername);
  const normalizedRole = role === "brand" ? "brand" : "reviewer";

  if (!email || !email.includes("@")) {
    throw Object.assign(new Error("Invalid email"), { code: "validation_error" });
  }
  if (!username || username.length < 2) {
    throw Object.assign(new Error("Username must be at least 2 characters"), { code: "validation_error" });
  }
  if (!password || String(password).length < 8) {
    throw Object.assign(new Error("Password must be at least 8 characters"), { code: "validation_error" });
  }

  const index = await readIndex();
  if (index.byEmail[email]) {
    throw Object.assign(new Error("Email already registered"), { code: "conflict" });
  }
  const usernameKey = username.toLowerCase();
  if (index.byUsername[usernameKey]) {
    throw Object.assign(new Error("Username already taken"), { code: "conflict" });
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const user = {
    id,
    email,
    username,
    role: isOwner ? "super_admin" : normalizedRole,
    isOwner: Boolean(isOwner),
    createdAt,
    passwordHash: hashPassword(password),
    companyName: normalizedRole === "brand" ? String(companyName || username).trim() : null,
  };

  index.byEmail[email] = id;
  index.byUsername[usernameKey] = id;
  await blobSetJSON(userKey(id), user);
  await writeIndex(index);

  // Wait for Blobs edge consistency so immediate login after register cannot 401.
  for (let i = 0; i < 8; i++) {
    const got = await blobGet(userKey(id));
    const idx = await readIndex();
    if (got && got.id === id && idx.byEmail[email] === id) {
      return user;
    }
    await new Promise((r) => setTimeout(r, 200 * (i + 1)));
  }
  // Last attempt with retries; if still invisible, surface storage error (no fake session).
  const verified = await blobGetRetry(userKey(id), { attempts: 4, delayMs: 300 });
  if (!verified || verified.id !== id) {
    throw Object.assign(new Error("Registration write did not become readable"), {
      code: "storage_unavailable",
    });
  }
  return user;
}

/** Write/read probe used by /health to prove Blobs persistence. */
export async function probeStorage() {
  if (!isStorageAvailable()) {
    return { ok: false, reason: "context_missing" };
  }
  const key = `__probe__`;
  const payload = { t: Date.now(), v: 1 };
  try {
    await blobSetJSON(key, payload);
    const got = await blobGet(key);
    if (!got || got.t !== payload.t) {
      return { ok: false, reason: "roundtrip_mismatch", got };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err?.code || "probe_failed",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    role: user.role,
    isOwner: Boolean(user.isOwner),
    createdAt: user.createdAt,
  };
}
