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
  OWNER_EMAIL,
  isOwnerEmail,
  isOwnerSoftSession,
  loadSoftOwnerUser,
  clearSoftOwnerSession,
  saveSoftOwnerSession,
} from "./admin-tester";
export * from "./adspot-tables";
