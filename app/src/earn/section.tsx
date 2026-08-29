import { Switch, Route, Redirect, useLocation } from "wouter";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import NotFound from "@earn/pages/not-found";

import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Profile from "@earn/pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import ReviewSession from "./pages/ReviewSession";
import { canActAs, effectivePortal, setActAs } from "@workspace/api-client-react";
import { useEffect } from "react";

function ProtectedRoute({ component: Component, roles }: { component: any; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Redirect to="/login" />;

  const elevated = canActAs(user.role);
  if (elevated) {
    // Ensure act-as reviewer when visiting earn routes as admin/super_admin
    if (effectivePortal(user.role) !== "reviewer") setActAs("reviewer");
  } else if (roles && !roles.includes(user.role)) {
    return <Redirect to="~/" />;
  }

  return <Component />;
}

function EarnRoutes() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  useEffect(() => {
    if (user && canActAs(user.role)) setActAs("reviewer");
  }, [user]);

  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} roles={["reviewer", "admin", "super_admin"]} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute component={Leaderboard} roles={["reviewer", "admin", "super_admin"]} />
      </Route>
      <Route path="/review/:id">
        <ProtectedRoute component={ReviewSession} roles={["reviewer", "admin", "super_admin"]} />
      </Route>

      <Route path="/brand">{() => { navigate("~/brands"); return null; }}</Route>
      <Route path="/admin">{() => { navigate("~/brands/admin/dashboard"); return null; }}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

export function EarnSection() {
  return (
    <AuthProvider>
      <EarnRoutes />
    </AuthProvider>
  );
}
