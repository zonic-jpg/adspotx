import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@earn/components/ui/form";
import { Input } from "@earn/components/ui/input";
import { useAuth } from "@earn/contexts/AuthContext";
import { ApiError } from "@workspace/api-client-react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { RoleEntry } from "../../components/RoleEntry";
import { PasswordRecovery } from "../../components/PasswordRecovery";
import { publicError } from "../../lib/publicMessage";

const formSchema = z.object({
  email:    z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export default function Login() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [wrongPortal, setWrongPortal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    setFormError(null);
    setWrongPortal(false);
    try {
      setIsLoading(true);
      await login(values);
    } catch (error: any) {
      if (error?.message === "WRONG_PORTAL") {
        setWrongPortal(true);
        setFormError("This account uses the Brand Portal. You'll be redirected shortly.");
        setTimeout(() => { window.location.href = "/brands/login"; }, 2000);
        return;
      }
      const raw =
        error instanceof ApiError
          ? (error.data as { message?: string } | null)?.message ?? error.message
          : error;
      setFormError(publicError(raw, "Wrong email or password. Try again."));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex flex-col">
      <header className="bg-white border-b border-black/10 px-4 sm:px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 gradient-bg flex items-center justify-center">
            <span className="text-white font-black text-sm">A</span>
          </div>
          <span className="font-black text-base text-[#0f0f14] uppercase tracking-tight">AdSpot</span>
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-[#0f0f14] mb-1">Reviewer sign in</h1>
            <p className="text-sm text-[#6b7280]">
              New here?{" "}
              <Link href="/register" className="text-[#f97316] font-semibold hover:underline">
                Create account
              </Link>
            </p>
          </div>

          <div className="mb-6">
            <p className="text-xs font-medium text-[#9ca3af] text-center mb-3">Not a reviewer?</p>
            <RoleEntry variant="buttons" className="justify-center [&_a:first-child]:hidden" />
          </div>

          <div className="bg-white rounded-xl border border-black/10 p-6 shadow-sm">
            {formError && (
              <div
                role="alert"
                className={`mb-4 rounded-lg px-4 py-3 text-sm ${
                  wrongPortal
                    ? "bg-amber-50 text-amber-800 border border-amber-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
              >
                {formError}
              </div>
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField control={form.control} name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Email</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="you@example.com"
                          type="email"
                          autoComplete="email"
                          disabled={isLoading}
                          className="h-11"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField control={form.control} name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            placeholder="Your password"
                            type={showPassword ? "text" : "password"}
                            autoComplete="current-password"
                            disabled={isLoading}
                            className="h-11 pr-10"
                            {...field}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#0f0f14]"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn btn-green w-full justify-center h-11 text-sm font-bold disabled:opacity-60"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign in"
                  )}
                </button>
                <a href="#forgot" className="block text-center text-xs text-[#16a34a] hover:underline mt-3">
                  Forgot password?
                </a>
              </form>
            </Form>
          </div>

          <p className="text-center mt-6">
            <Link href="/" className="text-sm text-[#9ca3af] hover:text-[#0f0f14]">
              ← Back to home
            </Link>
          </p>
        </div>
      </main>
      <PasswordRecovery brand="AdSpot Earn" />
    </div>
  );
}
