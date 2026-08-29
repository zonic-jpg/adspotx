import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@earn/contexts/AuthContext";
import { Menu, X } from "lucide-react";

interface NavbarProps {
  transparent?: boolean;
}

export function Navbar({ transparent = false }: NavbarProps) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(!transparent);

  useEffect(() => {
    if (!transparent) { setScrolled(true); return; }
    const onScroll = () => setScrolled(window.scrollY > 44);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [transparent]);

  // Only reviewers can be logged in here (brands/admins blocked at login via WRONG_PORTAL)
  const dashLink = user?.role === "reviewer" ? "/dashboard" : "/login";

  const isLight = transparent && !scrolled;

  const navLinks = [
    { href: "/#about", label: "About", external: true },
  ];

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
      scrolled
        ? "bg-white border-b-2 border-black/[0.07]"
        : "bg-black/10 backdrop-blur-sm border-b border-white/10"
    }`}>
      <div className="max-w-7xl mx-auto px-5 sm:px-8 h-[60px] flex items-center justify-between gap-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setOpen(false)}>
          <div className="h-8 w-8 bg-[#f97316] flex items-center justify-center">
            <span className="text-white font-black text-[15px] leading-none">A</span>
          </div>
          <span className={`font-black text-[17px] tracking-tight uppercase transition-colors ${isLight ? "text-white" : "text-[#0f0f14]"}`}>
            AdSpot
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6 flex-1 justify-end">
          {navLinks.map(l => {
            const cls = `text-[12px] font-bold uppercase tracking-wider transition-colors ${
              isLight ? "text-white/70 hover:text-white" : "text-[#0f0f14]/50 hover:text-[#0f0f14]"
            }`;
            return l.external
              ? <a key={l.href} href={l.href} className={cls}>{l.label}</a>
              : <Link key={l.href} href={l.href} className={cls}>{l.label}</Link>;
          })}
        </nav>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-2 shrink-0">
          {user ? (
            <>
              <Link href={dashLink}>
                <span className={`btn btn-sm cursor-pointer ${isLight ? "btn-white" : "btn-outline-dark"}`}>
                  Dashboard
                </span>
              </Link>
              <button onClick={logout}
                className={`text-[12px] font-bold uppercase tracking-wide px-3 py-2 transition-colors ${
                  isLight ? "text-white/60 hover:text-white" : "text-[#0f0f14]/40 hover:text-[#0f0f14]"
                }`}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login">
                <span className={`text-[12px] font-bold uppercase tracking-wide px-4 py-2 transition-colors cursor-pointer ${
                  isLight ? "text-white/70 hover:text-white" : "text-[#0f0f14]/50 hover:text-[#0f0f14]"
                }`}>
                  Sign in
                </span>
              </Link>
              <Link href="/register">
                <span className="btn btn-sm btn-green cursor-pointer">Get Started</span>
              </Link>
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <button
          className={`md:hidden p-2 transition-colors ${isLight ? "text-white/80" : "text-[#0f0f14]/60"}`}
          onClick={() => setOpen(!open)}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t-2 border-black/[0.07] px-5 py-5 space-y-1">
          {navLinks.map(l => {
            const cls = "block py-3 text-[14px] font-bold text-[#0f0f14]/70 hover:text-[#0f0f14] uppercase tracking-wide transition-colors border-b border-black/[0.05]";
            return l.external
              ? <a key={l.href} href={l.href} className={cls} onClick={() => setOpen(false)}>{l.label}</a>
              : <Link key={l.href} href={l.href} className={cls} onClick={() => setOpen(false)}>{l.label}</Link>;
          })}
          <div className="pt-4 flex flex-col gap-2">
            {user ? (
              <>
                <Link href={dashLink} onClick={() => setOpen(false)}>
                  <span className="btn btn-primary w-full justify-center">Dashboard</span>
                </Link>
                <button onClick={() => { logout(); setOpen(false); }}
                  className="text-[13px] font-semibold text-[#0f0f14]/50 text-center py-2">Sign out</button>
              </>
            ) : (
              <>
                <Link href="/register" onClick={() => setOpen(false)}>
                  <span className="btn btn-green w-full justify-center">Get Started Free</span>
                </Link>
                <Link href="/login" onClick={() => setOpen(false)}>
                  <span className="btn btn-outline-dark w-full justify-center">Sign in</span>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
