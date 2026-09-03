/**
 * Zonic orbit standard — ADMINTESTER approval gate (AdSpot).
 *
 * Owner: oadeagbo@gmail.com → always approved. Other shared-password logins
 * queue in Supabase until the owner approves them.
 *
 * This file used to hold a second, diverging copy of the gate that stored the
 * queue in localStorage. Both copies now resolve to the single server-backed
 * implementation in @workspace/api-client-react, so the owner and the tester
 * can no longer disagree about who is pending.
 */
export {
  ADMIN_PASSWORDS,
  APPROVAL_STORE_KEY,
  AWAITING_MSG,
  OWNER_EMAIL,
  adminAccessStatus,
  decideAdminAccess,
  identityToEmail,
  isApproved,
  isOwnerEmail,
  isRevoked,
  isSharedAdminPassword,
  listAdminAccessRequests,
  requestAdminAccess,
  resolveAdminGateLogin,
} from "@workspace/api-client-react";

export type {
  AccessQueue,
  AccessRequest,
  AccessStatus,
  GateResult,
} from "@workspace/api-client-react";
