import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@earn/contexts/AuthContext";
import { LayoutDashboard, Trophy, LogOut, ChevronRight } from "lucide-react";

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();

  const links = [
    { href: "/dashboard",   label: "Dashboard",   icon: LayoutDashboard },
    { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  ];

  const roleLabel = "Reviewer";

  return (
    <div className="min-h-screen bg-[#f8f8f8] flex">

      {/* ── Sidebar ── */}
      <aside className="hidden md:flex flex-col w-56 bg-[#0f0f14] shrink-0">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 px-5 h-[60px] border-b border-white/[0.08] shrink-0">
          <div className="h-7 w-7 gradient-bg flex items-center justify-center">
            <span className="text-white font-black text-[13px]">A</span>
          </div>
          <span className="font-black text-[15px] text-white uppercase tracking-tight">AdSpot</span>
        </Link>

        {/* User pill */}
        <div className="px-5 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 gradient-bg flex items-center justify-center text-white text-[11px] font-black shrink-0">
              {user?.username?.[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="min-w-0">
              <p className="text-white text-[13px] font-bold truncate leading-tight">{user?.username ?? "User"}</p>
              <p className="text-white/35 text-[9px] font-black uppercase tracking-[0.12em]">{roleLabel}</p>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {links.map(({ href, label, icon: Icon }) => {
            const active = location === href || (href.length > 1 && location.startsWith(href));
            return (
              <Link key={href} href={href}>
                <div className={`flex items-center gap-3 px-5 py-3 text-[12px] font-bold uppercase tracking-[0.08em] transition-all border-l-2 ${
                  active
                    ? "bg-white/[0.09] text-white border-l-[#f97316]"
                    : "text-white/40 hover:text-white/80 hover:bg-white/[0.05] border-l-transparent"
                }`}>
                  <Icon size={14} />
                  {label}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-5 py-4 border-t border-white/[0.08]">
          <button onClick={logout}
            className="flex items-center gap-2.5 text-[11px] font-black text-white/30 hover:text-white/70 transition-colors uppercase tracking-wider w-full">
            <LogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <div className="h-[60px] bg-white border-b-2 border-black/[0.06] flex items-center justify-between px-5 sm:px-7 shrink-0">
          <div className="flex items-center gap-2 text-[12px]">
            <Link href="/" className="text-[#9ca3af] hover:text-[#0f0f14] font-black uppercase tracking-wider transition-colors">AdSpot</Link>
            <ChevronRight size={11} className="text-[#d1d5db]" />
            <span className="font-black text-[#0f0f14] text-[13px] uppercase tracking-wide">{title ?? "Dashboard"}</span>
          </div>

          {/* Mobile nav icons */}
          <div className="md:hidden flex items-center gap-1.5">
            {links.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}>
                <div
                  title={label}
                  className={`w-8 h-8 flex items-center justify-center transition-all ${
                    location === href ? "gradient-bg text-white" : "bg-[#f0f0f0] text-[#9ca3af] hover:text-[#0f0f14]"
                  }`}
                >
                  <Icon size={14} />
                </div>
              </Link>
            ))}
            <button
              onClick={logout}
              title="Sign out"
              className="w-8 h-8 flex items-center justify-center bg-[#f0f0f0] text-[#9ca3af] hover:text-[#0f0f14] transition-colors"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1 p-5 sm:p-7 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
