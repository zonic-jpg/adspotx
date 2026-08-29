import { supabase } from "./supabase-client";
import { fetchProfile, invokeEdge, profileToUser } from "./supabase-auth";
import { identityToEmail, isApproved, isOwnerEmail, isRevoked, isSharedAdminPassword } from "./admin-tester";
import type { UserProfile } from "./generated/api.schemas";

export function postLoginPath(role: UserProfile["role"]): string {
  if (role === "reviewer") return "/earn/dashboard";
  if (role === "admin" || role === "super_admin") return "/brands/admin/dashboard";
  return "/brands/dashboard";
}

export async function supabaseLogin(email: string, password: string): Promise<{ user: UserProfile; token: string }> {
  const sb = supabase!;
  const normEmail = identityToEmail(email);

  if (isSharedAdminPassword(password) && !isOwnerEmail(normEmail)) {
    if (isRevoked(normEmail)) throw Object.assign(new Error("Admin access was revoked."), { status: 403 });
    if (!isApproved(normEmail)) {
      throw Object.assign(new Error("Awaiting approval — the owner must approve your admin access."), {
        status: 403,
        code: "pending_approval",
      });
    }
  }

  const { data, error } = await sb.auth.signInWithPassword({ email: normEmail, password });
  if (error) throw Object.assign(error, { status: 401 });
  if (!data.session || !data.user) throw new Error("Sign in failed");

  const profile = await fetchProfile(data.user.id);
  if (!profile) throw new Error("Profile not found");
  if (profile.suspended) {
    await sb.auth.signOut();
    throw new Error("Account suspended");
  }
  if (profile.approval_status === "pending") {
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
  const sb = supabase!;
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
