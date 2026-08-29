import { Link } from "wouter";
import { Button } from "@landing/components/ui/button";

export function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">
            A
          </div>
          <span className="font-bold text-xl text-foreground tracking-tight">AdSpot</span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <a href="#benefits" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Benefits
          </a>
          <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            How it works
          </a>
          <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            Pricing
          </a>
        </div>

        <div className="flex items-center gap-2">
          <a href="/earn/register" className="inline-flex" data-testid="landing-start-earning-nav">
            <Button size="sm" className="font-semibold">
              Start earning
            </Button>
          </a>
          <a href="/earn/login" className="hidden sm:inline-flex">
            <Button variant="ghost" size="sm" className="font-medium">
              Sign in
            </Button>
          </a>
          <a href="/brands/login" className="hidden sm:inline-flex">
            <Button variant="outline" size="sm" className="font-semibold text-foreground border-border">
              Brand
            </Button>
          </a>
        </div>
      </div>
    </nav>
  );
}
