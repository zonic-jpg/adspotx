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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(!hasSupabase);
  const sessionUserRef = useRef<UserProfile | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { access_token?: string } | null) => {
      if (!session) {
        sessionUserRef.current = null;
        queryClient.removeQueries({ queryKey: brandMeQueryKey() });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  const { data: user, isLoading: isUserLoading, error } = useGetMe({
    query: {
      enabled: ready && hasSupabase,
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
      logout();
    }
  }, [error]);

  const isLoading = !ready || (hasSupabase && isUserLoading && !sessionUserRef.current);

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
