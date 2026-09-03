import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@brands/components/ui/card";
import { Button } from "@brands/components/ui/button";
import { Skeleton } from "@brands/components/ui/skeleton";
import { useAuth } from "@brands/contexts/AuthContext";
import { AlertCircle } from "lucide-react";
import {
  AWAITING_MSG,
  OWNER_EMAIL,
  decideAdminAccess,
  listAdminAccessRequests,
  type AccessQueue,
  type AccessRequest,
} from "../lib/adminTesterApproval";
import { publicError } from "../lib/publicMessage";

const EMPTY_QUEUE: AccessQueue = { pending: [], approved: [], revoked: [] };

function requestedLabel(entry: AccessRequest): string {
  const at = entry.requested_at ? new Date(entry.requested_at) : null;
  if (!at || Number.isNaN(at.getTime())) return entry.email;
  return `${entry.email} · ${at.toLocaleString()}`;
}

export function AdminTesterQueue({ appId = "adspotx" }: { appId?: string }) {
  const { user } = useAuth();
  const actor = user?.email ?? "";
  const isOwner = actor.toLowerCase() === OWNER_EMAIL;

  const [queue, setQueue] = useState<AccessQueue>(EMPTY_QUEUE);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      setQueue(await listAdminAccessRequests(appId));
    } catch (e) {
      setQueue(EMPTY_QUEUE);
      setLoadError(publicError(e, "Could not load the approval queue. Try again in a moment."));
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    if (!isOwner) return;
    void refresh();
  }, [isOwner, refresh]);

  if (!isOwner) return null;

  const decide = async (email: string, decision: "approve" | "reject") => {
    setBusyEmail(email);
    setActionError(null);
    try {
      await decideAdminAccess(email, decision, appId);
      await refresh();
    } catch (e) {
      setActionError(publicError(e, "Could not save that decision. Try again in a moment."));
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <Card id="admintester-queue" className="border-amber-200 bg-amber-50/40 scroll-mt-24">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Admin approval queue</CardTitle>
        <p className="text-xs text-muted-foreground">
          A first sign-in with the shared admin password lands here until you approve it. Until then
          that person sees: {AWAITING_MSG}
        </p>
      </CardHeader>
      <CardContent className="space-y-5 text-sm">
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 border-b pb-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>{loadError}</p>
              <Button size="sm" variant="outline" onClick={() => { setLoading(true); void refresh(); }}>
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <>
            {actionError && (
              <p role="alert" className="text-destructive">
                {actionError}
              </p>
            )}

            <div>
              <p className="mb-2 font-medium">Pending requests</p>
              {queue.pending.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nobody is waiting for access. New requests appear here automatically.
                </p>
              ) : (
                queue.pending.map((p) => (
                  <div key={p.email} className="flex items-center justify-between gap-3 border-b py-2">
                    <div>
                      <p className="font-medium">{p.identity || p.email}</p>
                      <p className="text-xs text-muted-foreground">{requestedLabel(p)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button
                        size="sm"
                        disabled={busyEmail === p.email}
                        onClick={() => void decide(p.email, "approve")}
                      >
                        {busyEmail === p.email ? "Saving…" : "Approve"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyEmail === p.email}
                        onClick={() => void decide(p.email, "reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div>
              <p className="mb-2 font-medium">Approved admins</p>
              {queue.approved.length === 0 ? (
                <p className="text-xs text-muted-foreground">None yet.</p>
              ) : (
                queue.approved.map((a) => (
                  <div key={a.email} className="flex items-center justify-between gap-3 py-1">
                    <span>{a.email}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyEmail === a.email}
                      onClick={() => void decide(a.email, "reject")}
                    >
                      {busyEmail === a.email ? "Saving…" : "Revoke"}
                    </Button>
                  </div>
                ))
              )}
            </div>

            {queue.revoked.length > 0 && (
              <div>
                <p className="mb-2 font-medium">Revoked</p>
                {queue.revoked.map((r) => (
                  <div key={r.email} className="flex items-center justify-between gap-3 py-1">
                    <span className="text-muted-foreground">{r.email}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyEmail === r.email}
                      onClick={() => void decide(r.email, "approve")}
                    >
                      {busyEmail === r.email ? "Saving…" : "Restore"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
