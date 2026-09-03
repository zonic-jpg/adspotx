/**
 * Zonic ADMINTESTER approval gate — shared between app UI and auth flow.
 *
 * The queue is held in Supabase (adspot_admin_access_requests) behind
 * security-definer RPCs. It used to live in `localStorage`, which meant a
 * pending request was written on the requester's device while the owner's
 * panel read the owner's device — so the queue was structurally always empty
 * and nobody could ever be approved.
 *
 * localStorage is still written, but only as a same-device cache so a tester
 * who has already been told they are queued sees a stable answer offline. The
 * owner's queue is read from the server exclusively.
 */
import { supabase } from "./supabase-client";

export const OWNER_EMAIL = "oadeagbo@gmail.com";
const OWNER_ALIASES = new Set([OWNER_EMAIL, "oadeagbo", "oadeagbo@admin.local"]);
export const APPROVAL_STORE_KEY = "zonic_admintester_approval_v1";
export const OWNER_SOFT_FLAG_KEY = "adspot_owner_soft";
export const OWNER_SOFT_USER_KEY = "adspot_owner_soft_user";
export const OWNER_SOFT_USER_ID = "00000000-0000-4000-8000-000000000001";
export const ADMIN_PASSWORDS = ["zonicGate2026a", "zonicGate2026b", "zonicStudio2026"];
export const AWAITING_MSG =
  "Awaiting approval — the owner must approve your admin access before you can sign in. You will be notified once approved.";

export function isSharedAdminPassword(password: unknown): boolean {
  const candidate = String(password ?? "").trim().toLowerCase();
  return ADMIN_PASSWORDS.some((p) => p.toLowerCase() === candidate);
}

export function isOwnerEmail(email: string): boolean {
  return OWNER_ALIASES.has(String(email ?? "").trim().toLowerCase());
}

/** Soft owner session: Auth/RLS unavailable but owner still reaches admin UI. */
export function isOwnerSoftSession(): boolean {
  try {
    return localStorage.getItem(OWNER_SOFT_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function loadSoftOwnerUser<T = Record<string, unknown>>(): T | null {
  if (!isOwnerSoftSession()) return null;
  try {
    const raw = localStorage.getItem(OWNER_SOFT_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function saveSoftOwnerSession(user: unknown) {
  try {
    localStorage.setItem(OWNER_SOFT_FLAG_KEY, "1");
    localStorage.setItem(OWNER_SOFT_USER_KEY, JSON.stringify(user));
  } catch {
    /* ignore */
  }
}

export function clearSoftOwnerSession() {
  try {
    localStorage.removeItem(OWNER_SOFT_FLAG_KEY);
    localStorage.removeItem(OWNER_SOFT_USER_KEY);
  } catch {
    /* ignore */
  }
}

export function identityToEmail(identity: string): string {
  const raw = String(identity || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  const safe = raw.replace(/[^a-zA-Z0-9._+-]/g, "").toLowerCase() || "user";
  return `${safe}@admin.local`;
}

function norm(email: string) {
  return identityToEmail(email);
}

export type AccessStatus = "owner" | "approved" | "pending" | "revoked" | "none";

export type AccessRequest = {
  email: string;
  identity?: string | null;
  app?: string;
  status?: AccessStatus;
  requested_at: string;
  decided_at?: string | null;
};

// ── Same-device cache ───────────────────────────────────────────────────────

type CacheShape = { statuses: Record<string, AccessStatus> };

function loadCache(): CacheShape {
  try {
    const raw = localStorage.getItem(APPROVAL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CacheShape>;
      if (parsed && typeof parsed.statuses === "object" && parsed.statuses) {
        return { statuses: parsed.statuses as Record<string, AccessStatus> };
      }
    }
  } catch {
    /* seed */
  }
  return { statuses: {} };
}

function cacheStatus(email: string, status: AccessStatus) {
  try {
    const cache = loadCache();
    cache.statuses[norm(email)] = status;
    localStorage.setItem(APPROVAL_STORE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore */
  }
}

function cachedStatus(email: string): AccessStatus | null {
  return loadCache().statuses[norm(email)] ?? null;
}

// ── Server-backed queue ─────────────────────────────────────────────────────

/**
 * True when the approval RPCs are not deployed yet. Callers treat this as
 * "cannot decide server-side" rather than as a denial, so a missing migration
 * never locks the owner out.
 */
function isMissingRpc(error: unknown): boolean {
  const code = (error as { code?: string })?.code ?? "";
  const msg = (error as { message?: string })?.message ?? "";
  return code === "PGRST202" || code === "PGRST205" || /could not find the function|schema cache/i.test(msg);
}

/** Records a request for admin access. Safe to call repeatedly. */
export async function requestAdminAccess(
  identity: string,
  appId = "adspotx",
): Promise<{ status: AccessStatus; email: string; serverBacked: boolean }> {
  const email = norm(identity);
  if (!email) return { status: "none", email, serverBacked: false };
  if (isOwnerEmail(email)) return { status: "owner", email, serverBacked: true };

  if (supabase) {
    const { data, error } = await supabase.rpc("adspot_request_admin_access", {
      p_email: email,
      p_identity: String(identity || "").trim() || null,
      p_app: appId,
    });
    if (!error && data) {
      const status = ((data as { status?: string }).status ?? "pending") as AccessStatus;
      cacheStatus(email, status);
      return { status, email, serverBacked: true };
    }
    if (error && !isMissingRpc(error)) {
      // Recorded or not, the tester's next step is the same: wait for the
      // owner. Cache pending so the notice is stable.
      cacheStatus(email, "pending");
      return { status: "pending", email, serverBacked: false };
    }
  }

  cacheStatus(email, "pending");
  return { status: "pending", email, serverBacked: false };
}

/** Current server-side decision for an email. */
export async function adminAccessStatus(email: string, appId = "adspotx"): Promise<AccessStatus> {
  const e = norm(email);
  if (!e) return "none";
  if (isOwnerEmail(e)) return "owner";

  if (supabase) {
    const { data, error } = await supabase.rpc("adspot_admin_access_status", {
      p_email: e,
      p_app: appId,
    });
    if (!error && data) {
      const status = ((data as { status?: string }).status ?? "none") as AccessStatus;
      cacheStatus(e, status);
      return status;
    }
  }
  return cachedStatus(e) ?? "none";
}

export async function isApproved(email: string, appId = "adspotx"): Promise<boolean> {
  if (isOwnerEmail(email)) return true;
  return (await adminAccessStatus(email, appId)) === "approved";
}

export async function isRevoked(email: string, appId = "adspotx"): Promise<boolean> {
  if (isOwnerEmail(email)) return false;
  return (await adminAccessStatus(email, appId)) === "revoked";
}

export type AccessQueue = {
  pending: AccessRequest[];
  approved: AccessRequest[];
  revoked: AccessRequest[];
};

/**
 * The owner's view of the queue. Read from the server only — reading the
 * local cache here is exactly what made pending requests invisible.
 */
export async function listAdminAccessRequests(appId = "adspotx"): Promise<AccessQueue> {
  if (!supabase) throw new Error("The approval queue is unavailable right now.");
  const { data, error } = await supabase.rpc("adspot_list_admin_access_requests", { p_app: appId });
  if (error) throw error;
  const q = (data ?? {}) as Partial<AccessQueue>;
  return {
    pending: Array.isArray(q.pending) ? q.pending : [],
    approved: Array.isArray(q.approved) ? q.approved : [],
    revoked: Array.isArray(q.revoked) ? q.revoked : [],
  };
}

/** Owner-only approve / reject. Approving also promotes the real profile. */
export async function decideAdminAccess(
  targetEmail: string,
  decision: "approve" | "reject",
  appId = "adspotx",
): Promise<{ status: AccessStatus; email: string }> {
  const email = norm(targetEmail);
  if (!email) throw new Error("Valid email required.");
  if (isOwnerEmail(email)) throw new Error("The owner account cannot be changed here.");
  if (!supabase) throw new Error("The approval queue is unavailable right now.");

  const { data, error } = await supabase.rpc("adspot_decide_admin_access", {
    p_email: email,
    p_decision: decision,
    p_app: appId,
  });
  if (error) throw error;
  const status = ((data as { status?: string })?.status ?? "pending") as AccessStatus;
  cacheStatus(email, status);
  return { status, email };
}

export type GateResult =
  | { ok: true; status: "owner" | "approved"; email: string }
  | {
      ok: false;
      status: "pending" | "revoked" | "invalid" | "not_admin_password";
      email?: string;
      message?: string;
    };

/**
 * Decides whether a shared-password sign-in may proceed, queuing a request
 * the owner can see from any device when it may not.
 */
export async function resolveAdminGateLogin(
  identity: string,
  password: string,
  appId = "adspotx",
): Promise<GateResult> {
  if (!isSharedAdminPassword(password)) return { ok: false, status: "not_admin_password" };
  const email = norm(identity);
  if (!email) {
    return { ok: false, status: "invalid", message: "Enter any username or email with the admin password." };
  }
  if (isOwnerEmail(email)) return { ok: true, status: "owner", email };

  const status = await adminAccessStatus(email, appId);
  if (status === "approved") return { ok: true, status: "approved", email };
  if (status === "revoked") {
    return {
      ok: false,
      status: "revoked",
      email,
      message: "Admin access was revoked. Contact the owner to request access again.",
    };
  }

  const queued = await requestAdminAccess(identity, appId);
  return { ok: false, status: "pending", email: queued.email, message: AWAITING_MSG };
}
