import type { PartnerIntegration } from "./types";

const PREFIX = "adspot_partner_integration_";

function storageKey(partnerId: string): string {
  return `${PREFIX}${partnerId}`;
}

/** Default inactive snapshot — never claim active without API confirmation. */
export function defaultIntegration(partnerId: string): PartnerIntegration {
  return {
    status: "inactive",
    adspotLinked: false,
    partnerId,
    activatedAt: null,
    deactivatedAt: null,
  };
}

export function readIntegrationCache(partnerId: string): PartnerIntegration | null {
  try {
    const raw = localStorage.getItem(storageKey(partnerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PartnerIntegration;
    if (!parsed.partnerId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cacheIntegration(partnerId: string, integration: PartnerIntegration): void {
  try {
    localStorage.setItem(storageKey(partnerId), JSON.stringify(integration));
  } catch {
    // ignore quota / private mode
  }
}

export function clearIntegrationCache(partnerId: string): void {
  try {
    localStorage.removeItem(storageKey(partnerId));
  } catch {
    // ignore
  }
}

export function mergeWithCache(
  partnerId: string,
  remote: PartnerIntegration | null,
): PartnerIntegration {
  if (remote) {
    cacheIntegration(partnerId, remote);
    return remote;
  }
  return readIntegrationCache(partnerId) ?? defaultIntegration(partnerId);
}
