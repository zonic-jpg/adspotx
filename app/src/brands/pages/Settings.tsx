import React, { useEffect, useState } from "react";
import { useAuth } from "@brands/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@brands/components/ui/card";
import { Badge } from "@brands/components/ui/badge";
import { Button } from "@brands/components/ui/button";
import { Input } from "@brands/components/ui/input";
import { User, Mail, Shield, Building2, Trophy } from "lucide-react";
import { customFetch, canActAs } from "@workspace/api-client-react";

export default function Settings() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const u = user as { displayName?: string; companyName?: string | null; profile?: { displayName?: string; display_name?: string } };
    setDisplayName(u.displayName || u.profile?.displayName || u.profile?.display_name || user.username || "");
    setCompanyName(u.companyName || "");
  }, [user]);

  if (!user) return null;

  const saveDisplayName = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await customFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ displayName: displayName.trim() }),
      });
      setMsg("Reviewer display name saved — used on the leaderboard.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not save display name");
    }
    setSaving(false);
  };

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

            {companyName ? (
              <div className="flex items-start gap-3 p-4 rounded-md border bg-muted/30">
                <Building2 className="w-4 h-4 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Brand / company</p>
                  <p className="font-medium">{companyName}</p>
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {(canActAs(user.role) || user.role === "reviewer" || user.role === "brand") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Reviewer display name
            </CardTitle>
            <CardDescription>
              Shown on the public leaderboard when you act as a reviewer. Separate from your brand company name.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Femi Reviews"
              maxLength={40}
              data-testid="reviewer-display-name"
            />
            <Button onClick={saveDisplayName} disabled={saving || !displayName.trim()} data-testid="save-display-name">
              {saving ? "Saving…" : "Save display name"}
            </Button>
            {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
          </CardContent>
        </Card>
      )}

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
