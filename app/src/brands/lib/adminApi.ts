import { customFetch } from "@workspace/api-client-react";

/** Authenticated fetch — routes through Supabase backend when configured. */
export async function adminApiFetch<T = unknown>(path: string, opts?: RequestInit): Promise<T> {
  const normalized = path.startsWith("/api") ? path : `/api${path.startsWith("/") ? path : `/${path}`}`;
  return customFetch<T>(normalized, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts?.headers ?? {}),
    },
  });
}

export function adminApiErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    // Soft/owner empty fallbacks should not surface raw unauthorized banners.
    if (/unauthorized/i.test(error.message) && typeof localStorage !== "undefined") {
      try {
        if (localStorage.getItem("adspot_owner_soft") === "1") {
          return "Admin data unavailable in soft session — confirm owner Auth email for live stats.";
        }
      } catch {
        /* ignore */
      }
    }
    return error.message;
  }
  return "Could not load data. Check your connection or try again.";
}
