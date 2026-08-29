import React, { useState } from "react";
import { useGetAdminAds, getGetAdminAdsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@brands/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@brands/components/ui/table";
import { Button } from "@brands/components/ui/button";
import { Skeleton } from "@brands/components/ui/skeleton";
import { Badge } from "@brands/components/ui/badge";

export default function AdminAds() {
  const [page, setPage] = useState(0);
  const limit = 20;

  const params = { limit, offset: page * limit };
  const { data, isLoading } = useGetAdminAds(params, {
    query: {
      queryKey: getGetAdminAdsQueryKey(params),
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-green-500">Active</Badge>;
      case "paused": return <Badge variant="secondary">Paused</Badge>;
      case "draft": return <Badge variant="outline">Draft</Badge>;
      case "archived": return <Badge variant="destructive">Archived</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">All Campaigns</h1>
        <p className="text-muted-foreground mt-1">Manage and audit all brand campaigns</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ad Title</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead className="text-right">Completions</TableHead>
                <TableHead className="text-right">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(10)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="w-32 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-24 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-16 h-4" /></TableCell>
                    <TableCell><Skeleton className="w-12 h-4 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="w-12 h-4 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="w-24 h-4 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data?.ads && data.ads.length > 0 ? (
                data.ads.map((ad) => (
                  <TableRow key={ad.id}>
                    <TableCell className="font-medium">{ad.title}</TableCell>
                    <TableCell>{ad.brandName}</TableCell>
                    <TableCell>{getStatusBadge(ad.status)}</TableCell>
                    <TableCell className="text-right">{ad.totalViews.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{ad.completedViews.toLocaleString()}</TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {new Date(ad.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No campaigns found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Showing {data?.ads.length || 0} of {data?.total || 0} campaigns
        </p>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            disabled={page === 0} 
            onClick={() => setPage(p => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button 
            variant="outline" 
            disabled={!data || (page + 1) * limit >= data.total} 
            onClick={() => setPage(p => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
