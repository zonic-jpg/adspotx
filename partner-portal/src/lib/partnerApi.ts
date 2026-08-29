const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "/api";

async function parseJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }
}

export async function fetchPartner(partnerId: string) {
  const res = await fetch(`${API_BASE}/partners/${partnerId}`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message ?? `Failed to load partner (${res.status})`);
  }
  return parseJson<{ partner: import("./types").PartnerProfile }>(res);
}

export async function fetchIntegration(partnerId: string) {
  const res = await fetch(`${API_BASE}/partners/${partnerId}/integration`);
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message ?? `Failed to load integration (${res.status})`);
  }
  return parseJson<import("./types").PartnerIntegration>(res);
}

export async function activateIntegrationApi(partnerId: string) {
  const res = await fetch(`${API_BASE}/partners/${partnerId}/integration/activate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message ?? `Activation failed (${res.status})`);
  }
  return parseJson<import("./types").PartnerIntegration>(res);
}

export async function deactivateIntegrationApi(partnerId: string) {
  const res = await fetch(`${API_BASE}/partners/${partnerId}/integration/deactivate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await parseJson<{ message?: string }>(res);
    throw new Error(body.message ?? `Deactivation failed (${res.status})`);
  }
  return parseJson<import("./types").PartnerIntegration>(res);
}

export async function createPartner(body: {
  name: string;
  outletType?: string;
  website?: string;
  contactEmail?: string;
  region?: string;
}) {
  const res = await fetch(`${API_BASE}/partners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await parseJson<{ message?: string }>(res);
    throw new Error(err.message ?? `Create partner failed (${res.status})`);
  }
  return parseJson<{ partner: import("./types").PartnerProfile }>(res);
}
