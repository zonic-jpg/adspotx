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

const OWNER_SOFT_TOKEN = "adspot-owner-local";

function ownerSoftSession(normEmail: string): { user: UserProfile; token: string } {
  // Rubba-style: when Auth/RLS is misconfigured, owner still reaches the approval queue.
  const soft = {
    id: "00000000-0000-4000-8000-000000000001",
    email: normEmail,
    username: "oadeagbo",
    role: "super_admin" as const,
    suspended: false,
    approval_status: "approved" as const,
    created_at: new Date().toISOString(),
  };
  try {
    localStorage.setItem("adspot_owner_soft", "1");
  } catch {
    /* ignore */
  }
  return { user: profileToUser(soft), token: OWNER_SOFT_TOKEN };
}

export async function supabaseLogin(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const sb = requireSupabase();
  const normEmail = identityToEmail(email);
  const owner = isOwnerEmail(normEmail);
  const sharedPw = isSharedAdminPassword(password);

  if (sharedPw && !owner) {
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
    const code = (error as { code?: string }).code || error.message;
    const unconfirmed = code === "email_not_confirmed" || /email not confirmed/i.test(error.message);
    // Owner + shared admin password: never hard-fail on confirm/RLS (Zonic / Rubba simplicity).
    if (owner && sharedPw && unconfirmed) return ownerSoftSession(normEmail);
    const msg = error.message || "Wrong email or password. Try again.";
    throw Object.assign(new Error(msg), { status: 401, code });
  }
  if (!data.session || !data.user) throw new Error("Sign in failed");

  let profile;
  try {
    profile = await fetchProfile(data.user.id);
  } catch (profErr: unknown) {
    const m = profErr instanceof Error ? profErr.message : String(profErr);
    if (owner && /stack depth/i.test(m)) {
      return {
        user: profileToUser({
          id: data.user.id,
          email: normEmail,
          username: "oadeagbo",
          role: "super_admin",
          suspended: false,
          approval_status: "approved",
          created_at: new Date().toISOString(),
        }),
        token: data.session.access_token,
      };
    }
    throw profErr;
  }
  if (!profile) {
    if (owner) {
      return {
        user: profileToUser({
          id: data.user.id,
          email: normEmail,
          username: "oadeagbo",
          role: "super_admin",
          suspended: false,
          approval_status: "approved",
          created_at: new Date().toISOString(),
        }),
        token: data.session.access_token,
      };
    }
    throw new Error("Profile not found");
  }
  if (profile.suspended) {
    await sb.auth.signOut();
    throw new Error("Account suspended");
  }
  // Owner is never pending; other admin-password accounts may be.
  if (!owner && profile.approval_status === "pending") {
    await sb.auth.signOut();
    throw Object.assign(new Error("Awaiting approval"), { status: 403, code: "pending_approval" });
  }
  if (owner && profile.role !== "super_admin" && profile.role !== "admin") {
    profile = { ...profile, role: "super_admin", approval_status: "approved" };
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
