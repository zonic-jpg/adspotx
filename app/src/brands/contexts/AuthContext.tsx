import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import { setDiagnosticsAudience } from "../../lib/publicMessage";
import type { UserProfile } from "@workspace/api-client-react";
import {
  supabaseSignOut,
  hasSupabase,
  supabase,
  isOwnerEmail,
  isOwnerSoftSession,
  loadSoftOwnerUser,
  clearSoftOwnerSession,
} from "@workspace/api-client-react";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (token: string, userFromLogin?: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const brandMeQueryKey = () => [...getGetMeQueryKey(), "brand"] as const;

function elevateIfOwner(user: UserProfile | null | undefined): UserProfile | null {
  if (!user) return null;
  if (!isOwnerEmail(user.email ?? "")) return user;
  if (user.role === "super_admin" || user.role === "admin") return user;
  return { ...user, role: "super_admin" };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(!hasSupabase);
  const [softBoot] = useState<UserProfile | null>(() => elevateIfOwner(loadSoftOwnerUser<UserProfile>()));
  const [softOwner, setSoftOwner] = useState(() => isOwnerSoftSession());
  const sessionUserRef = useRef<UserProfile | null>(softBoot);
  // Force re-render when login() writes the ref (refs alone do not).
  const [sessionTick, setSessionTick] = useState(0);

  useEffect(() => {
    if (!softBoot) return;
    queryClient.setQueryData(brandMeQueryKey(), softBoot);
  }, [queryClient, softBoot]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { access_token?: string } | null) => {
      // Soft owner session has no Supabase JWT — do not wipe it on null session.
      if (!session && !isOwnerSoftSession()) {
        sessionUserRef.current = null;
        queryClient.removeQueries({ queryKey: brandMeQueryKey() });
        setSessionTick((n) => n + 1);
      }
      setSoftOwner(isOwnerSoftSession());
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const holdSessionUser = sessionTick >= 0 && !!sessionUserRef.current;

  const { data: user, isLoading: isUserLoading, error } = useGetMe({
    query: {
      // Skip /auth/me while login/soft boot already established the user — prevents a racing
      // 401 from wiping the owner before authMe elevation runs.
      enabled: ready && hasSupabase && !holdSessionUser,
      retry: false,
      queryKey: brandMeQueryKey(),
    },
  });

  const resolvedUser = useMemo(() => {
    return elevateIfOwner(user ?? sessionUserRef.current ?? softBoot);
  }, [user, softBoot, sessionTick]);

  const login = (_newToken: string, userFromLogin?: UserProfile) => {
    const elevated = elevateIfOwner(userFromLogin ?? null);
    sessionUserRef.current = elevated;
    setSoftOwner(isOwnerSoftSession());
    setSessionTick((n) => n + 1);
    if (elevated) {
      queryClient.setQueryData(brandMeQueryKey(), elevated);
    } else {
      void queryClient.invalidateQueries({ queryKey: brandMeQueryKey() });
    }
  };

  const logout = () => {
    sessionUserRef.current = null;
    clearSoftOwnerSession();
    setSoftOwner(false);
    void supabaseSignOut();
    queryClient.removeQueries({ queryKey: brandMeQueryKey() });
    window.location.href = "/brands/login";
  };

  useEffect(() => {
    if (!user) return;
    const elevated = elevateIfOwner(user);
    if (elevated && elevated.role !== user.role) {
      queryClient.setQueryData(brandMeQueryKey(), elevated);
    }
    // Keep owner in session ref so a demoted/stale profile cannot force logout.
    if (elevated && isOwnerEmail(elevated.email ?? "")) {
      sessionUserRef.current = elevated;
      setSessionTick((n) => n + 1);
      return;
    }
    sessionUserRef.current = null;
    setSessionTick((n) => n + 1);
  }, [user, queryClient]);

  useEffect(() => {
    if (!error) return;
    if (error instanceof ApiError && error.status === 401) {
      if (isOwnerSoftSession() || softOwner) return;
      if (sessionUserRef.current && isOwnerEmail(sessionUserRef.current.email ?? "")) return;
      const cached = queryClient.getQueryData<UserProfile>(brandMeQueryKey());
      if (cached && isOwnerEmail(cached.email ?? "")) return;
      logout();
    }
  }, [error, softOwner, queryClient]);

  const isLoading =
    !ready ||
    (hasSupabase && !softOwner && !holdSessionUser && !softBoot && isUserLoading);

  // Admins can act on infrastructure detail, so they keep the original error
  // text that the public message guard hides from everyone else.
  useEffect(() => {
    const role = resolvedUser?.role;
    setDiagnosticsAudience(role === "admin" || role === "super_admin");
  }, [resolvedUser?.role]);

  return (
    <AuthContext.Provider value={{ user: resolvedUser ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
