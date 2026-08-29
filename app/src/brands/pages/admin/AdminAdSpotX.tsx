import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IntegrateAdSpotButton } from "@workspace/partner-portal/IntegrateAdSpotButton";
import { Card, CardContent, CardHeader, CardTitle } from "@brands/components/ui/card";
import { Button } from "@brands/components/ui/button";
import { Input } from "@brands/components/ui/input";
import { Label } from "@brands/components/ui/label";
import { Badge } from "@brands/components/ui/badge";
import { Skeleton } from "@brands/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@brands/components/ui/table";
import {
  BarChart3, Link2, Newspaper, Plus, RefreshCw, Users,
} from "lucide-react";
import { Link } from "wouter";

import { adminApiFetch } from "@brands/lib/adminApi";

type PartnerRow = {
  id: string;
  name: string;
  outletType: string;
  region?: string | null;
  contactEmail?: string | null;
  integration: {
    adspotLinked: boolean;
    status: "active" | "inactive";
    activatedAt?: string | null;
  };
};

type PartnerAnalytics = {
  partnerId: string;
  period: string;
  activeSlots: number;
  impressions: number;
  completions: number;
  campaignsRouted: number;
  revenueShareNgn: number;
  integrationStatus: string;
};

function StatCard({
  title,
  value,
  hint,
  loading,
}: {
  title: string;
  value: string;
  hint?: string;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <>
            <p className="text-2xl font-bold">{value}</p>
            {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAdSpotX() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", outletType: "newspaper", region: "", contactEmail: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery<{ partners: PartnerRow[]; total: number }>({
    queryKey: ["admin-partners"],
    queryFn: () => adminApiFetch("/partners"),
  });

  const partners = data?.partners ?? [];
  const activeId = selectedId ?? partners[0]?.id ?? null;

  const { data: analyticsData, isLoading: analyticsLoading } = useQuery<{ analytics: PartnerAnalytics }>({
    queryKey: ["partner-analytics", activeId],
    queryFn: () => adminApiFetch(`/partners/${activeId}/analytics`),
    enabled: !!activeId,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; outletType: string; region?: string; contactEmail?: string }) =>
      adminApiFetch<{ partner: PartnerRow }>("/partners", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (res: { partner: PartnerRow }) => {
      void qc.invalidateQueries({ queryKey: ["admin-partners"] });
      setSelectedId(res.partner.id);
      setShowCreate(false);
      setForm({ name: "", outletType: "newspaper", region: "", contactEmail: "" });
      setFormError(null);
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const activeCount = partners.filter((p) => p.integration.adspotLinked).length;
  const analytics = analyticsData?.analytics;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Partner name is required");
      return;
    }
    createMutation.mutate({
      name: form.name.trim(),
      outletType: form.outletType,
      region: form.region || undefined,
      contactEmail: form.contactEmail || undefined,
    });
  };

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6" data-testid="adspotx-admin-page">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316] mb-1">AdSpotX</p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Network Partners</h1>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Load publishers into the partner portal, monitor integration status, and view network analytics — all from the admin console.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="adspotx-refresh">
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setShowCreate((v) => !v)} data-testid="adspotx-create-toggle">
            <Plus className="h-4 w-4 mr-1" />
            Add partner
          </Button>
          <Link href="~/partners">
            <Button variant="secondary" size="sm" data-testid="adspotx-open-portal">
              <Newspaper className="h-4 w-4 mr-1" />
              Partner portal
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Network partners"
          value={String(partners.length)}
          hint="Registered outlets"
          loading={isLoading}
        />
        <StatCard
          title="AdSpot connected"
          value={String(activeCount)}
          hint="Active integrations"
          loading={isLoading}
        />
        <StatCard
          title="Network impressions (30d)"
          value={analytics?.impressions?.toLocaleString() ?? "—"}
          hint={activeId ? "Selected partner" : "Select a partner"}
          loading={analyticsLoading && !!activeId}
        />
      </div>

      {showCreate && (
        <Card data-testid="adspotx-create-form">
          <CardHeader>
            <CardTitle className="text-lg">Create network partner</CardTitle>
          </CardHeader>
          <CardContent>
            {formError && (
              <p role="alert" className="text-sm text-destructive mb-4">{formError}</p>
            )}
            <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="partner-name">Outlet name</Label>
                <Input
                  id="partner-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Daily Tribune"
                  data-testid="adspotx-input-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-type">Outlet type</Label>
                <Input
                  id="partner-type"
                  value={form.outletType}
                  onChange={(e) => setForm((f) => ({ ...f, outletType: e.target.value }))}
                  placeholder="newspaper"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-region">Region</Label>
                <Input
                  id="partner-region"
                  value={form.region}
                  onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                  placeholder="Lagos"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner-email">Contact email</Label>
                <Input
                  id="partner-email"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="partners@outlet.com"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" disabled={createMutation.isPending} data-testid="adspotx-submit-create">
                  {createMutation.isPending ? "Creating…" : "Create partner"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5" />
              Partner directory
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : partners.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">No partners yet. Add one to get started.</p>
            ) : (
              <Table data-testid="adspotx-partner-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((p) => (
                    <TableRow
                      key={p.id}
                      className={`cursor-pointer ${activeId === p.id ? "bg-muted/50" : ""}`}
                      onClick={() => setSelectedId(p.id)}
                      data-testid={`adspotx-partner-row-${p.id}`}
                    >
                      <TableCell>
                        <p className="font-medium">{p.name}</p>
                        {p.region && <p className="text-xs text-muted-foreground">{p.region}</p>}
                      </TableCell>
                      <TableCell className="text-sm">{p.outletType}</TableCell>
                      <TableCell>
                        {p.integration.adspotLinked ? (
                          <Badge className="bg-emerald-600" data-testid="partner-status-active">Connected</Badge>
                        ) : (
                          <Badge variant="secondary" data-testid="partner-status-inactive">Inactive</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {activeId ? (
            <>
              <Card data-testid="adspotx-analytics-panel">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Partner analytics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {analyticsLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ) : analytics ? (
                    <dl className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Impressions</dt>
                        <dd className="text-lg font-semibold">{analytics.impressions.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Completions</dt>
                        <dd className="text-lg font-semibold">{analytics.completions.toLocaleString()}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Campaigns routed</dt>
                        <dd className="text-lg font-semibold">{analytics.campaignsRouted}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Rev-share (NGN)</dt>
                        <dd className="text-lg font-semibold">₦{analytics.revenueShareNgn.toLocaleString()}</dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-muted-foreground">Active slots</dt>
                        <dd className="text-lg font-semibold">{analytics.activeSlots}</dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-muted-foreground">No analytics available.</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Link2 className="h-5 w-5" />
                    Integration control
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <IntegrateAdSpotButton
                    partnerId={activeId}
                    onStatusChange={() => {
                      void qc.invalidateQueries({ queryKey: ["admin-partners"] });
                      void qc.invalidateQueries({ queryKey: ["partner-analytics", activeId] });
                    }}
                  />
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground text-sm">
                Select a partner to view analytics and manage integration.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
