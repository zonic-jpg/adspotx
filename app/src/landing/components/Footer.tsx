import React from "react";
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="border-t border-black/10 bg-[hsl(220,15%,12%)] pt-16 pb-8">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-4 lg:gap-8">
          <div className="col-span-1 md:col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-6">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-display font-bold">
                A
              </div>
              <span className="font-display text-xl font-bold text-white tracking-tight">AdSpot</span>
            </Link>
            <p className="max-w-sm text-white/50 font-medium">
              Watch ads, share feedback, earn rewards. Real feedback for brands, real value for reviewers.
            </p>
          </div>

          <div>
            <h3 className="mb-4 font-display text-lg font-bold text-white">Reviewers</h3>
            <ul className="space-y-3">
              <li><a href="/earn" className="text-white/50 hover:text-primary transition-colors">Start Earning</a></li>
              <li><a href="/earn/leaderboard" className="text-white/50 hover:text-primary transition-colors">Leaderboard</a></li>
              <li><a href="/earn/dashboard" className="text-white/50 hover:text-primary transition-colors">Dashboard</a></li>
            </ul>
          </div>

          <div>
            <h3 className="mb-4 font-display text-lg font-bold text-white">Brands &amp; Admin</h3>
            <ul className="space-y-3">
              <li><a href="/brands/login" className="text-white/50 hover:text-primary transition-colors">Sign in</a></li>
              <li><a href="/#pricing" className="text-white/50 hover:text-primary transition-colors">Pricing</a></li>
              <li><a href="/partners" className="text-white/50 hover:text-primary transition-colors" data-testid="footer-adspotx-link">AdSpotX Network</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center justify-between border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm text-white/40">
            &copy; {new Date().getFullYear()} AdSpot Platform. All rights reserved.
          </p>
          <div className="mt-4 flex gap-6 md:mt-0">
            <span className="text-sm text-white/25 select-none">Privacy Policy</span>
            <span className="text-sm text-white/25 select-none">Terms of Service</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
