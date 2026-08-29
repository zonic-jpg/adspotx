import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Link, useLocation } from "wouter";
import { useAuth } from "@brands/contexts/AuthContext";
import { supabaseLogin, postLoginPath } from "@workspace/api-client-react";
import { Button } from "@brands/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@brands/components/ui/form";
import { Input } from "@brands/components/ui/input";
import { Loader2 } from "lucide-react";
import { RoleEntry } from "../../components/RoleEntry";
import { isSharedAdminPassword, resolveAdminGateLogin, isOwnerEmail } from "../../lib/adminTesterApproval";

const loginSchema = z.object({
  email: z.string().min(1, "Email or username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const { login: setAuth, user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    const owner = isOwnerEmail(user.email ?? "");
    if (owner && (user.role === "admin" || user.role === "super_admin")) {
      setLocation("/admin/dashboard#admintester-queue");
    } else {
      setLocation(postLoginPath(user.role));
    }
  }, [user, authLoading, setLocation]);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    if (isSharedAdminPassword(values.password)) {
      const gate = resolveAdminGateLogin(values.email, values.password, "adspotx");
      if (!gate.ok) {
        setFormError(gate.message || "Awaiting approval");
        return;
      }
    }
    setPending(true);
    try {
      const data = await supabaseLogin(values.email, values.password);
      if (data.user.role === "reviewer") {
        setFormError("Reviewer accounts sign in at the Earn portal (/earn/login).");
        return;
      }
      setAuth(data.token, data.user);
      setLocation(postLoginPath(data.user.role));
    } catch (error: unknown) {
      const err = error as Error & { code?: string; status?: number };
      if (err.code === "pending_approval" || err.status === 403) {
        setFormError(err.message || "Awaiting approval");
        return;
      }
      setFormError(err.message || "Wrong email or password. Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b px-4 sm:px-6 py-4">
        <a href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">A</span>
          </div>
          <span className="font-bold text-lg">AdSpot</span>
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-1">Brand or admin sign in</h1>
            <p className="text-sm text-muted-foreground">
              Use the same login for brand and admin accounts.
            </p>
          </div>

          <div className="mb-6">
            <p className="text-xs font-medium text-muted-foreground text-center mb-3">Looking to earn as a reviewer?</p>
            <RoleEntry variant="buttons" className="justify-center [&_a:not(:first-child)]:hidden [&_a:first-child]:flex-1" />
          </div>

          <div className="rounded-xl border bg-card p-6 shadow-sm">
            {formError && (
              <div role="alert" className="mb-4 rounded-lg px-4 py-3 text-sm bg-destructive/10 text-destructive border border-destructive/20">
                {formError}
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email or username</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@company.com or admin"
                          type="text"
                          autoComplete="username"
                          className="h-11"
                          disabled={pending}
                          {...field}
                          data-testid="input-email"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="Your password"
                          autoComplete="current-password"
                          className="h-11"
                          disabled={pending}
                          {...field}
                          data-testid="input-password"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold"
                  disabled={pending}
                  data-testid="btn-submit-login"
                >
                  {pending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </Button>
              </form>
            </Form>

            <p className="text-sm text-muted-foreground text-center mt-5">
              No account?{" "}
              <Link href="/register" className="text-primary font-semibold hover:underline">
                Register
              </Link>
            </p>
          </div>

          <p className="text-center mt-6">
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
              ← Back to home
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
