import { Route, Switch } from "wouter";
import { Layout } from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import IntegrationPage from "./pages/Integration";
import SlotsPage from "./pages/Slots";
import RevenuePage from "./pages/Revenue";
import PartnersPage from "./pages/Partners";
import "./index.css";

export function PartnerPortalApp() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/integration" component={IntegrationPage} />
        <Route path="/slots" component={SlotsPage} />
        <Route path="/revenue" component={RevenuePage} />
        <Route path="/partners" component={PartnersPage} />
        <Route component={Dashboard} />
      </Switch>
    </Layout>
  );
}

export default PartnerPortalApp;
