import { customFetch } from "@workspace/api-client-react";

export async function fetchPartner(partnerId: string) {
  return customFetch<{ partner: import("./types").PartnerProfile }>(`/api/partners/${partnerId}`);
}

export async function fetchIntegration(partnerId: string) {
  return customFetch<import("./types").PartnerIntegration>(`/api/partners/${partnerId}/integration`);
}

export async function activateIntegrationApi(partnerId: string) {
  return customFetch<import("./types").PartnerIntegration>(
    `/api/partners/${partnerId}/integration/activate`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

export async function deactivateIntegrationApi(partnerId: string) {
  return customFetch<import("./types").PartnerIntegration>(
    `/api/partners/${partnerId}/integration/deactivate`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
}

export async function createPartner(body: {
  name: string;
  outletType?: string;
  website?: string;
  contactEmail?: string;
  region?: string;
}) {
  return customFetch<{ partner: import("./types").PartnerProfile }>("/api/partners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
