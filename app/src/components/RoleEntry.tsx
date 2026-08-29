import { PlayCircle, TrendingUp, ShieldCheck, ArrowRight } from "lucide-react";

type RegisterCTAsProps = {
  className?: string;
  size?: "default" | "lg";
};

export function RegisterCTAs({ className = "", size = "default" }: RegisterCTAsProps) {
  const sizeClasses =
    size === "lg"
      ? "px-6 py-3.5 text-base"
      : "px-5 py-3 text-sm";

  return (
    <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
      <a
        href="/earn/register"
        className={`inline-flex items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground transition-colors hover:bg-primary/90 ${sizeClasses}`}
      >
        <PlayCircle size={size === "lg" ? 18 : 16} />
        Register as Reviewer
      </a>
      <a
        href="/brands/register"
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card font-semibold text-foreground transition-colors hover:bg-muted ${sizeClasses}`}
      >
        <TrendingUp size={size === "lg" ? 18 : 16} />
        Register as Brand
      </a>
    </div>
  );
}

const ROLES = [
  {
    id: "reviewer",
    title: "Reviewer",
    description: "Watch ads, share feedback, earn points.",
    href: "/earn/login",
    icon: PlayCircle,
    primary: true,
  },
  {
    id: "brand",
    title: "Brand",
    description: "Run campaigns and see real results.",
    href: "/brands/login",
    icon: TrendingUp,
    primary: false,
  },
  {
    id: "admin",
    title: "Admin",
    description: "Manage users, ads, and payouts.",
    href: "/brands/login",
    icon: ShieldCheck,
    primary: false,
  },
] as const;

type RoleEntryProps = {
  variant?: "cards" | "buttons";
  className?: string;
};

export function RoleEntry({ variant = "cards", className = "" }: RoleEntryProps) {
  if (variant === "buttons") {
    return (
      <div className={`flex flex-col sm:flex-row gap-3 ${className}`}>
        {ROLES.map((role) => (
          <a
            key={role.id}
            href={role.href}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-colors ${
              role.primary
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "border border-border bg-card text-foreground hover:bg-muted"
            }`}
          >
            <role.icon size={16} />
            {role.title}
          </a>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 sm:grid-cols-3 ${className}`}>
      {ROLES.map((role) => (
        <a
          key={role.id}
          href={role.href}
          className={`group flex flex-col rounded-xl border p-5 transition-colors ${
            role.primary
              ? "border-primary/40 bg-primary/5 hover:border-primary/60"
              : "border-border bg-card hover:border-primary/30"
          }`}
        >
          <div
            className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${
              role.primary ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            <role.icon size={20} />
          </div>
          <h3 className="font-semibold text-foreground">{role.title}</h3>
          <p className="mt-1 flex-1 text-sm text-muted-foreground leading-relaxed">{role.description}</p>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
            Sign in <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </span>
        </a>
      ))}
    </div>
  );
}
