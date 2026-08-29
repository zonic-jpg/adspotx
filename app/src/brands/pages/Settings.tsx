import React from "react";
import { useAuth } from "@brands/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@brands/components/ui/card";
import { Badge } from "@brands/components/ui/badge";
import { User, Mail, Shield } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your account details</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your profile details and role on the platform</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-3 p-4 rounded-md border bg-muted/30">
              <User className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Username</p>
                <p className="font-medium">{user.username}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-md border bg-muted/30">
              <Mail className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                <p className="font-medium">{user.email}</p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-md border bg-muted/30">
              <Shield className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-xs text-muted-foreground mb-1">Role</p>
                <Badge variant="secondary" className="capitalize">{user.role}</Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Account ID</CardTitle>
          <CardDescription>Use this identifier when contacting support</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-sm text-muted-foreground bg-muted/50 border rounded-md px-3 py-2">
            {user.id}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
