import { createContext, useContext, useEffect, useState } from "react";
import type { LoginRequest, UserProfile } from "@workspace/api-client-react";
import { getMe, ApiError } from "@workspace/api-client-react";
import { supabaseLogin, supabaseSignOut, hasSupabase, supabase, isOwnerEmail, isOwnerSoftSession } from "@workspace/api-client-react";
import { useLocation } from "wouter";

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  login: (data: LoginRequest) => Promise<void>;
  establishSession: (token: string, user: UserProfile) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const initAuth = async () => {
      if (!hasSupabase) {
        setIsLoading(false);
        return;
      }
      try {
        const profile = await getMe();
        // Act-as Reviewer is a preview. Never destroy an admin/owner JWT.
        if (profile.role === "reviewer" || profile.role === "admin" || profile.role === "super_admin") {
          setUser(profile);
        } else {
          setUser(null);
        }
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          setUser(null);
        }
      }
      setIsLoading(false);
    };
    void initAuth();

    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { access_token?: string } | null) => {
      if (!session && !isOwnerSoftSession()) setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const establishSession = (_token: string, profile: UserProfile) => {
    setUser(profile);
  };

  const login = async (data: LoginRequest) => {
    const res = await supabaseLogin(data.email, data.password);
    if (isOwnerEmail(res.user.email) || res.user.role === "super_admin" || res.user.role === "admin") {
      setUser(res.user);
      window.location.href = "/brands/admin/dashboard#admintester-queue";
      return;
    }
    if (res.user.role !== "reviewer") {
      throw new Error("WRONG_PORTAL");
    }
    setUser(res.user);
    // Nest-relative: this AuthProvider lives inside wouter's `<Route path="/earn" nest>`,
    // so setLocation() here is scoped to that nest already. postLoginPath() returns an
    // absolute path ("/earn/dashboard") meant for window.location.href/hard navigation —
    // passing it to this nest-scoped setLocation double-prefixes to "/earn/earn/dashboard",
    // which matches no route and 404s. Register.tsx already does this correctly with a bare
    // "/dashboard"; mirror that here. (Owner/admin/super_admin already returned above via a
    // hard navigation, so every path reaching here is a real reviewer login.)
    setLocation("/dashboard");
  };

  const logout = () => {
    void supabaseSignOut();
    setUser(null);
    setLocation("/");
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, establishSession, logout }}>
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
