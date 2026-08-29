import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@brands/components/ui/card";
import { Badge } from "@brands/components/ui/badge";
import { Button } from "@brands/components/ui/button";
import { Skeleton } from "@brands/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@brands/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@brands/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from "@brands/components/ui/dialog";
import { Textarea } from "@brands/components/ui/textarea";
import { Label } from "@brands/components/ui/label";
import {
  DollarSign, Coins, CheckCircle, Clock, Building2, TrendingUp,
  RefreshCw, AlertCircle, Users, Megaphone,
} from "lucide-react";
import { useToast } from "@brands/hooks/use-toast";
import { adminApiFetch, adminApiErrorMessage } from "@brands/lib/adminApi";

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

type Redemption = {
  id: string;
  amountPoints: number;
  redemptionType: string;
  status: "pending" | "processing" | "completed" | "failed";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  userId: string;
  userEmail: string;
  username: string;
};

type PointsEntry = {
  id: string;
  amount: number;
  source: string;
  description: string | null;
  createdAt: string;
  userId: string;
  userEmail: string;
  username: string;
};

type Brand = {
  id: string;
  companyName: string;
  website: string | null;
  logoUrl: string | null;
  createdAt: string;
  userEmail: string;
  username: string;
  adCount: number;
};

function KpiCard({ title, value, sub, icon: Icon, color, loading }: {
  title: string; value?: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string; size?: number }>;
  color?: string; loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color ?? "text-muted-foreground"}`} size={16} />
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-8 w-24" /> : (
          <>
            <div className={`text-2xl font-bold ${color ? "" : "text-foreground"}`}
              style={color?.startsWith("#") ? { color } : undefined}>
              {value ?? "—"}
            </div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLOR[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function RedemptionsTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionModal, setActionModal] = useState<{ id: string; username: string; amountPoints: number; action: string } | null>(null);
  const [notes, setNotes] = useState("");

  const qs = statusFilter !== "all" ? `?status=${statusFilter}&limit=50` : "?limit=50";
  const { data, isLoading, refetch } = useQuery<{ redemptions: Redemption[]; total: number }>({
    queryKey: ["admin-redemptions", statusFilter],
    queryFn: () => adminApiFetch(`/admin/redemptions${qs}`),
    staleTime: 20000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: string; notes?: string }) =>
      adminApiFetch(`/admin/redemptions/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
      }),
    onSuccess: () => {
      toast({ title: "Redemption updated" });
      setActionModal(null);
      setNotes("");
      qc.invalidateQueries({ queryKey: ["admin-redemptions"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: () => toast({ variant: "destructive", title: "Update failed" }),
  });

  const redemptions: Redemption[] = data?.redemptions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{data?.total ?? 0} total</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : redemptions.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No redemptions found.</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reviewer</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Points</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Requested</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {redemptions.map(r => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.username}</div>
                    <div className="text-xs text-muted-foreground">{r.userEmail}</div>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.redemptionType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{r.amountPoints.toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    {r.status === "pending" && (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50"
                          onClick={() => { setActionModal({ id: r.id, username: r.username, amountPoints: r.amountPoints, action: "processing" }); setNotes(""); }}>
                          Process
                        </Button>
                        <Button size="sm" variant="outline"
                          className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => { setActionModal({ id: r.id, username: r.username, amountPoints: r.amountPoints, action: "failed" }); setNotes(""); }}>
                          Reject
                        </Button>
                      </div>
                    )}
                    {r.status === "processing" && (
                      <Button size="sm" variant="outline"
                        className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50"
                        onClick={() => { setActionModal({ id: r.id, username: r.username, amountPoints: r.amountPoints, action: "completed" }); setNotes(""); }}>
                        Mark Paid
                      </Button>
                    )}
                    {(r.status === "completed" || r.status === "failed") && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!actionModal} onOpenChange={open => !open && setActionModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionModal?.action === "processing" && "Mark as Processing"}
              {actionModal?.action === "completed" && "Mark as Paid / Completed"}
              {actionModal?.action === "failed" && "Reject Redemption"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Reviewer: <span className="font-semibold text-foreground">{actionModal?.username}</span> •{" "}
              <span className="font-mono font-semibold text-foreground">{actionModal?.amountPoints?.toLocaleString()} pts</span>
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Add a note for internal records..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button
              className={actionModal?.action === "failed" ? "bg-red-600 hover:bg-red-700 text-white" :
                actionModal?.action === "completed" ? "bg-green-600 hover:bg-green-700 text-white" : ""}
              disabled={updateMutation.isPending}
              onClick={() => actionModal && updateMutation.mutate({ id: actionModal.id, status: actionModal.action, notes: notes || undefined })}>
              {updateMutation.isPending ? "Saving..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PointsLedgerTab() {
  const [page, setPage] = useState(0);
  const limit = 50;
  const { data, isLoading, refetch } = useQuery<{ entries: PointsEntry[]; total: number }>({
    queryKey: ["admin-points-ledger", page],
    queryFn: () => adminApiFetch(`/admin/points?limit=${limit}&offset=${page * limit}`),
    staleTime: 20000,
  });

  const entries: PointsEntry[] = data?.entries ?? [];
  const total: number = data?.total ?? 0;
  const pages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{total.toLocaleString()} total transactions</span>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : entries.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No points transactions yet.</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reviewer</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Source</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{e.username}</div>
                    <div className="text-xs text-muted-foreground">{e.userEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted capitalize">
                      {e.source.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{e.description ?? "—"}</td>
                  <td className={`px-4 py-3 text-right font-mono font-bold ${e.amount > 0 ? "text-green-600" : "text-red-600"}`}>
                    {e.amount > 0 ? "+" : ""}{e.amount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {new Date(e.createdAt).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}

function BrandsTab() {
  const { data, isLoading, refetch } = useQuery<{ brands: Brand[]; total: number }>({
    queryKey: ["admin-brands"],
    queryFn: () => adminApiFetch("/admin/brands?limit=100"),
    staleTime: 30000,
  });

  const brands: Brand[] = data?.brands ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{data?.total ?? 0} registered brands</span>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : brands.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No brands registered yet.</CardContent></Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Brand</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Account</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Website</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Ad Campaigns</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {brands.map(b => (
                <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {b.logoUrl ? (
                        <img src={b.logoUrl} alt={b.companyName} className="w-7 h-7 rounded object-contain bg-muted" />
                      ) : (
                        <div className="w-7 h-7 rounded bg-orange-100 flex items-center justify-center text-orange-600 text-xs font-bold">
                          {b.companyName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium">{b.companyName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{b.username}</div>
                    <div className="text-xs text-muted-foreground">{b.userEmail}</div>
                  </td>
                  <td className="px-4 py-3">
                    {b.website ? (
                      <a href={b.website} target="_blank" rel="noreferrer"
                        className="text-primary hover:underline text-xs truncate max-w-[160px] block">
                        {b.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${
                      b.adCount > 0 ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                    }`}>
                      {b.adCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminFinancials() {
  const { data: stats, isLoading: statsLoading, isError: statsError, error: statsErr, refetch: refetchStats } = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: () => adminApiFetch("/admin/stats"),
    staleTime: 30000,
  });

  const totalRedemptionRequests = (stats?.pendingRedemptions ?? 0) + (stats?.completedRedemptions ?? 0);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="admin-financials-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Activity</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Points economy, redemptions, and brand spending overview</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchStats()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {statsError && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{adminApiErrorMessage(statsErr)}</span>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total Points Issued" icon={Coins}
          value={stats?.totalPointsIssued !== undefined ? stats.totalPointsIssued.toLocaleString() + " pts" : undefined}
          sub="Lifetime across all reviewers" color="text-orange-500" loading={statsLoading} />
        <KpiCard title="Pending Payouts" icon={Clock}
          value={stats?.pendingRedemptions}
          sub="Awaiting processing" color="text-amber-500" loading={statsLoading} />
        <KpiCard title="Completed Payouts" icon={CheckCircle}
          value={stats?.completedRedemptions}
          sub="Successfully paid out" color="text-green-600" loading={statsLoading} />
        <KpiCard title="Active Brands" icon={Building2}
          value={stats?.totalBrands}
          sub={`${stats?.totalAds ?? 0} total ad campaigns`} loading={statsLoading} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <TrendingUp className="h-5 w-5 text-orange-500" />
              <span className="font-semibold text-orange-800">Engagement Economy</span>
            </div>
            {statsLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className="text-3xl font-bold text-orange-700">
                  {stats?.totalCompletions?.toLocaleString() ?? "0"}
                </div>
                <p className="text-sm text-orange-600 mt-1">Total ad reviews completed on platform</p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Reviewer Base</span>
            </div>
            {statsLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className="text-3xl font-bold">{stats?.totalReviewers?.toLocaleString() ?? "0"}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  {stats && stats.totalReviewers > 0 && stats.totalPointsIssued > 0
                    ? `Avg ${Math.round(stats.totalPointsIssued / stats.totalReviewers).toLocaleString()} pts/reviewer`
                    : "Reviewers earning on the platform"}
                </p>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-2">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">Campaign Activity</span>
            </div>
            {statsLoading ? <Skeleton className="h-12 w-full" /> : (
              <>
                <div className="text-3xl font-bold">{stats?.activeAds ?? 0}</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Active ads of {stats?.totalAds ?? 0} total campaigns
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {(stats?.pendingRedemptions ?? 0) > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm font-medium text-amber-800">
            {stats!.pendingRedemptions} redemption request{stats!.pendingRedemptions > 1 ? "s" : ""} pending your review in the Redemptions tab.
          </p>
        </div>
      )}

      <Tabs defaultValue="redemptions">
        <TabsList>
          <TabsTrigger value="redemptions" className="gap-1.5">
            <DollarSign className="h-3.5 w-3.5" /> Redemptions
            {(stats?.pendingRedemptions ?? 0) > 0 && (
              <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5">
                {stats!.pendingRedemptions}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="ledger" className="gap-1.5">
            <Coins className="h-3.5 w-3.5" /> Points Ledger
          </TabsTrigger>
          <TabsTrigger value="brands" className="gap-1.5">
            <Building2 className="h-3.5 w-3.5" /> Brands
          </TabsTrigger>
        </TabsList>
        <TabsContent value="redemptions" className="mt-4"><RedemptionsTab /></TabsContent>
        <TabsContent value="ledger" className="mt-4"><PointsLedgerTab /></TabsContent>
        <TabsContent value="brands" className="mt-4"><BrandsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
