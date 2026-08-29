import { createContext, useContext, useEffect, useState } from "react";
import type { LoginRequest, UserProfile } from "@workspace/api-client-react";
import { getMe, ApiError } from "@workspace/api-client-react";
import { supabaseLogin, supabaseSignOut, postLoginPath, hasSupabase, supabase } from "@workspace/api-client-react";
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
        if (profile.role !== "reviewer") {
          await supabaseSignOut();
          setUser(null);
        } else {
          setUser(profile);
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
      if (!session) setUser(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const establishSession = (_token: string, profile: UserProfile) => {
    setUser(profile);
  };

  const login = async (data: LoginRequest) => {
    const res = await supabaseLogin(data.email, data.password);
    if (res.user.role !== "reviewer") {
      await supabaseSignOut();
      throw new Error("WRONG_PORTAL");
    }
    setUser(res.user);
    setLocation(postLoginPath(res.user.role));
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
