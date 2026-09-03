import { hasSupabase, supabase } from "./supabase-client";
import { fetchProfile, invokeEdge, profileToUser } from "./supabase-auth";
import {
  AWAITING_MSG,
  OWNER_EMAIL,
  OWNER_SOFT_USER_ID,
  adminAccessStatus,
  clearSoftOwnerSession,
  identityToEmail,
  isOwnerEmail,
  isSharedAdminPassword,
  requestAdminAccess,
  saveSoftOwnerSession,
} from "./admin-tester";
import type { UserProfile } from "./generated/api.schemas";

const MISSING_SUPABASE_MSG =
  "Sign-in is unavailable — Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild/redeploy.";

const EMAIL_CONFIRM_MSG =
  "Check your email to confirm your account, then sign in. For instant access, the owner can turn off Confirm email in Supabase Auth → Providers → Email.";

function requireSupabase() {
  if (!hasSupabase || !supabase) {
    throw Object.assign(new Error(MISSING_SUPABASE_MSG), { status: 503, code: "supabase_not_configured" });
  }
  return supabase;
}

function isEmailNotConfirmed(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = error.code || "";
  const msg = error.message || "";
  return code === "email_not_confirmed" || /email not confirmed/i.test(msg);
}

/** Owner may type username / alias — always Auth against the real owner email. */
function normalizeLoginEmail(email: string): { normEmail: string; owner: boolean } {
  const raw = String(email ?? "").trim();
  const mapped = identityToEmail(raw);
  const owner = isOwnerEmail(raw) || isOwnerEmail(mapped);
  return { normEmail: owner ? OWNER_EMAIL : mapped, owner };
}

export function postLoginPath(role: UserProfile["role"], email?: string): string {
  // Owner always lands in admin — never brand portal — regardless of stale DB role.
  if (email && isOwnerEmail(email)) return "/brands/admin/dashboard#admintester-queue";
  if (role === "reviewer") return "/earn/dashboard";
  if (role === "admin" || role === "super_admin") return "/brands/admin/dashboard";
  return "/brands/dashboard";
}

/** Nest-relative path for wouter `/brands` section (avoid `/brands/brands/...`). */
export function brandsNestLoginPath(role: UserProfile["role"], email?: string): string {
  if (email && isOwnerEmail(email)) return "/admin/dashboard#admintester-queue";
  if (role === "admin" || role === "super_admin") return "/admin/dashboard";
  return "/dashboard";
}

const OWNER_SOFT_TOKEN = "adspot-owner-local";

function ownerSoftSession(normEmail: string): { user: UserProfile; token: string } {
  // Rubba-style: when Auth/RLS is misconfigured, owner still reaches the approval queue.
  const soft = {
    id: OWNER_SOFT_USER_ID,
    email: normEmail,
    username: "oadeagbo",
    role: "super_admin" as const,
    suspended: false,
    approval_status: "approved" as const,
    created_at: new Date().toISOString(),
  };
  const user = profileToUser(soft);
  saveSoftOwnerSession(user);
  return { user, token: OWNER_SOFT_TOKEN };
}

function elevateOwnerProfile(profile: {
  id: string;
  email: string;
  username: string;
  role: UserProfile["role"];
  suspended: boolean;
  approval_status: "approved" | "pending" | "revoked" | null;
  created_at: string;
}) {
  if (!isOwnerEmail(profile.email)) return profile;
  if (profile.role === "super_admin" || profile.role === "admin") {
    return { ...profile, approval_status: "approved" as const };
  }
  return { ...profile, role: "super_admin" as const, approval_status: "approved" as const };
}

async function waitForProfile(userId: string, attempts = 6) {
  let profile = await fetchProfile(userId);
  for (let i = 0; !profile && i < attempts; i++) {
    await new Promise((r) => setTimeout(r, 250));
    profile = await fetchProfile(userId);
  }
  return profile;
}

export async function supabaseLogin(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const sb = requireSupabase();
  const { normEmail, owner } = normalizeLoginEmail(email);
  const sharedPw = isSharedAdminPassword(password);

  // Pending approval ONLY for shared admin passwords (non-owner). Normal reviewer/brand: no gate.
  // The decision is read from the server, so a tester approved on the owner's
  // device is approved everywhere.
  if (sharedPw && !owner) {
    const status = await adminAccessStatus(normEmail);
    if (status === "revoked") {
      throw Object.assign(new Error("Admin access was revoked."), { status: 403 });
    }
    if (status !== "approved") {
      await requestAdminAccess(email);
      throw Object.assign(new Error(AWAITING_MSG), {
        status: 403,
        code: "pending_approval",
      });
    }
  }

  const { data, error } = await sb.auth.signInWithPassword({ email: normEmail, password });
  if (error) {
    const code = (error as { code?: string }).code || error.message;
    // Owner + shared admin password: NEVER surface invalid credentials — soft session escape hatch.
    if (owner && sharedPw) return ownerSoftSession(normEmail);
    if (isEmailNotConfirmed(error)) {
      throw Object.assign(new Error(EMAIL_CONFIRM_MSG), { status: 401, code: "email_not_confirmed" });
    }
    const msg = error.message || "Wrong email or password. Try again.";
    throw Object.assign(new Error(msg), { status: 401, code });
  }
  if (!data.session || !data.user) {
    if (owner && sharedPw) return ownerSoftSession(normEmail);
    throw new Error("Sign in failed");
  }

  let profile;
  try {
    profile = await fetchProfile(data.user.id);
  } catch (profErr: unknown) {
    const m = profErr instanceof Error ? profErr.message : String(profErr);
    // Owner escape hatch for RLS recursion / missing table / any profile read failure.
    if (owner) {
      clearSoftOwnerSession();
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
    if (/stack depth|does not exist|adspot_profiles/i.test(m)) {
      throw Object.assign(
        new Error("Sign-in profile lookup failed. Ask the owner to run the AdSpot auth SQL migration."),
        { status: 503, code: "profile_lookup_failed" },
      );
    }
    throw profErr;
  }
  if (!profile) {
    if (owner) {
      clearSoftOwnerSession();
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
    throw new Error("Profile not found — try again in a moment, or ask the owner to run the AdSpot auth SQL migration.");
  }
  if (profile.suspended) {
    await sb.auth.signOut();
    throw new Error("Account suspended");
  }

  // Pending gate: shared-admin password OR admin roles only — never block normal reviewer/brand.
  const adminRole = profile.role === "admin" || profile.role === "super_admin";
  if (!owner && profile.approval_status === "pending" && (sharedPw || adminRole)) {
    // Register the request before signing out, so the owner's queue shows
    // this person instead of leaving them stuck with no way to be seen.
    await requestAdminAccess(profile.email);
    await sb.auth.signOut();
    throw Object.assign(new Error(AWAITING_MSG), { status: 403, code: "pending_approval" });
  }

  profile = elevateOwnerProfile(profile);
  // Real JWT session — drop soft escape hatch so /auth/me uses the live session.
  if (owner) clearSoftOwnerSession();

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
  const role = input.role === "brand" ? "brand" : "reviewer";
  const username = input.username.trim();

  const { data, error } = await sb.auth.signUp({
    email,
    password: input.password,
    options: {
      data: {
        username,
        role,
        company_name: input.companyName ?? "",
        companyName: input.companyName ?? "",
      },
    },
  });
  if (error) {
    if (isEmailNotConfirmed(error)) {
      throw Object.assign(new Error(EMAIL_CONFIRM_MSG), { status: 401, code: "email_not_confirmed" });
    }
    throw error;
  }
  if (!data.user) throw new Error("Sign up failed");

  // Edge enrichment is best-effort; Postgres trigger is the primary path.
  if (data.session) {
    try {
      await invokeEdge("register-user", {
        username,
        role,
        companyName: input.companyName,
      });
    } catch {
      /* trigger should already have created profiles / role rows */
    }
  }

  let session = data.session;
  if (!session) {
    const { data: signIn, error: signInErr } = await sb.auth.signInWithPassword({
      email,
      password: input.password,
    });
    if (signInErr) {
      if (isEmailNotConfirmed(signInErr)) {
        throw Object.assign(new Error(EMAIL_CONFIRM_MSG), { status: 401, code: "email_not_confirmed" });
      }
      throw signInErr;
    }
    session = signIn.session;
  }

  if (!session) {
    throw Object.assign(new Error(EMAIL_CONFIRM_MSG), { status: 401, code: "email_not_confirmed" });
  }

  // If trigger ran but edge did not (no session at signup), retry edge once we have a session.
  try {
    await invokeEdge("register-user", {
      username,
      role,
      companyName: input.companyName,
    });
  } catch {
    /* ignore */
  }

  const profile = await waitForProfile(data.user.id);
  if (!profile) {
    throw new Error(
      "Profile creation failed. Ask the owner to paste the AdSpot auth SQL migration in Supabase, then try again.",
    );
  }

  return { user: profileToUser(profile), token: session.access_token };
}

export async function supabaseSignOut() {
  clearSoftOwnerSession();
  if (supabase) await supabase.auth.signOut();
}
