export * from "./generated/api";
export * from "./generated/api.schemas";
export { setBaseUrl, setAuthTokenGetter, customFetch, ApiError } from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
export { hasSupabase, supabase, supabaseConfigError } from "./supabase-client";
export { supabaseLogin, supabaseRegister, supabaseSignOut, postLoginPath, brandsNestLoginPath } from "./supabase-auth-flow";
export {
  getActAs,
  setActAs,
  canActAs,
  effectivePortal,
  type ActAsMode,
} from "./act-as";
export {
  ADMIN_PASSWORDS,
  APPROVAL_STORE_KEY,
  AWAITING_MSG,
  OWNER_EMAIL,
  adminAccessStatus,
  clearSoftOwnerSession,
  decideAdminAccess,
  identityToEmail,
  isApproved,
  isOwnerEmail,
  isOwnerSoftSession,
  isRevoked,
  isSharedAdminPassword,
  listAdminAccessRequests,
  loadSoftOwnerUser,
  requestAdminAccess,
  resolveAdminGateLogin,
  saveSoftOwnerSession,
} from "./admin-tester";
export type {
  AccessQueue,
  AccessRequest,
  AccessStatus,
  GateResult,
} from "./admin-tester";
export * from "./adspot-tables";
