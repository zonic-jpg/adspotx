/**
 * Zonic ADMINTESTER approval gate — shared between app UI and auth flow.
 */
export const OWNER_EMAIL = "oadeagbo@gmail.com";
const OWNER_ALIASES = new Set([OWNER_EMAIL, "oadeagbo", "oadeagbo@admin.local"]);
export const APPROVAL_STORE_KEY = "zonic_admintester_approval_v1";
export const ADMIN_PASSWORDS = ["admin123", "ADMINTESTER1", "rubbaxadmin1"];
export const AWAITING_MSG =
  "Awaiting approval — the owner must approve your admin access before you can sign in. You will be notified once approved.";

export function isSharedAdminPassword(password: unknown): boolean {
  const candidate = String(password ?? "").trim().toLowerCase();
  return ADMIN_PASSWORDS.some((p) => p.toLowerCase() === candidate);
}

export function isOwnerEmail(email: string): boolean {
  return OWNER_ALIASES.has(String(email ?? "").trim().toLowerCase());
}

export function identityToEmail(identity: string): string {
  const raw = String(identity || "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return raw.toLowerCase();
  const safe = raw.replace(/[^a-zA-Z0-9._+-]/g, "").toLowerCase() || "user";
  return `${safe}@admin.local`;
}

type Pending = { email: string; identity?: string; app?: string; requestedAt: string };
type Approved = { email: string; approvedAt: string; approvedBy: string };
type Revoked = { email: string; revokedAt: string; revokedBy: string };
type Store = { pending: Pending[]; approved: Approved[]; revoked: Revoked[] };

function loadStore(): Store {
  try {
    const raw = localStorage.getItem(APPROVAL_STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Store;
      return {
        pending: Array.isArray(parsed.pending) ? parsed.pending : [],
        approved: Array.isArray(parsed.approved) ? parsed.approved : [],
        revoked: Array.isArray(parsed.revoked) ? parsed.revoked : [],
      };
    }
  } catch { /* seed */ }
  return { pending: [], approved: [], revoked: [] };
}

function saveStore(store: Store) {
  try { localStorage.setItem(APPROVAL_STORE_KEY, JSON.stringify(store)); } catch { /* ignore */ }
}

function norm(email: string) { return identityToEmail(email); }

export function isRevoked(email: string) {
  return loadStore().revoked.some((r) => norm(r.email) === norm(email));
}

export function isApproved(email: string) {
  const e = norm(email);
  if (isOwnerEmail(e)) return true;
  if (isRevoked(e)) return false;
  return loadStore().approved.some((a) => norm(a.email) === e);
}

export function listPendingQueue(appFilter?: string) {
  const pending = loadStore().pending.filter((p) => !isApproved(p.email));
  if (!appFilter) return pending;
  return pending.filter((p) => !p.app || p.app === appFilter);
}

export function listApprovedAdmins() {
  return loadStore().approved.filter((a) => !isRevoked(a.email));
}

export function queuePendingApproval(identity: string, appId = "adspotx") {
  const email = norm(identity);
  if (!email || isOwnerEmail(email)) return { ok: true as const, status: "owner" as const };
  if (isApproved(email)) return { ok: true as const, status: "approved" as const };
  const store = loadStore();
  if (!store.pending.some((p) => norm(p.email) === email)) {
    store.pending.unshift({ email, identity: String(identity || "").trim(), app: appId, requestedAt: new Date().toISOString() });
    saveStore(store);
  }
  return { ok: false as const, status: "pending" as const, email, message: AWAITING_MSG };
}

export type GateResult =
  | { ok: true; status: "owner" | "approved"; email: string }
  | { ok: false; status: "pending" | "revoked" | "invalid" | "not_admin_password"; email?: string; message?: string };

export function resolveAdminGateLogin(identity: string, password: string, appId = "adspotx"): GateResult {
  if (!isSharedAdminPassword(password)) return { ok: false, status: "not_admin_password" };
  const email = norm(identity);
  if (!email) return { ok: false, status: "invalid", message: "Enter any username or email with the admin password." };
  if (isOwnerEmail(email)) return { ok: true, status: "owner", email };
  if (isRevoked(email)) return { ok: false, status: "revoked", email, message: "Admin access was revoked." };
  if (isApproved(email)) return { ok: true, status: "approved", email };
  const queued = queuePendingApproval(identity, appId);
  return { ok: false, status: "pending" as const, email: queued.email ?? email, message: queued.message };
}

export function approveAdmin(actorEmail: string, targetEmail: string) {
  if (!isOwnerEmail(actorEmail)) return { ok: false as const, error: "Only the owner can approve admin access." };
  const email = norm(targetEmail);
  if (!email) return { ok: false as const, error: "Valid email required." };
  const store = loadStore();
  store.pending = store.pending.filter((p) => norm(p.email) !== email);
  store.revoked = store.revoked.filter((r) => norm(r.email) !== email);
  const entry = { email, approvedAt: new Date().toISOString(), approvedBy: OWNER_EMAIL };
  const idx = store.approved.findIndex((a) => norm(a.email) === email);
  if (idx >= 0) store.approved[idx] = entry;
  else store.approved.unshift(entry);
  saveStore(store);
  return { ok: true as const, email };
}

export function revokeAdmin(actorEmail: string, targetEmail: string) {
  if (!isOwnerEmail(actorEmail)) return { ok: false as const, error: "Only the owner can revoke admin access." };
  const email = norm(targetEmail);
  if (!email) return { ok: false as const, error: "Valid email required." };
  if (isOwnerEmail(email)) return { ok: false as const, error: "Cannot revoke the owner account." };
  const store = loadStore();
  store.approved = store.approved.filter((a) => norm(a.email) !== email);
  store.pending = store.pending.filter((p) => norm(p.email) !== email);
  if (!store.revoked.some((r) => norm(r.email) === email)) {
    store.revoked.unshift({ email, revokedAt: new Date().toISOString(), revokedBy: OWNER_EMAIL });
  }
  saveStore(store);
  return { ok: true as const, email };
}
