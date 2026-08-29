import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@brands/contexts/AuthContext";
import { Button } from "@brands/components/ui/button";
import { Sheet, SheetContent } from "@brands/components/ui/sheet";
import {
  LayoutDashboard, Megaphone, Users, Activity,
  LogOut, Plus, Shield, Settings, Menu, DollarSign, Network,
} from "lucide-react";

function NavLinks({
  links,
  location,
  onNavClick,
}: {
  links: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  location: string;
  onNavClick?: () => void;
}) {
  return (
    <nav className="space-y-1">
      {links.map((link) => {
        const active = location === link.href || location.startsWith(`${link.href}/`);
        return (
          <Link key={link.href} href={link.href} onClick={onNavClick}>
            <div
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors cursor-pointer ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              }`}
              data-testid={`nav-${link.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <link.icon className="w-4 h-4 shrink-0" />
              <span className="text-sm">{link.label}</span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarInner({
  user,
  links,
  location,
  logout,
  isAdmin,
  onNavClick,
}: {
  user: { username: string; email: string };
  links: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  location: string;
  logout: () => void;
  isAdmin: boolean;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="p-5 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight text-sidebar-foreground mb-8">
          <div className="w-7 h-7 bg-sidebar-primary rounded flex items-center justify-center text-sidebar-primary-foreground text-sm font-black">
            A
          </div>
          <span>AdSpot {isAdmin ? "Admin" : "Brand"}</span>
        </div>
        <NavLinks links={links} location={location} onNavClick={onNavClick} />
      </div>

      <div className="p-4 border-t border-sidebar-border bg-sidebar shrink-0">
        {!isAdmin && (
          <div className="mb-3">
            <Link href="/ads/new" onClick={onNavClick}>
              <Button
                className="w-full flex items-center gap-2 bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90 font-semibold"
                data-testid="nav-create-ad"
              >
                <Plus className="w-4 h-4" />
                Create Ad
              </Button>
            </Link>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-semibold text-sidebar-foreground truncate">{user.username}</span>
            <span className="text-xs text-sidebar-foreground/50 truncate">{user.email}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={logout}
            className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
            data-testid="nav-logout"
            title="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  const isAdmin = user.role === "admin" || user.role === "super_admin";

  const brandLinks = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/ads",       label: "My Ads",    icon: Megaphone },
    { href: "/settings",  label: "Settings",  icon: Settings },
  ];

  const adminLinks = [
    { href: "/admin/dashboard",   label: "Overview",   icon: Shield },
    { href: "/admin/users",       label: "Users",      icon: Users },
    { href: "/admin/financials",  label: "Financials", icon: DollarSign },
    { href: "/admin/adspotx",     label: "AdSpotX",    icon: Network },
    { href: "/admin/events",      label: "Event Log",  icon: Activity },
    { href: "/admin/ads",         label: "All Ads",    icon: Megaphone },
  ];

  const links = isAdmin ? adminLinks : brandLinks;

  const sidebarProps = { user, links, location, logout, isAdmin };

  return (
    <div className="flex h-[100dvh] w-full bg-background overflow-hidden">

      {/* ── Desktop sidebar (≥ lg) ─────────────────────────────────── */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r border-sidebar-border">
        <SidebarInner {...sidebarProps} />
      </aside>

      {/* ── Mobile drawer (< lg) ───────────────────────────────────── */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="p-0 w-72 border-r border-sidebar-border bg-sidebar [&>button]:text-sidebar-foreground [&>button]:hover:bg-sidebar-accent"
        >
          <SidebarInner {...sidebarProps} onNavClick={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* ── Content column ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-sidebar border-b border-sidebar-border shrink-0">
          <div className="flex items-center gap-2 font-bold text-base text-sidebar-foreground">
            <div className="w-6 h-6 bg-sidebar-primary rounded flex items-center justify-center text-sidebar-primary-foreground text-xs font-black">
              A
            </div>
            <span>AdSpot {isAdmin ? "Admin" : "Brand"}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileOpen(true)}
            className="text-sidebar-foreground hover:bg-sidebar-accent"
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </header>

        <main className="flex-1 overflow-auto bg-background">
          {children}
        </main>
      </div>
    </div>
  );
}
