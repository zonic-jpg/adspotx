import { Switch, Route, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@earn/components/ui/tooltip";
import { Toaster } from "@earn/components/ui/toaster";

import Landing from "@landing/pages/Landing";
import NotFound from "@landing/pages/not-found";
import { SectionErrorBoundary } from "./components/SectionErrorBoundary";
import { EarnSection } from "@earn/section";
import { BrandSection } from "@brands/section";
import { PartnerSection } from "./partners/section";
import AdminGate from "@brands/pages/AdminGate";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Switch>
          {/* Landing is the single entry point. Its buttons route in-app. */}
          <Route path="/">
            <SectionErrorBoundary section="landing"><Landing /></SectionErrorBoundary>
          </Route>

          {/* "Start Earning" — reviewer platform (adspot-web) */}
          <Route path="/earn" nest>
            <SectionErrorBoundary section="earn"><EarnSection /></SectionErrorBoundary>
          </Route>

          {/* "For Brands" — brand platform (adspot-brand) */}
          <Route path="/brands" nest>
            <SectionErrorBoundary section="brands"><BrandSection /></SectionErrorBoundary>
          </Route>

          {/* Network partner management — distinct from earn/brands */}
          <Route path="/partners" nest>
            <SectionErrorBoundary section="partners"><PartnerSection /></SectionErrorBoundary>
          </Route>

          {/* Legacy bare paths — redirect into sectioned auth routes */}
          <Route path="/login">{() => <Redirect to="/earn/login" />}</Route>
          <Route path="/register">{() => <Redirect to="/earn/register" />}</Route>

          {/* The ONLY admin sign-in surface in the app — never linked from any
              public nav/header/footer. AdminGate itself sends an already-
              elevated visitor on to /brands/admin/dashboard. */}
          <Route path="/admin">
            <SectionErrorBoundary section="admin-gate"><AdminGate /></SectionErrorBoundary>
          </Route>
          <Route path="/admin/:rest*">
            <SectionErrorBoundary section="admin-gate"><AdminGate /></SectionErrorBoundary>
          </Route>

          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
