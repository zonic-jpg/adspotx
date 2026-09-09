import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { AuthProvider, useAuth } from "@brands/contexts/AuthContext";
import { supabaseLogin, hasSupabase, setActAs, canActAs } from "@workspace/api-client-react";
import { Button } from "@brands/components/ui/button";
import { Input } from "@brands/components/ui/input";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AWAITING_MSG, isOwnerEmail, isSharedAdminPassword } from "../../lib/adminTesterApproval";
import { publicError } from "../../lib/publicMessage";

const SIGNIN_UNAVAILABLE_MSG =
  "Sign-in is temporarily unavailable. Please try again shortly.";

// This is the ONLY form in the app that ever accepts the shared admin
// password (see supabaseLogin's `allowAdminGate` option) — deliberately
// not the regular brand/reviewer login (@brands/pages/Login.tsx,
// @earn/pages/Login.tsx), and deliberately not linked from any public nav,
// header, or footer. It is reachable only by navigating to /admin directly.
function AdminGateForm() {
  const { login: setAuth, user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !user) return;
    const elevated = canActAs(user.role) || isOwnerEmail(user.email ?? "");
    if (elevated) {
      setActAs("admin");
      setLocation(
        `~/brands/admin/dashboard${isOwnerEmail(user.email ?? "") ? "#admintester-queue" : ""}`,
      );
    }
  }, [user, authLoading, setLocation]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!hasSupabase) {
      setFormError(SIGNIN_UNAVAILABLE_MSG);
      return;
    }
    setPending(true);
    try {
      const data = await supabaseLogin(email, password, {
        allowAdminGate: isSharedAdminPassword(password),
      });
      const elevated = canActAs(data.user.role) || isOwnerEmail(data.user.email ?? "");
      if (!elevated) {
        setFormError("This account does not have admin access.");
        return;
      }
      setAuth(data.token, data.user);
      setActAs("admin");
      setLocation(
        `~/brands/admin/dashboard${isOwnerEmail(data.user.email ?? "") ? "#admintester-queue" : ""}`,
      );
    } catch (error: unknown) {
      const err = error as Error & { code?: string; status?: number };
      if (err.code === "supabase_not_configured" || err.status === 503) {
        setFormError(SIGNIN_UNAVAILABLE_MSG);
        return;
      }
      if (err.code === "pending_approval") {
        setFormError(err.message || AWAITING_MSG);
        return;
      }
      setFormError(publicError(err, "Incorrect admin credentials."));
    } finally {
      setPending(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold mb-1">Admin access</h1>
          <p className="text-sm text-muted-foreground">
            {user
              ? "This account does not have admin access."
              : "Sign in to manage AdSpotX."}
          </p>
        </div>

        <form onSubmit={submit} className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Email or username</label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Admin password</label>
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" size={16} /> : "Enter"}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function AdminGate() {
  return (
    <AuthProvider>
      <AdminGateForm />
    </AuthProvider>
  );
}
