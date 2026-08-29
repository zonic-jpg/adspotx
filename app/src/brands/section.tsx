import { Switch, Route, Redirect } from "wouter";
import { AuthProvider, useAuth } from "@brands/contexts/AuthContext";
import NotFound from "@brands/pages/not-found";

import Login from "@brands/pages/Login";
import Register from "@brands/pages/Register";
import Dashboard from "@brands/pages/Dashboard";
import MyAds from "@brands/pages/ads/MyAds";
import CreateAd from "@brands/pages/ads/CreateAd";
import AdDetail from "@brands/pages/ads/AdDetail";
import AdminDashboard from "@brands/pages/admin/AdminDashboard";
import AdminEvents from "@brands/pages/admin/AdminEvents";
import AdminAds from "@brands/pages/admin/AdminAds";
import AdminUsers from "@brands/pages/admin/AdminUsers";
import AdminFinancials from "@brands/pages/admin/AdminFinancials";
import AdminAdSpotX from "@brands/pages/admin/AdminAdSpotX";
import Settings from "@brands/pages/Settings";

import { DashboardLayout } from "@brands/components/layout/DashboardLayout";

function ProtectedRoute({ component: Component, adminOnly = false }: { component: React.ComponentType<any>; adminOnly?: boolean }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
  }
  if (!user) {
    return <Redirect to="/login" />;
  }

  const isAdminRole = user.role === "admin" || user.role === "super_admin";
  if (adminOnly && !isAdminRole) return <Redirect to="/dashboard" />;
  if (!adminOnly && isAdminRole) return <Redirect to="/admin/dashboard" />;

  return (
    <DashboardLayout>
      <Component />
    </DashboardLayout>
  );
}

function BrandRoutes() {
  const { user } = useAuth();
  return (
    <Switch>
      <Route path="/">
        {() => (
          <Redirect
            to={
              user
                ? ["admin", "super_admin"].includes(user.role)
                  ? "/admin/dashboard"
                  : "/dashboard"
                : "/login"
            }
          />
        )}
      </Route>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>
      <Route path="/ads">{() => <ProtectedRoute component={MyAds} />}</Route>
      <Route path="/ads/new">{() => <ProtectedRoute component={CreateAd} />}</Route>
      <Route path="/ads/:id">{() => <ProtectedRoute component={AdDetail} />}</Route>
      <Route path="/settings">{() => <ProtectedRoute component={Settings} />}</Route>

      <Route path="/admin">{() => <Redirect to="/admin/dashboard" />}</Route>
      <Route path="/admin/dashboard">{() => <ProtectedRoute component={AdminDashboard} adminOnly />}</Route>
      <Route path="/admin/events">{() => <ProtectedRoute component={AdminEvents} adminOnly />}</Route>
      <Route path="/admin/ads">{() => <ProtectedRoute component={AdminAds} adminOnly />}</Route>
      <Route path="/admin/users">{() => <ProtectedRoute component={AdminUsers} adminOnly />}</Route>
      <Route path="/admin/financials">{() => <ProtectedRoute component={AdminFinancials} adminOnly />}</Route>
      <Route path="/admin/adspotx">{() => <ProtectedRoute component={AdminAdSpotX} adminOnly />}</Route>
      <Route path="/admin/partners">{() => <Redirect to="/admin/adspotx" />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export function BrandSection() {
  return (
    <AuthProvider>
      <BrandRoutes />
    </AuthProvider>
  );
}
