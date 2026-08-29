import React, { useState } from "react";
import { useGetAdminUsers } from "@workspace/api-client-react";
import { Card, CardContent } from "@brands/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@brands/components/ui/table";
import { Button } from "@brands/components/ui/button";
import { Skeleton } from "@brands/components/ui/skeleton";
import { Badge } from "@brands/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@brands/components/ui/select";
import { AdminUserEntryRole, GetAdminUsersRole, getGetAdminUsersQueryKey } from "@workspace/api-client-react";
import { AdminQueryState } from "@brands/components/admin/AdminQueryState";

type RoleFilter = GetAdminUsersRole | "all";

const TABLE_SKELETON = (
  <>
    {[...Array(10)].map((_, i) => (
      <TableRow key={i}>
        <TableCell><Skeleton className="w-32 h-4" /></TableCell>
        <TableCell><Skeleton className="w-48 h-4" /></TableCell>
        <TableCell><Skeleton className="w-16 h-4" /></TableCell>
        <TableCell><Skeleton className="w-12 h-4 ml-auto" /></TableCell>
        <TableCell><Skeleton className="w-24 h-4 ml-auto" /></TableCell>
      </TableRow>
    ))}
  </>
);

export default function AdminUsers() {
  const [page, setPage] = useState(0);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const limit = 20;

  const params = {
    limit,
    offset: page * limit,
    role: roleFilter !== "all" ? roleFilter : undefined,
  };

  const { data, isLoading, isError, error } = useGetAdminUsers(params, {
    query: {
      queryKey: getGetAdminUsersQueryKey(params),
    },
  });

  const users = data?.users ?? [];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case "super_admin": return <Badge className="bg-red-600">Super Admin</Badge>;
      case "admin": return <Badge className="bg-purple-500">Admin</Badge>;
      case "brand": return <Badge className="bg-blue-500">Brand</Badge>;
      case "reviewer": return <Badge variant="secondary">Reviewer</Badge>;
      default: return <Badge variant="outline">{role}</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6" data-testid="admin-users-page">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">User Directory</h1>
          <p className="text-muted-foreground mt-1">Manage all platform accounts</p>
        </div>
        <div className="w-48">
          <Select value={roleFilter} onValueChange={(val) => { setRoleFilter(val as RoleFilter); setPage(0); }}>
            <SelectTrigger>
              <SelectValue placeholder="Filter by role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value={AdminUserEntryRole.reviewer}>Reviewers</SelectItem>
              <SelectItem value={AdminUserEntryRole.brand}>Brands</SelectItem>
              <SelectItem value={AdminUserEntryRole.admin}>Admins</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="text-right">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AdminQueryState
                isLoading={isLoading}
                isError={isError}
                error={error}
                isEmpty={users.length === 0}
                emptyMessage="No users found."
                loadingFallback={TABLE_SKELETON}
              >
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell className="text-muted-foreground">{user.email}</TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell className="text-right font-mono">
                      {user.pointsBalance !== null && user.pointsBalance !== undefined
                        ? user.pointsBalance.toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
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
          Showing {users.length} of {data?.total ?? 0} users
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
            disabled={!data || (page + 1) * limit >= data.total || isLoading}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
