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

function ProtectedRoute({ component: Component, roles }: { component: any; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!user) return <Redirect to="/login" />;
  if (roles && !roles.includes(user.role)) return <Redirect to="~/" />;

  return <Component />;
}

function EarnRoutes() {
  const [, navigate] = useLocation();
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />

      <Route path="/dashboard">
        <ProtectedRoute component={Dashboard} roles={["reviewer"]} />
      </Route>
      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>
      <Route path="/leaderboard">
        <ProtectedRoute component={Leaderboard} roles={["reviewer"]} />
      </Route>
      <Route path="/review/:id">
        <ProtectedRoute component={ReviewSession} roles={["reviewer"]} />
      </Route>

      {/* Brand and Admin users belong in the Brand section — navigate in-app. */}
      <Route path="/brand">{() => { navigate("~/brands"); return null; }}</Route>
      <Route path="/admin">{() => { navigate("~/brands"); return null; }}</Route>

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
