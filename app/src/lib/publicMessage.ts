/**
 * Public message guard — ported from MyYangaX (src/lib/publicMessage.js).
 *
 * House rule: the only messages a visitor may see are ones that explain a
 * feature, ask them to fix their own input, or describe an empty state.
 * Build/infrastructure detail (env var names, Supabase/Netlify/edge wiring,
 * migrations, mock + testing state, raw driver errors) must never reach a
 * visitor, so every toast and inline status is filtered through here.
 *
 * Diagnostics still matter for the people who can act on them, so signed-in
 * admins/owners keep the original text via `setDiagnosticsAudience`.
 */

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Shown instead of raw 401/403/RLS text, which means nothing to a visitor. */
export const SIGN_IN_MESSAGE = "Please sign in to continue.";

/**
 * Words that only mean something to whoever builds or deploys the app.
 * Matched on word boundaries — a bare substring test would flag ordinary
 * copy ("smocked" contains "mock", "girls" contains "rls").
 */
const INTERNAL_TERMS = [
  "supabase",
  "netlify",
  "edge function",
  "edge functions",
  "anon key",
  "service role",
  "service_role",
  "api key",
  "apikey",
  "access token",
  "bearer token",
  "rls",
  "migration",
  "migrations",
  "deploy",
  "deployed",
  "redeploy",
  "rebuild",
  "localhost",
  "functions/v1",
  "not configured",
  "misconfigured",
  "testing mode",
  "test mode",
  "mock",
  "mocks",
  "mocked",
  "stub",
  "stubbed",
  "seeded",
  "seed data",
  "placeholder",
  "todo",
  "fixme",
  "fallback",
  "stack trace",
  "unhandled",
  "console",
  "env var",
  "environment variable",
  "orbit",
  "admintester",
  // Database/driver detail that surfaces verbatim from the client library
  "db",
  "database",
  "postgres",
  "sql",
  "schema",
  "relation",
  "constraint",
  "duplicate key",
  "null value",
  "does not exist",
  "bucket not found",
  "nosuchbucket",
  "stack depth",
];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TERM_RE = new RegExp(`\\b(?:${INTERNAL_TERMS.map(escapeRe).join("|")})\\b`, "i");

/** Structural giveaways: screaming-snake env vars, code paths, JSON/stack dumps. */
const INTERNAL_SHAPES = [
  /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/, // VITE_SUPABASE_URL, PGRST205
  /\b127\.0\.0\.1\b/,
  /\bat\s+\w+\s*\([^)]*:\d+:\d+\)/, // stack frames
  /[{[]\s*"[\w-]+"\s*:/, // JSON payload dumps
  /\bHTTP\s+[45]\d{2}\b/i,
  /\b(?:error|status|code|http)\s*[:#]?\s*[45]\d{2}\b/i,
  /\b[45]\d{2}\s+(?:error|status|response)\b/i,
  /\.(?:jsx?|tsx?|mjs|sql)\b/i, // source file names
  /\b(?:select\s+\*|insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i,
  /\b(?:0|zero)\s+rows?\b/i,
];

/**
 * Auth and permission failures. These arrive verbatim from Supabase, the edge
 * functions and PostgREST ("Unauthorized", "JWT expired", "new row violates
 * row-level security policy…") and tell a visitor nothing they can act on.
 * Kept separate from INTERNAL_TERMS so they map to a sign-in prompt rather
 * than the generic "something went wrong".
 */
const AUTH_TERMS = [
  "unauthorized",
  "unauthorised",
  "not authorized",
  "not authorised",
  "forbidden",
  "jwt",
  "permission denied",
  "row-level security",
  "row level security",
  "auth session missing",
  "invalid claim",
  "invalid api key",
  "invalid token",
  "access token",
  "refresh token",
  "admin required",
  "admin sign-in required",
  "sign in required",
  "super admin required",
  "profile not found",
];

const AUTH_RE = new RegExp(`\\b(?:${AUTH_TERMS.map(escapeRe).join("|")})\\b`, "i");

/** True when `raw` is an auth/permission failure rather than something the visitor did. */
export function isAuthMessage(raw: unknown): boolean {
  const text = String(raw ?? "").trim();
  return !!text && AUTH_RE.test(text);
}

let diagnosticsAudience = false;

/**
 * Allow original (unsanitised) text through for admins/owners who can act on
 * it. Called from the auth contexts whenever the signed-in profile changes.
 */
export function setDiagnosticsAudience(isAdmin: boolean) {
  diagnosticsAudience = !!isAdmin;
}

export function hasDiagnosticsAudience(): boolean {
  return diagnosticsAudience;
}

/** True when `raw` exposes build or infrastructure detail. */
export function isInternalMessage(raw: unknown): boolean {
  const text = String(raw ?? "").trim();
  if (!text) return false;
  if (TERM_RE.test(text)) return true;
  return INTERNAL_SHAPES.some((re) => re.test(text));
}

type PublicMessageOptions = {
  /** Shown when `raw` exposes internal detail. */
  fallback?: string;
  /** Shown when `raw` is an auth/permission failure. */
  authFallback?: string;
  /** Bypass the admin passthrough — for surfaces a visitor can always see. */
  force?: boolean;
};

/** Visitor-safe version of `raw`, or "" when there is nothing worth showing. */
export function publicMessage(raw: unknown, opts: PublicMessageOptions = {}): string {
  const { fallback = GENERIC_ERROR, authFallback = SIGN_IN_MESSAGE, force = false } = opts;
  const text = String((raw as { message?: unknown })?.message ?? raw ?? "").trim();
  if (!text) return "";
  if (diagnosticsAudience && !force) return text;
  if (isAuthMessage(text)) return authFallback;
  return isInternalMessage(text) ? fallback : text;
}

/**
 * Convenience for catch blocks that need a non-empty, visitor-safe error.
 * The caller's `fallback` covers auth failures too, since it is written for
 * the surface the error came from.
 */
export function publicError(err: unknown, fallback = GENERIC_ERROR): string {
  return publicMessage(err, { fallback, authFallback: fallback }) || fallback;
}
