import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useGetAdminEvents, getGetAdminEventsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@brands/components/ui/card";
import { Skeleton } from "@brands/components/ui/skeleton";
import {
  Activity, Users, Megaphone, CheckCircle, Shield,
  Coins, Clock, UserCheck, Store, ArrowRight, AlertCircle,
} from "lucide-react";
import { Link } from "wouter";
import { adminApiFetch, adminApiErrorMessage } from "@brands/lib/adminApi";
import { AdminTesterQueue } from "../../../components/AdminTesterQueue";

type AdminStats = {
  totalUsers: number;
  totalReviewers: number;
  totalBrands: number;
  totalAdmins: number;
  totalAds: number;
  activeAds: number;
  totalCompletions: number;
  totalPointsIssued: number;
  pendingRedemptions: number;
  completedRedemptions: number;
};

function StatCard({ title, value, sub, icon: Icon, loading, href, highlight }: {
  title: string; value?: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  loading: boolean; href?: string; highlight?: boolean;
}) {
  const inner = (
    <Card className={`h-full ${href ? "hover:border-primary/40 cursor-pointer transition-colors" : ""} ${highlight ? "border-amber-300 bg-amber-50/50" : ""}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            {loading ? (
              <Skeleton className="h-7 w-16 mt-2" />
            ) : (
              <p className="text-2xl font-bold mt-1 tabular-nums">{value ?? "—"}</p>
            )}
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" size={16} />
        </div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

const QUICK_ACTIONS = [
  { label: "Manage users", href: "/admin/users", icon: Users },
  { label: "All ads", href: "/admin/ads", icon: Megaphone },
  { label: "AdSpotX", href: "/admin/adspotx", icon: Shield },
  { label: "Payouts", href: "/admin/financials", icon: Coins },
  { label: "Event log", href: "/admin/events", icon: Activity },
];

const EVENT_LABELS: Record<string, string> = {
  "admin.user.create": "New user created",
  "admin.user.update": "User updated",
  "admin.user.delete": "User removed",
  "admin.ad.create": "Ad created",
  "admin.ad.update": "Ad updated",
  "admin.ad.delete": "Ad removed",
  "admin.redemption.approve": "Payout approved",
  "admin.redemption.reject": "Payout rejected",
  "admin.points.grant": "Points granted",
  "admin.brand.create": "Brand created",
};

function friendlyEventLabel(type: string): string {
  if (EVENT_LABELS[type]) return EVENT_LABELS[type];
  return type.replace(/^admin\./, "").replace(/\./g, " · ").replace(/_/g, " ");
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
      <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export default function AdminDashboard() {
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErr,
  } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => adminApiFetch("/admin/stats"),
    staleTime: 30000,
  });

  const {
    data: eventsData,
    isLoading: eventsLoading,
    isError: eventsError,
    error: eventsErr,
  } = useGetAdminEvents(
    { limit: 6 },
    { query: { queryKey: getGetAdminEventsQueryKey({ limit: 6 }) } },
  );

  const pendingPayouts = stats?.pendingRedemptions ?? 0;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6" data-testid="admin-dashboard-page">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Admin overview</h1>
        <p className="text-sm text-muted-foreground mt-1">Key numbers at a glance</p>
      </div>

      {statsError && <ErrorBanner message={adminApiErrorMessage(statsErr)} />}

      <AdminTesterQueue appId="adspotx" />

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {QUICK_ACTIONS.map(({ label, href, icon: Icon }) => (
          <Link key={href} href={href}>
            <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-3 hover:border-primary/40 transition-colors">
              <Icon size={16} className="text-primary shrink-0" />
              <span className="text-sm font-medium truncate">{label}</span>
              <ArrowRight size={14} className="text-muted-foreground ml-auto shrink-0" />
            </div>
          </Link>
        ))}
      </div>

      {/* Single scannable stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard title="Users" icon={Users} value={stats?.totalUsers?.toLocaleString()} loading={statsLoading} href="/admin/users" />
        <StatCard title="Reviewers" icon={UserCheck} value={stats?.totalReviewers?.toLocaleString()} loading={statsLoading} href="/admin/users" />
        <StatCard title="Brands" icon={Store} value={stats?.totalBrands?.toLocaleString()} loading={statsLoading} />
        <StatCard title="Admins" icon={Shield} value={stats?.totalAdmins?.toLocaleString()} loading={statsLoading} />
        <StatCard title="Total ads" icon={Megaphone} value={stats?.totalAds?.toLocaleString()} sub={`${stats?.activeAds ?? 0} active`} loading={statsLoading} href="/admin/ads" />
        <StatCard title="Reviews done" icon={CheckCircle} value={stats?.totalCompletions?.toLocaleString()} loading={statsLoading} />
        <StatCard title="Points issued" icon={Coins} value={stats?.totalPointsIssued?.toLocaleString()} loading={statsLoading} href="/admin/financials" />
        <StatCard
          title="Pending payouts"
          icon={Clock}
          value={pendingPayouts}
          loading={statsLoading}
          href="/admin/financials"
          highlight={pendingPayouts > 0}
        />
      </div>

      {/* Recent activity */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Recent activity</CardTitle>
          <Link href="/admin/events" className="text-sm text-primary hover:underline font-medium">
            View all
          </Link>
        </CardHeader>
        <CardContent>
          {eventsError ? (
            <ErrorBanner message={adminApiErrorMessage(eventsErr)} />
          ) : eventsLoading ? (
            <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : eventsData?.events && eventsData.events.length > 0 ? (
            <div className="divide-y">
              {eventsData.events.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{friendlyEventLabel(event.eventType)}</p>
                    <p className="text-xs text-muted-foreground capitalize">{event.entityType}</p>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                    {new Date(event.createdAt).toLocaleString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center py-6 text-sm text-muted-foreground">No recent activity.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
