import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { useGetBrandAds, getGetBrandAdsQueryKey } from "@workspace/api-client-react";
import { customFetch } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@brands/hooks/use-toast";
import { Card, CardContent } from "@brands/components/ui/card";
import { Button } from "@brands/components/ui/button";
import { Skeleton } from "@brands/components/ui/skeleton";
import { Badge } from "@brands/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@brands/components/ui/table";
import { Plus, BarChart3, Star, Trash2 } from "lucide-react";

const PAGE_SIZE = 20;

function statusBadge(status: string) {
  switch (status) {
    case "active":   return <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white">Active</Badge>;
    case "paused":   return <Badge variant="secondary">Paused</Badge>;
    case "draft":    return <Badge variant="outline">Draft</Badge>;
    case "archived": return <Badge variant="destructive">Archived</Badge>;
    default:         return <Badge variant="outline">{status}</Badge>;
  }
}

export default function MyAds() {
  const [page, setPage] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useGetBrandAds({
    query: {
      queryKey: getGetBrandAdsQueryKey(),
    },
  });

  const allAds = data?.ads ?? [];
  const total = data?.total ?? 0;
  const pageAds = allAds.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const hasNext = (page + 1) * PAGE_SIZE < allAds.length;

  const handleDelete = async (adId: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? Campaigns with review history are archived instead.`)) return;
    setDeletingId(adId);
    try {
      const result = await customFetch<{ message: string }>(`/api/brands/ads/${adId}`, { method: "DELETE" });
      toast({ title: "Done", description: result.message });
      await queryClient.invalidateQueries({ queryKey: getGetBrandAdsQueryKey() });
    } catch (err: unknown) {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete campaign",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My Campaigns</h1>
          <p className="text-muted-foreground mt-1">
            {isLoading ? "Loading…" : `${total} campaign${total !== 1 ? "s" : ""} total`}
          </p>
        </div>
        <Link href="/ads/new">
          <Button className="gap-2" data-testid="btn-create-ad">
            <Plus className="w-4 h-4" />
            Create Ad
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Completions</TableHead>
                <TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Avg Rating</TableHead>
                <TableHead className="text-right">Points Awarded</TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="text-right w-24">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(8)].map((_, i) => (
                  <TableRow key={i}>
                    {[...Array(8)].map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : pageAds.length > 0 ? (
                pageAds.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell className="font-medium">
                      <Link href={`/ads/${ad.id}`} className="hover:underline hover:text-primary">
                        {ad.title}
                      </Link>
                    </TableCell>
                    <TableCell>{statusBadge(ad.status)}</TableCell>
                    <TableCell className="text-right tabular-nums">{ad.totalViews.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{ad.completedViews.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{(ad.completionRate * 100).toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      {ad.averageRating != null ? (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {ad.averageRating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{ad.pointsAwarded.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                      {new Date(ad.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={deletingId === ad.id || ad.status === "archived"}
                        onClick={() => handleDelete(ad.id, ad.title)}
                        data-testid={`btn-delete-ad-${ad.id}`}
                        title="Delete campaign"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                    <TableCell colSpan={9} className="h-40 text-center">
                    <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="font-medium text-foreground">No campaigns yet</p>
                    <p className="text-sm text-muted-foreground mt-1 mb-4">Create your first ad to start tracking performance.</p>
                    <Link href="/ads/new">
                      <Button variant="outline" size="sm">Create your first ad</Button>
                    </Link>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {allAds.length > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, allAds.length)} of {allAds.length}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button variant="outline" disabled={!hasNext} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
