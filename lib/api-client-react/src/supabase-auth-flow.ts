import { hasSupabase, supabase } from "./supabase-client";
import { fetchProfile, invokeEdge, profileToUser } from "./supabase-auth";
import {
  OWNER_EMAIL,
  identityToEmail,
  isApproved,
  isOwnerEmail,
  isRevoked,
  isSharedAdminPassword,
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
  if (supabase) await supabase.auth.signOut();
}
