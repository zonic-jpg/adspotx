import { customFetch } from "@workspace/api-client-react";
import { publicError } from "../../lib/publicMessage";

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

/**
 * Message for a failed admin read. Signed-in admins keep the underlying
 * detail (they can act on it); anyone else gets copy they can act on.
 */
export function adminApiErrorMessage(error: unknown): string {
  return publicError(error, "Could not load data. Check your connection or try again.");
}
