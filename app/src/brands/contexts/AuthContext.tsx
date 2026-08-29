import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey } from "@workspace/api-client-react";
import { ApiError } from "@workspace/api-client-react";
import type { UserProfile } from "@workspace/api-client-react";
import { supabaseSignOut, hasSupabase, supabase } from "@workspace/api-client-react";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (token: string, userFromLogin?: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const brandMeQueryKey = () => [...getGetMeQueryKey(), "brand"] as const;

function isOwnerSoftSession() {
  try {
    return localStorage.getItem("adspot_owner_soft") === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(!hasSupabase);
  const sessionUserRef = useRef<UserProfile | null>(null);
  const softOwner = isOwnerSoftSession();

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { access_token?: string } | null) => {
      // Soft owner session has no Supabase JWT — do not wipe it on null session.
      if (!session && !isOwnerSoftSession()) {
        sessionUserRef.current = null;
        queryClient.removeQueries({ queryKey: brandMeQueryKey() });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const { data: user, isLoading: isUserLoading, error } = useGetMe({
    query: {
      // Soft owner bypasses /auth/me (no JWT until FINISH.sh confirms email).
      enabled: ready && hasSupabase && !softOwner && !sessionUserRef.current,
      retry: false,
      queryKey: brandMeQueryKey(),
    },
  });

  const resolvedUser = user ?? sessionUserRef.current;

  const login = (_newToken: string, userFromLogin?: UserProfile) => {
    sessionUserRef.current = userFromLogin ?? null;
    if (userFromLogin) {
      queryClient.setQueryData(brandMeQueryKey(), userFromLogin);
    } else {
      void queryClient.invalidateQueries({ queryKey: brandMeQueryKey() });
    }
  };

  const logout = () => {
    sessionUserRef.current = null;
    try {
      localStorage.removeItem("adspot_owner_soft");
    } catch {
      /* ignore */
    }
    void supabaseSignOut();
    queryClient.removeQueries({ queryKey: brandMeQueryKey() });
    window.location.href = "/brands/login";
  };

  useEffect(() => {
    if (user) sessionUserRef.current = null;
  }, [user]);

  useEffect(() => {
    if (!error) return;
    if (error instanceof ApiError && error.status === 401) {
      if (isOwnerSoftSession() || sessionUserRef.current) return;
      logout();
    }
  }, [error]);

  const isLoading =
    !ready || (hasSupabase && !softOwner && isUserLoading && !sessionUserRef.current);

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
