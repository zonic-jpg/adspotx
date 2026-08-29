import { Link, useLocation } from "wouter";
import { LayoutDashboard, Link2, Newspaper, PieChart, Rows3 } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/integration", label: "Integration", icon: Link2 },
  { href: "/slots", label: "Slots", icon: Rows3 },
  { href: "/revenue", label: "Revenue", icon: PieChart },
  { href: "/partners", label: "Partners", icon: Newspaper },
] as const;

export function Layout({ children }: { children: React.ReactNode }) {
  const [path] = useLocation();

  return (
    <div className="min-h-screen bg-[#f4f5f7] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">AdSpotX</p>
            <h1 className="text-xl font-bold">Partner Portal</h1>
          </div>
          <a
            href="/"
            className="text-sm font-medium text-slate-600 hover:text-[#f97316]"
          >
            ← Back to AdSpot
          </a>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 grid gap-8 lg:grid-cols-[220px_1fr]">
        <nav className="flex lg:flex-col gap-2 overflow-x-auto pb-2 lg:pb-0">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? path === "/" || path === "" : path.startsWith(href);
            return (
              <Link key={href} href={href}>
                <span
                  className={`inline-flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium cursor-pointer whitespace-nowrap ${
                    active
                      ? "bg-[#f97316] text-white"
                      : "text-slate-700 hover:bg-white border border-transparent hover:border-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </span>
              </Link>
            );
          })}
        </nav>
        <main>{children}</main>
      </div>
    </div>
  );
}
