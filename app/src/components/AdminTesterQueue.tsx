import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@brands/components/ui/card";
import { Button } from "@brands/components/ui/button";
import { useAuth } from "@brands/contexts/AuthContext";
import {
  AWAITING_MSG,
  approveAdmin,
  listApprovedAdmins,
  listPendingQueue,
  revokeAdmin,
  OWNER_EMAIL,
} from "../lib/adminTesterApproval";

export function AdminTesterQueue({ appId = "adspotx" }: { appId?: string }) {
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const actor = user?.email ?? "";
  const isOwner = actor.toLowerCase() === OWNER_EMAIL;
  const pending = listPendingQueue(appId);
  const approved = listApprovedAdmins();

  if (!isOwner) return null;

  const bump = () => setTick((n) => n + 1);

  return (
    <Card id="admintester-queue" className="border-amber-200 bg-amber-50/40 scroll-mt-24" key={tick}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">ADMINTESTER approval queue</CardTitle>
        <p className="text-xs text-muted-foreground">
          First login with admin password lands here until you approve. Testers see: {AWAITING_MSG}
        </p>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {pending.length === 0 ? (
          <p className="text-muted-foreground">No pending requests.</p>
        ) : (
          pending.map((p) => (
            <div key={`${p.email}-${p.requestedAt}`} className="flex items-center justify-between gap-3 border-b pb-2">
              <div>
                <p className="font-medium">{p.identity || p.email}</p>
                <p className="text-xs text-muted-foreground">
                  {p.email} · {new Date(p.requestedAt).toLocaleString()}
                </p>
              </div>
              <Button size="sm" onClick={() => { approveAdmin(actor, p.email); bump(); }}>
                Approve
              </Button>
            </div>
          ))
        )}
        <div>
          <p className="font-medium mb-2">Approved admins</p>
          {approved.length === 0 ? (
            <p className="text-muted-foreground text-xs">None yet.</p>
          ) : (
            approved.map((a) => (
              <div key={a.email} className="flex items-center justify-between gap-3 py-1">
                <span>{a.email}</span>
                <Button variant="outline" size="sm" onClick={() => { revokeAdmin(actor, a.email); bump(); }}>
                  Revoke
                </Button>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
