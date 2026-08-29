import { supabase } from "./supabase-client";
import type { UserProfile, UserProfileRole } from "./generated/api.schemas";

export type AdspotProfile = {
  id: string;
  email: string;
  username: string;
  role: UserProfileRole;
  suspended: boolean;
  approval_status: "approved" | "pending" | "revoked" | null;
  created_at: string;
};

function requireClient() {
  if (!supabase) throw new Error("Supabase not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY");
  return supabase;
}

export function profileToUser(p: AdspotProfile): UserProfile {
  return {
    id: p.id,
    email: p.email,
    username: p.username,
    role: p.role,
    createdAt: p.created_at,
  };
}

export async function fetchProfile(userId: string): Promise<AdspotProfile | null> {
  const sb = requireClient();
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data as AdspotProfile | null;
}

export async function getSessionToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export async function invokeEdge<T = unknown>(name: string, body?: Record<string, unknown>): Promise<T> {
  const sb = requireClient();
  const { data, error } = await sb.functions.invoke(name, { body: body ?? {} });
  if (error) throw error;
  if (data?.error) {
    const err = new Error(data.message ?? data.error) as Error & { status?: number };
    err.status = data.status ?? 400;
    throw err;
  }
  return data as T;
}

export { hasSupabase } from "./supabase-client";
