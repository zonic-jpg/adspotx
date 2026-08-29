import React, { useState } from "react";
import { useGetAdminEvents, getGetAdminEventsQueryKey } from "@workspace/api-client-react";
import type { GetAdminEventsParams } from "@workspace/api-client-react";
import { Card, CardContent } from "@brands/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@brands/components/ui/table";
import { Input } from "@brands/components/ui/input";
import { Button } from "@brands/components/ui/button";
import { Skeleton } from "@brands/components/ui/skeleton";
import { Label } from "@brands/components/ui/label";
import { Download, Search } from "lucide-react";
import { useToast } from "@brands/hooks/use-toast";
import { downloadBlobWithAuth } from "@brands/lib/download-with-auth";
import { AdminQueryState } from "@brands/components/admin/AdminQueryState";

const TABLE_SKELETON = (
  <>
    {[...Array(10)].map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="w-24 h-4" /></TableCell>
        <TableCell><Skeleton className="w-32 h-4" /></TableCell>
        <TableCell><Skeleton className="w-24 h-4" /></TableCell>
        <TableCell><Skeleton className="w-24 h-4" /></TableCell>
        <TableCell><Skeleton className="w-full h-4" /></TableCell>
      </TableRow>
    ))}
  </>
);

export default function AdminEvents() {
  const [eventTypeInput, setEventTypeInput] = useState("");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<GetAdminEventsParams>({});
  const [page, setPage] = useState(0);
  const limit = 50;

  const { toast } = useToast();

  const queryParams: GetAdminEventsParams = {
    ...appliedFilters,
    limit,
    offset: page * limit,
  };

  const { data, isLoading, isError, error } = useGetAdminEvents(queryParams, {
    query: {
      queryKey: getGetAdminEventsQueryKey(queryParams),
    },
  });

  const events = data?.events ?? [];

  const handleApplyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    const filters: GetAdminEventsParams = {};
    if (eventTypeInput.trim()) filters.eventType = eventTypeInput.trim();
    if (fromInput) filters.from = fromInput;
    if (toInput) filters.to = toInput;
    setAppliedFilters(filters);
    setPage(0);
  };

  const handleClearFilters = () => {
    setEventTypeInput("");
    setFromInput("");
    setToInput("");
    setAppliedFilters({});
    setPage(0);
  };

  const exportCsv = async () => {
    try {
      const url = new URL("/api/admin/events/export", window.location.origin);
      if (appliedFilters.eventType) url.searchParams.append("eventType", appliedFilters.eventType);
      if (appliedFilters.from) url.searchParams.append("from", appliedFilters.from);
      if (appliedFilters.to) url.searchParams.append("to", appliedFilters.to);
      await downloadBlobWithAuth(url.toString(), "events-export.csv");
    } catch {
      toast({
        title: "Export Failed",
        description: "Could not export event logs.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" data-testid="admin-events-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Event Log</h1>
          <p className="text-muted-foreground mt-1">Audit trail of all platform activity</p>
        </div>
        <Button onClick={exportCsv} variant="outline" className="gap-2" data-testid="btn-export-csv">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4 pb-4">
          <form onSubmit={handleApplyFilters} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1">
              <Label htmlFor="filter-event-type">Event Type</Label>
              <Input
                id="filter-event-type"
                placeholder="e.g. ad_created"
                value={eventTypeInput}
                onChange={(e) => setEventTypeInput(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-from">From Date</Label>
              <Input
                id="filter-from"
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-to">To Date</Label>
              <Input
                id="filter-to"
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="gap-2 flex-1">
                <Search className="w-4 h-4" />
                Filter
              </Button>
              <Button type="button" variant="ghost" onClick={handleClearFilters}>
                Clear
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Event Type</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Metadata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AdminQueryState
                isLoading={isLoading}
                isError={isError}
                error={error}
                isEmpty={events.length === 0}
                emptyMessage="No events found."
                loadingFallback={TABLE_SKELETON}
              >
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground text-xs">
                      {new Date(event.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {event.eventType}
                    </TableCell>
                    <TableCell>
                      {event.actorId ? (
                        <span className="font-mono text-xs">{event.actorId.substring(0, 8)}…</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">System</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {event.entityType}
                      {event.entityId && (
                        <span className="font-mono text-xs ml-1 text-muted-foreground">
                          ({event.entityId.substring(0, 8)}…)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs font-mono text-muted-foreground">
                      {JSON.stringify(event.metadata)}
                    </TableCell>
                  </TableRow>
                ))}
              </AdminQueryState>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          Showing {events.length} of {data?.total ?? 0} events
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={page === 0 || isLoading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!data || (data.offset + data.limit) >= data.total || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
