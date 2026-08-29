import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function viteEnv(key: string): string {
  const raw = (import.meta as ImportMeta & { env?: Record<string, string> }).env?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

export function isValidSupabaseUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

const url = viteEnv("VITE_SUPABASE_URL");
const anon = viteEnv("VITE_SUPABASE_ANON_KEY");

let client: SupabaseClient | null = null;
if (isValidSupabaseUrl(url) && anon) {
  try {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  } catch (err) {
    console.warn("[supabase] createClient failed:", (err as Error)?.message ?? err);
    client = null;
  }
} else if (typeof console !== "undefined" && (url || anon)) {
  console.warn("[supabase] incomplete VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — auth disabled");
}

export const supabase = client;
export const hasSupabase = !!supabase;
export const supabaseConfigError =
  hasSupabase
    ? null
    : "Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).";
