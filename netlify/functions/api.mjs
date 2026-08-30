/**
 * Netlify Functions catch-all for /api/* (legacy shim).
 *
 * AUTH: password sign-in here is RETIRED. The SPA authenticates via Supabase
 * Auth; owner→super_admin is enforced by the DB signup trigger
 * (adspot_handle_new_user). The previous hardcoded owner/admin master passwords
 * were a live backdoor and have been removed — no password grants a session here
 * anymore. Remaining endpoints are non-auth reads / legacy registered-user login.
 */
import crypto from "node:crypto";
import { MOCK_VIDEO_ADS } from "./mock-videos.mjs";
import {
  connectBlobContext,
  createRegisteredUser,
  findRegisteredUser,
  isStorageAvailable,
  probeStorage,
  publicUser,
  verifyPassword,
} from "./user-store.mjs";

// SECURITY: hardcoded owner/admin master passwords and the shared demo password
// were removed — they were a live backdoor that minted super_admin sessions.
// Authentication is handled by Supabase Auth; this shim no longer signs anyone
// in from a password.
const ADMIN_PASSWORDS = [];
const AWAITING_MSG =
  "Awaiting approval — the owner must approve your admin access before you can sign in. You will be notified once approved.";

function isAdminPassword() {
  // SECURITY: master/admin password sign-in removed. Admin and owner access is
  // granted only by role in Supabase (adspot_profiles.role), never a password.
  return false;
}
const OWNER_EMAIL = "oadeagbo@gmail.com";
const OWNER_ALIASES = new Set([OWNER_EMAIL, "oadeagbo", "oadeagbo@admin.local"]);
const JWT_SECRET =
  process.env.JWT_SECRET ||
  process.env.ADSPOT_NETLIFY_JWT_SECRET ||
  "adspot-netlify-demo-secret-change-me";
const GOOGLE_CLIENT_ID = (
  process.env.GOOGLE_CLIENT_ID ||
  process.env.VITE_GOOGLE_CLIENT_ID ||
  ""
).trim();

const USERS = [
  {
    id: "00000000-0000-4000-8000-000000000005",
    email: "oadeagbo@gmail.com",
    username: "oadeagbo",
    role: "super_admin",
    isOwner: true,
    createdAt: "2025-01-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000099",
    email: "admin@adspot.demo",
    username: "admin",
    role: "admin",
    isOwner: false,
    createdAt: "2025-02-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "brand@adspot.demo",
    username: "demo-brand",
    role: "brand",
    isOwner: false,
    createdAt: "2025-03-01T00:00:00.000Z",
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "amara@reviewer.demo",
    username: "amara_okafor",
    role: "reviewer",
    isOwner: false,
    createdAt: "2025-04-01T00:00:00.000Z",
  },
];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Content-Type": "application/json",
};

function respond(status, body) {
  return {
    statusCode: status,
    headers: cors,
    body: JSON.stringify(body),
  };
}

function b64url(data) {
  return Buffer.from(data)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signToken(user) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      userId: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isOwner: Boolean(user.isOwner),
      iat: now,
      exp: now + 7 * 24 * 3600,
    }),
  );
  const sig = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return `${header}.${payload}.${sig}`;
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new Error("bad token");
  const [header, payload, sig] = parts;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  if (sig !== expected) throw new Error("bad signature");
  const body = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  if (body.exp && body.exp < Math.floor(Date.now() / 1000)) throw new Error("expired");
  return body;
}

function authResponse(user) {
  return {
    token: signToken(user),
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      isOwner: Boolean(user.isOwner),
      createdAt: user.createdAt,
    },
  };
}

function findSeededUser(email) {
  const normalized = String(email || "").toLowerCase().trim();
  return (
    USERS.find((u) => u.email === normalized || u.username.toLowerCase() === normalized) ?? null
  );
}

/** @deprecated use findSeededUser — kept for internal callers during migration */
function findUser(email) {
  return findSeededUser(email);
}

function isOwnerEmail(email) {
  return OWNER_ALIASES.has(String(email || "").toLowerCase().trim());
}

function normalizeLoginIdentity(raw) {
  const identity = String(raw || "").trim();
  const lower = identity.toLowerCase();
  if (lower === "oadeagbo" || lower === OWNER_EMAIL) {
    return { email: OWNER_EMAIL, username: "oadeagbo" };
  }
  if (lower.includes("@")) {
    return { email: lower, username: lower.split("@")[0].slice(0, 40) || "user" };
  }
  const safe = lower.replace(/[^a-z0-9._-]/gi, "_").slice(0, 40) || "admin";
  return { email: `${safe}@admin.local`, username: safe };
}

function isOwnerIdentity(raw) {
  return isOwnerEmail(normalizeLoginIdentity(raw).email);
}

/** Owner email + admin password → super_admin session. */
function superAdminSessionFromIdentity(rawIdentity) {
  const identity = String(rawIdentity || "admin").trim() || "admin";
  const lower = identity.toLowerCase();
  const existing = findUser(lower);
  if (existing) {
    return {
      ...existing,
      role: "super_admin",
      isOwner: isOwnerEmail(existing.email) || Boolean(existing.isOwner),
    };
  }
  const looksLikeEmail = lower.includes("@");
  const email = looksLikeEmail ? lower : `${lower.replace(/[^a-z0-9._-]/gi, "_")}@admin.local`;
  const username = looksLikeEmail ? lower.split("@")[0].slice(0, 40) || "admin" : lower.slice(0, 40);
  return {
    id: crypto.createHash("sha256").update(`admin123:${lower}`).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5"),
    email,
    username,
    role: "super_admin",
    isOwner: isOwnerEmail(email),
    createdAt: new Date().toISOString(),
  };
}

function requireUser(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    const payload = verifyToken(header.slice(7));
    const user = USERS.find((u) => u.id === payload.userId) || {
      id: payload.userId,
      email: payload.email,
      username: payload.username,
      role: payload.role,
      isOwner: Boolean(payload.isOwner),
      createdAt: new Date().toISOString(),
    };
    return { payload, user };
  } catch {
    return null;
  }
}

function apiPath(event) {
  const raw =
    event.rawUrl ||
    event.headers?.["x-forwarded-path"] ||
    event.path ||
    "";
  let path = raw;
  try {
    if (raw.startsWith("http")) path = new URL(raw).pathname;
  } catch {
    /* ignore */
  }
  path = path
    .replace(/^\/\.netlify\/functions\/api\/?/, "/")
    .replace(/^\/api\/?/, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  return path.replace(/\/+$/, "") || "/";
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function demoStats() {
  return {
    totalUsers: USERS.length,
    totalReviewers: USERS.filter((u) => u.role === "reviewer").length,
    totalBrands: USERS.filter((u) => u.role === "brand").length,
    totalAdmins: USERS.filter((u) => u.role === "admin" || u.role === "super_admin").length,
    totalAds: MOCK_VIDEO_ADS.length,
    activeAds: MOCK_VIDEO_ADS.filter((a) => a.status === "active").length,
    totalCompletions: 156,
    totalPointsIssued: 2840,
    pendingRedemptions: 1,
    completedRedemptions: 1,
  };
}

async function verifyGoogleIdToken(idToken) {
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Invalid Google ID token");
  }
  const payload = await res.json();
  if (GOOGLE_CLIENT_ID && payload.aud && payload.aud !== GOOGLE_CLIENT_ID) {
    throw new Error("Google token audience mismatch");
  }
  if (!payload.email || payload.email_verified === "false" || payload.email_verified === false) {
    throw new Error("Google email is not verified");
  }
  return {
    googleId: String(payload.sub),
    email: String(payload.email).toLowerCase().trim(),
    name: payload.name ? String(payload.name) : undefined,
  };
}

function userFromGoogleProfile(profile, portal) {
  const owner = isOwnerEmail(profile.email);
  const existing = findUser(profile.email);
  if (existing) {
    return {
      ...existing,
      role: owner ? "super_admin" : existing.role,
      isOwner: owner || Boolean(existing.isOwner),
    };
  }
  const role = owner ? "super_admin" : portal === "brands" ? "brand" : "reviewer";
  const username = profile.email.split("@")[0].replace(/[^a-z0-9_]/gi, "_").slice(0, 40) || "user";
  return {
    id: crypto.createHash("sha256").update(`google:${profile.googleId}`).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12}).*$/, "$1-$2-$3-$4-$5"),
    email: profile.email,
    username,
    role,
    isOwner: owner,
    createdAt: new Date().toISOString(),
  };
}

export async function handler(event) {
  try {
    try {
      connectBlobContext(event);
    } catch (blobErr) {
      console.error("blob context skipped:", blobErr);
    }
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 204, headers: cors, body: "" };
    }

    const method = event.httpMethod || "GET";
    const path = apiPath(event);
    const body = method === "GET" || method === "HEAD" ? {} : parseBody(event);
    if (body === null) return respond(400, { error: "bad_request", message: "Invalid JSON body" });

    if (path === "/health" || path === "/") {
      const storageProbe =
        path === "/health" && (event.queryStringParameters?.probe === "1" || event.queryStringParameters?.probe === "true")
          ? await probeStorage()
          : null;
      return respond(200, {
        ok: true,
        mode: "netlify-demo",
        authVersion: 11,
        registration: isStorageAvailable(),
        message: "AdSpot Netlify API — email/password registration + Google + mock videos",
        adminPasswords: true,
        googleConfigured: Boolean(GOOGLE_CLIENT_ID),
        storageAvailable: isStorageAvailable(),
        storageProbe,
        mockVideos: MOCK_VIDEO_ADS.length,
      });
    }

    if (path === "/auth/google/config" && method === "GET") {
      return respond(200, {
        clientId: GOOGLE_CLIENT_ID || null,
        configured: Boolean(GOOGLE_CLIENT_ID),
      });
    }

    if (path === "/auth/login" && method === "POST") {
      const rawIdentity = body.email ?? body.username;
      const password = body.password;
      if (!rawIdentity || !password) {
        return respond(400, { error: "validation_error", message: "Email and password required" });
      }
      const identity = normalizeLoginIdentity(String(rawIdentity));
      // SECURITY: the hardcoded owner/admin master-password path and the shared
      // demo-password auto-login were removed (they were a live backdoor).
      // Admin and owner access is granted only by role in Supabase, never here.

      // Registered accounts (Netlify Blobs) — bcrypt-verified; never 500 if Blobs hang/fail.
      try {
        const registered = await findRegisteredUser(identity.email);
        if (!registered && identity.username) {
          const byUsername = await findRegisteredUser(identity.username);
          if (byUsername) {
            if (!verifyPassword(password, byUsername.passwordHash)) {
              return respond(401, { error: "unauthorized", message: "Invalid credentials" });
            }
            return respond(200, authResponse(publicUser(byUsername)));
          }
        }
        if (registered) {
          if (!verifyPassword(password, registered.passwordHash)) {
            return respond(401, { error: "unauthorized", message: "Invalid credentials" });
          }
          return respond(200, authResponse(publicUser(registered)));
        }
      } catch (err) {
        console.error("registered login lookup skipped:", err);
      }

      return respond(401, { error: "unauthorized", message: "Invalid credentials" });
    }

    if (path === "/auth/google" && method === "POST") {
      const idToken = body.idToken;
      const portal = body.portal === "brands" ? "brands" : "earn";
      if (!idToken || typeof idToken !== "string") {
        return respond(400, { error: "validation_error", message: "idToken required" });
      }
      try {
        const profile = await verifyGoogleIdToken(idToken);
        const user = userFromGoogleProfile(profile, portal);
        return respond(200, authResponse(user));
      } catch (err) {
        return respond(401, {
          error: "unauthorized",
          message: err instanceof Error ? err.message : "Google sign-in failed",
        });
      }
    }

    if (path === "/auth/me" && method === "GET") {
      const session = requireUser(event);
      if (!session) return respond(401, { error: "unauthorized", message: "Missing or invalid token" });
      return respond(200, {
        id: session.user.id,
        email: session.user.email,
        username: session.user.username,
        role: session.user.role,
        isOwner: Boolean(session.user.isOwner),
        createdAt: session.user.createdAt,
        profile: null,
        isImpersonating: false,
        impersonatedBy: null,
      });
    }

    if (path === "/auth/register" && method === "POST") {
      const email = body.email;
      const password = body.password;
      const username = body.username;
      const role = body.role === "brand" ? "brand" : "reviewer";
      const companyName = body.companyName;

      if (!email || typeof email !== "string" || !email.includes("@")) {
        return respond(400, { error: "validation_error", message: "Valid email required" });
      }
      if (!username || typeof username !== "string" || username.trim().length < 2) {
        return respond(400, { error: "validation_error", message: "Username must be at least 2 characters" });
      }
      if (!password || typeof password !== "string" || password.length < 8) {
        return respond(400, { error: "validation_error", message: "Password must be at least 8 characters" });
      }

      const owner = isOwnerEmail(email);
      if (findSeededUser(email)) {
        return respond(409, { error: "conflict", message: "Email already registered" });
      }

      try {
        const existing = await findRegisteredUser(email);
        if (existing) {
          return respond(409, { error: "conflict", message: "Email already registered" });
        }
        const existingUsername = await findRegisteredUser(username);
        if (existingUsername) {
          return respond(409, { error: "conflict", message: "Username already taken" });
        }

        const user = await createRegisteredUser({
          email,
          username: username.trim(),
          password,
          role,
          companyName,
          isOwner: owner,
        });
        const body = authResponse(publicUser(user));
        body.persisted = true;
        return respond(201, body);
      } catch (err) {
        console.error("registration failed", err);
        if (err && typeof err === "object" && err.code === "conflict") {
          return respond(409, { error: "conflict", message: err.message || "Account already exists" });
        }
        if (err && typeof err === "object" && err.code === "validation_error") {
          return respond(400, { error: "validation_error", message: err.message || "Invalid registration" });
        }
        // Do NOT mint a fake session — login would fail and registration looks "ok".
        return respond(503, {
          error: "storage_unavailable",
          message: "Registration storage is temporarily unavailable. Please try again in a moment.",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const session = requireUser(event);
    const isAdmin = session && (session.user.role === "admin" || session.user.role === "super_admin");

    if (path === "/admin/stats" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, demoStats());
    }

    if (path === "/admin/ads" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, {
        ads: MOCK_VIDEO_ADS,
        total: MOCK_VIDEO_ADS.length,
      });
    }

    if (path === "/admin/users" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, {
        users: USERS.map((u) => ({
          id: u.id,
          email: u.email,
          username: u.username,
          role: u.role,
          createdAt: u.createdAt,
          pointsBalance: u.role === "reviewer" ? 2840 : null,
        })),
        total: USERS.length,
        offset: 0,
        limit: 100,
      });
    }

    if (path === "/admin/events" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, { events: [], total: 0, offset: 0, limit: 50 });
    }

    if (path === "/admin/points" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, { entries: [], total: 0, offset: 0, limit: 50 });
    }

    if (path === "/admin/redemptions" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, { redemptions: [], total: 0, offset: 0, limit: 50 });
    }

    if (path === "/admin/brands" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, { brands: [], total: 0, offset: 0, limit: 50 });
    }

    if (path === "/admin/settings" && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, { settings: {}, theme: null });
    }

    if (path === "/ads" && method === "GET") {
      if (!session) return respond(401, { error: "unauthorized", message: "Login required" });
      return respond(200, {
        ads: MOCK_VIDEO_ADS.map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          assetUrl: a.assetUrl,
          assetType: a.assetType,
          minWatchSeconds: a.minWatchSeconds,
          pointReward: a.pointReward,
          multiplierFactor: a.multiplierFactor,
          status: a.status,
          brandId: a.brandId,
          brandName: a.brandName,
          createdAt: a.createdAt,
          questionCount: a.questionCount,
        })),
        total: MOCK_VIDEO_ADS.length,
        offset: 0,
        limit: 50,
      });
    }

    const adMatch = path.match(/^\/ads\/([^/]+)$/);
    if (adMatch && method === "GET") {
      if (!session) return respond(401, { error: "unauthorized", message: "Login required" });
      const ad = MOCK_VIDEO_ADS.find((a) => a.id === adMatch[1]);
      if (!ad) return respond(404, { error: "not_found", message: "Ad not found" });
      return respond(200, {
        ...ad,
        questions: [
          {
            id: "00000000-0000-4000-8000-000000000c10",
            adId: ad.id,
            questionText: "How would you rate this ad overall?",
            questionType: "rating",
            options: null,
            sortOrder: 0,
          },
        ],
      });
    }

    if (path.startsWith("/admin/") && method === "GET") {
      if (!isAdmin) return respond(401, { error: "unauthorized", message: "Admin required" });
      return respond(200, { ok: true, mode: "netlify-demo", path });
    }

    return respond(404, {
      error: "not_found",
      message: `No Netlify demo handler for ${method} ${path}. Deploy the Node API + Postgres for full features.`,
      path,
      mode: "netlify-demo",
    });
  } catch (err) {
    console.error(err);
    return respond(500, {
      error: "internal_error",
      message: err instanceof Error ? err.message : "Internal error",
    });
  }
}
