import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@earn/components/ui/form";
import { Input } from "@earn/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@earn/components/ui/radio-group";
import { useToast } from "@earn/hooks/use-toast";
import { useRegister, RegisterRequestRole, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@earn/contexts/AuthContext";
import { Loader2, Star, Trophy, Zap, Building2, User, ChevronRight, MapPin, Briefcase, Users } from "lucide-react";

const NIGERIAN_STATES = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno",
  "Cross River","Delta","Ebonyi","Edo","Ekiti","Enugu","FCT – Abuja","Gombe",
  "Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi","Kwara","Lagos",
  "Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto",
  "Taraba","Yobe","Zamfara",
];

const formSchema = z.object({
  username:    z.string().min(3, "At least 3 characters").max(20, "Max 20 characters"),
  email:       z.string().email("Invalid email address"),
  password:    z.string().min(8, "At least 8 characters"),
  role:        z.enum([RegisterRequestRole.reviewer, RegisterRequestRole.brand]),
  companyName: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.role === RegisterRequestRole.brand && (!data.companyName || data.companyName.trim() === "")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Company name is required", path: ["companyName"] });
  }
});

const profileSchema = z.object({
  gender:           z.enum(["male","female"]),
  ageBand:          z.enum(["18_24","25_34","35_44","45_54","55_plus"]),
  state:            z.string().min(1, "Please select your state"),
  employmentStatus: z.enum(["employed","self_employed","student","unemployed","retired"]),
});

type Step = "account" | "profile";

const INPUT_CLS = "h-12 border-2 border-black/[0.12] focus:border-[#e91e8c] text-[15px] font-medium bg-[#fafafa] placeholder:text-[#d1d5db] transition-colors";

async function saveProfile(data: z.infer<typeof profileSchema>) {
  await customFetch("/api/auth/profile", {
    method: "PATCH",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
}

export default function Register() {
  const { establishSession } = useAuth();
  const registerMutation = useRegister();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("account");
  const [savingProfile, setSavingProfile] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { username: "", email: "", password: "", role: RegisterRequestRole.reviewer, companyName: "" },
  });

  const profileForm = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { gender: undefined as any, ageBand: undefined as any, state: "", employmentStatus: undefined as any },
  });

  const selectedRole = form.watch("role");
  const isLoading = registerMutation.isPending;

  async function onSubmitAccount(values: z.infer<typeof formSchema>) {
    // Brand accounts belong in the Brand Portal
    if (values.role === RegisterRequestRole.brand) {
      window.location.href = '/brands/register';
      return;
    }

    registerMutation.mutate({ data: values }, {
      onSuccess: (data) => {
        toast({ title: "Account created!", description: "Welcome to AdSpot." });
        establishSession(data.token, data.user);
        setStep("profile");
      },
      onError: (error: any) => {
        toast({ variant: "destructive", title: "Registration failed", description: error.data?.message || "Problem creating your account. Try again." });
      },
    });
  }

  async function onSubmitProfile(values: z.infer<typeof profileSchema>) {
    setSavingProfile(true);
    try { await saveProfile(values); } catch { /* non-blocking */ }
    setSavingProfile(false);
    setLocation("/dashboard");
  }

  return (
    <div className="auth-grid">

      {/* ── Left panel ── */}
      <div className="hidden md:flex flex-col justify-between gradient-bg p-12 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white/[0.06] rotate-45 translate-x-24 -translate-y-16 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-56 h-56 bg-black/[0.06] rotate-[20deg] -translate-x-12 translate-y-12 pointer-events-none" />

        <Link href="/" className="flex items-center gap-2.5 relative z-10">
          <div className="h-9 w-9 bg-white/20 flex items-center justify-center">
            <span className="text-white font-black text-[17px]">A</span>
          </div>
          <span className="font-black text-[18px] text-white uppercase tracking-tight">AdSpot</span>
        </Link>

        <div className="relative z-10">
          {step === "profile" ? (
            <>
              <h2 className="text-[40px] font-black text-white leading-[0.92] tracking-[-0.04em] mb-8">
                Help brands reach<br />the right people.
              </h2>
              <p className="text-white/70 text-[14px] leading-relaxed mb-8">
                Your profile helps brands understand who's watching — and helps us match you with more relevant, higher-paying ads.
              </p>
              <div className="space-y-4">
                {[
                  { icon: Users,   text: "Get matched with ads relevant to you" },
                  { icon: Star,    text: "Earn bonus points for a complete profile" },
                  { icon: MapPin,  text: "See local Nigerian brand campaigns first" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/15 flex items-center justify-center shrink-0"><Icon size={14} className="text-white" /></div>
                    <p className="text-white/80 text-[14px] font-medium">{text}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="text-[44px] font-black text-white leading-[0.92] tracking-[-0.04em] mb-8">
                Join thousands<br />earning from<br /><span className="text-[#f9ca24]">Nigerian ads.</span>
              </h2>
              <div className="space-y-4">
                {[
                  { icon: Star,   text: "Points for every completed ad review" },
                  { icon: Trophy, text: "Weekly leaderboard with cash bonuses" },
                  { icon: Zap,    text: "Bonus multipliers for top reviewers" },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-white/15 flex items-center justify-center shrink-0"><Icon size={14} className="text-white" /></div>
                    <p className="text-white/80 text-[14px] font-medium">{text}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <p className="relative z-10 text-white/30 text-[12px] font-medium">Free to join · No card required</p>
      </div>

      {/* ── Right panel ── */}
      <div className="flex flex-col justify-center px-6 sm:px-12 md:px-16 py-16 bg-white min-h-screen md:min-h-0 overflow-y-auto">
        <div className="md:hidden mb-10">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 gradient-bg flex items-center justify-center">
              <span className="text-white font-black text-[14px]">A</span>
            </div>
            <span className="font-black text-[16px] text-[#0f0f14] uppercase tracking-tight">AdSpot</span>
          </Link>
        </div>

        {/* ── Step 1: Account ── */}
        {step === "account" && (
          <div className="max-w-sm w-full mx-auto">
            <div className="mb-8">
              <h1 className="text-[30px] font-black tracking-[-0.03em] text-[#0f0f14] mb-2">Create account</h1>
              <p className="text-[14px] text-[#9ca3af] font-medium">
                Already have one?{" "}
                <Link href="/login" className="text-[#f97316] font-bold hover:underline">Sign in</Link>
              </p>
            </div>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitAccount)} className="space-y-5">

                <FormField control={form.control} name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60">I want to</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="grid grid-cols-2 gap-2" disabled={isLoading}>
                          {[
                            { value: RegisterRequestRole.reviewer, icon: User,      title: "Earn Rewards", sub: "Review ads" },
                            { value: RegisterRequestRole.brand,    icon: Building2, title: "Promote Ads",  sub: "For brands" },
                          ].map(opt => (
                            <div key={opt.value} className="relative">
                              <RadioGroupItem value={opt.value} id={`role-${opt.value}`} className="sr-only peer" />
                              <label htmlFor={`role-${opt.value}`}
                                className="flex flex-col gap-1 p-4 border-2 border-black/[0.1] cursor-pointer transition-all peer-data-[state=checked]:border-[#f97316] peer-data-[state=checked]:bg-[#f97316]/[0.05] hover:border-black/[0.2]">
                                <opt.icon size={15} className="text-[#0f0f14]/50 mb-1" />
                                <span className="text-[13px] font-black text-[#0f0f14]">{opt.title}</span>
                                <span className="text-[11px] text-[#9ca3af] font-medium">{opt.sub}</span>
                              </label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                <FormField control={form.control} name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60">Username</FormLabel>
                      <FormControl><Input placeholder="coolreviewer99" disabled={isLoading} className={INPUT_CLS} {...field} /></FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                <FormField control={form.control} name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60">Email</FormLabel>
                      <FormControl><Input placeholder="you@example.com" type="email" autoComplete="email" disabled={isLoading} className={INPUT_CLS} {...field} /></FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                {selectedRole === RegisterRequestRole.brand && (
                  <FormField control={form.control} name="companyName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60">Company Name</FormLabel>
                        <FormControl><Input placeholder="Dangote Group Nigeria" disabled={isLoading} className={INPUT_CLS} {...field} /></FormControl>
                        <FormMessage className="text-[12px]" />
                      </FormItem>
                    )}
                  />
                )}

                <FormField control={form.control} name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60">Password</FormLabel>
                      <FormControl><Input placeholder="Min. 8 characters" type="password" autoComplete="new-password" disabled={isLoading} className={INPUT_CLS} {...field} /></FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                <button type="submit" disabled={isLoading}
                  className="btn btn-green w-full justify-center h-12 text-[15px] font-black disabled:opacity-60 mt-1">
                  {isLoading ? <><Loader2 size={16} className="animate-spin" /> Creating account…</> : "Create free account"}
                </button>

                <p className="text-[11px] text-[#9ca3af] text-center leading-relaxed">
                  By continuing you agree to our <a href="#" className="underline hover:text-[#0f0f14]">Terms</a> and <a href="#" className="underline hover:text-[#0f0f14]">Privacy Policy</a>.
                </p>
              </form>
            </Form>
          </div>
        )}

        {/* ── Step 2: Profile (reviewers only) ── */}
        {step === "profile" && (
          <div className="max-w-sm w-full mx-auto">
            <div className="mb-8">
              <div className="inline-flex items-center gap-1.5 bg-[#f97316]/10 text-[#c2410c] text-[12px] font-bold px-3 py-1.5 mb-4">
                <Star size={11} /> Step 2 of 2 — Tell us about yourself
              </div>
              <h1 className="text-[26px] font-black tracking-[-0.03em] text-[#0f0f14] mb-2">Complete your profile</h1>
              <p className="text-[13px] text-[#9ca3af] font-medium leading-relaxed">
                Brands use this to understand their audience. You can update it anytime.
              </p>
            </div>

            <Form {...profileForm}>
              <form onSubmit={profileForm.handleSubmit(onSubmitProfile)} className="space-y-6">

                {/* Gender */}
                <FormField control={profileForm.control} name="gender"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60">Gender</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-2">
                          {[
                            { value: "male",   label: "Male" },
                            { value: "female", label: "Female" },
                          ].map(opt => (
                            <div key={opt.value} className="relative">
                              <RadioGroupItem value={opt.value} id={`gender-${opt.value}`} className="sr-only peer" />
                              <label htmlFor={`gender-${opt.value}`}
                                className="flex items-center justify-center p-3 border-2 border-black/[0.1] cursor-pointer text-[13px] font-semibold text-center transition-all peer-data-[state=checked]:border-[#e91e8c] peer-data-[state=checked]:text-[#e91e8c] peer-data-[state=checked]:bg-[#e91e8c]/[0.04] hover:border-black/[0.2]">
                                {opt.label}
                              </label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                {/* Age band */}
                <FormField control={profileForm.control} name="ageBand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60">Age Group</FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-3 gap-2">
                          {[
                            { value: "18_24",   label: "18–24" },
                            { value: "25_34",   label: "25–34" },
                            { value: "35_44",   label: "35–44" },
                            { value: "45_54",   label: "45–54" },
                            { value: "55_plus", label: "55+" },
                          ].map(opt => (
                            <div key={opt.value} className="relative">
                              <RadioGroupItem value={opt.value} id={`age-${opt.value}`} className="sr-only peer" />
                              <label htmlFor={`age-${opt.value}`}
                                className="flex items-center justify-center p-3 border-2 border-black/[0.1] cursor-pointer text-[13px] font-bold text-center transition-all peer-data-[state=checked]:border-[#e91e8c] peer-data-[state=checked]:text-[#e91e8c] peer-data-[state=checked]:bg-[#e91e8c]/[0.04] hover:border-black/[0.2]">
                                {opt.label}
                              </label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                {/* State */}
                <FormField control={profileForm.control} name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60 flex items-center gap-1.5">
                        <MapPin size={11} /> State / Location
                      </FormLabel>
                      <FormControl>
                        <select {...field}
                          className="w-full h-12 border-2 border-black/[0.12] focus:border-[#e91e8c] text-[14px] font-medium bg-[#fafafa] px-3 outline-none transition-colors">
                          <option value="">Select your state…</option>
                          {NIGERIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                {/* Employment */}
                <FormField control={profileForm.control} name="employmentStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-[12px] font-black uppercase tracking-wider text-[#0f0f14]/60 flex items-center gap-1.5">
                        <Briefcase size={11} /> Employment Status
                      </FormLabel>
                      <FormControl>
                        <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-2 gap-2">
                          {[
                            { value: "employed",       label: "Employed" },
                            { value: "self_employed",  label: "Self-employed" },
                            { value: "student",        label: "Student" },
                            { value: "unemployed",     label: "Unemployed" },
                            { value: "retired",        label: "Retired" },
                          ].map(opt => (
                            <div key={opt.value} className="relative">
                              <RadioGroupItem value={opt.value} id={`emp-${opt.value}`} className="sr-only peer" />
                              <label htmlFor={`emp-${opt.value}`}
                                className="flex items-center justify-center p-3 border-2 border-black/[0.1] cursor-pointer text-[13px] font-semibold text-center transition-all peer-data-[state=checked]:border-[#e91e8c] peer-data-[state=checked]:text-[#e91e8c] peer-data-[state=checked]:bg-[#e91e8c]/[0.04] hover:border-black/[0.2]">
                                {opt.label}
                              </label>
                            </div>
                          ))}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage className="text-[12px]" />
                    </FormItem>
                  )}
                />

                <button type="submit" disabled={savingProfile}
                  className="btn btn-green w-full justify-center h-12 text-[15px] font-black disabled:opacity-60">
                  {savingProfile
                    ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
                    : <>Save & Start Earning <ChevronRight size={16} /></>}
                </button>

                <button type="button" onClick={() => setLocation("/dashboard")}
                  className="w-full text-[13px] text-[#9ca3af] hover:text-[#0f0f14] transition-colors py-2 font-medium">
                  Skip for now — I'll complete later
                </button>
              </form>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
