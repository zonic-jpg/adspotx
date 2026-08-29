import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Rubba-style static env reads — Vite only inlines literal `import.meta.env.VITE_*`. */
const url = String(import.meta.env.VITE_SUPABASE_URL ?? "").trim();
const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "").trim();

export function isValidSupabaseUrl(value: string): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export const hasBackend = Boolean(isValidSupabaseUrl(url) && anon);

let client: SupabaseClient | null = null;
if (hasBackend) {
  try {
    client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  } catch (err) {
    console.warn("[supabase] createClient failed:", (err as Error)?.message ?? err);
    client = null;
  }
} else if (url || anon) {
  console.warn("[supabase] incomplete VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — auth disabled");
}

export const supabase: SupabaseClient | null = client;
export const hasSupabase = !!supabase;
export const supabaseConfigError = hasSupabase
  ? null
  : "Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).";
