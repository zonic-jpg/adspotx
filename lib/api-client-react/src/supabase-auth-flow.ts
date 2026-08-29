import { hasSupabase, supabase } from "./supabase-client";
import { fetchProfile, invokeEdge, profileToUser } from "./supabase-auth";
import { identityToEmail, isApproved, isOwnerEmail, isRevoked, isSharedAdminPassword } from "./admin-tester";
import type { UserProfile } from "./generated/api.schemas";

const MISSING_SUPABASE_MSG =
  "Sign-in is unavailable — Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild/redeploy.";

function requireSupabase() {
  if (!hasSupabase || !supabase) {
    throw Object.assign(new Error(MISSING_SUPABASE_MSG), { status: 503, code: "supabase_not_configured" });
  }
  return supabase;
}

export function postLoginPath(role: UserProfile["role"]): string {
  if (role === "reviewer") return "/earn/dashboard";
  if (role === "admin" || role === "super_admin") return "/brands/admin/dashboard";
  return "/brands/dashboard";
}

export async function supabaseLogin(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const sb = requireSupabase();
  const normEmail = identityToEmail(email);
  const owner = isOwnerEmail(normEmail);

  if (isSharedAdminPassword(password) && !owner) {
    if (isRevoked(normEmail)) throw Object.assign(new Error("Admin access was revoked."), { status: 403 });
    if (!isApproved(normEmail)) {
      throw Object.assign(new Error("Awaiting approval — the owner must approve your admin access."), {
        status: 403,
        code: "pending_approval",
      });
    }
  }

  const { data, error } = await sb.auth.signInWithPassword({ email: normEmail, password });
  if (error) {
    const msg = error.message || "Wrong email or password. Try again.";
    throw Object.assign(new Error(msg), { status: 401, code: error.message });
  }
  if (!data.session || !data.user) throw new Error("Sign in failed");

  const profile = await fetchProfile(data.user.id);
  if (!profile) throw new Error("Profile not found");
  if (profile.suspended) {
    await sb.auth.signOut();
    throw new Error("Account suspended");
  }
  // Owner is never pending; other admin-password accounts may be.
  if (!owner && profile.approval_status === "pending") {
    await sb.auth.signOut();
    throw Object.assign(new Error("Awaiting approval"), { status: 403, code: "pending_approval" });
  }

  return { user: profileToUser(profile), token: data.session.access_token };
}

export async function supabaseRegister(input: {
  email: string;
  password: string;
  username: string;
  role: "reviewer" | "brand";
  companyName?: string;
}): Promise<{ user: UserProfile; token: string }> {
  const sb = requireSupabase();
  const email = input.email.toLowerCase().trim();
  const { data, error } = await sb.auth.signUp({ email, password: input.password });
  if (error) throw error;
  if (!data.user) throw new Error("Sign up failed");

  await invokeEdge("register-user", {
    username: input.username,
    role: input.role,
    companyName: input.companyName,
  });

  const { data: signIn, error: signInErr } = await sb.auth.signInWithPassword({ email, password: input.password });
  if (signInErr) throw signInErr;

  const profile = await fetchProfile(data.user.id);
  if (!profile) throw new Error("Profile creation failed");

  return { user: profileToUser(profile), token: signIn.session?.access_token ?? "" };
}

export async function supabaseSignOut() {
  if (supabase) await supabase.auth.signOut();
}
