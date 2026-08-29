import type { PartnerIntegration } from "./types";
import {
  activateIntegrationApi,
  deactivateIntegrationApi,
  fetchIntegration,
} from "./partnerApi";
import {
  cacheIntegration,
  clearIntegrationCache,
  readIntegrationCache,
} from "./integrationState";

export async function getIntegrationStatus(partnerId: string): Promise<PartnerIntegration> {
  const remote = await fetchIntegration(partnerId);
  cacheIntegration(partnerId, remote);
  return remote;
}

export async function activateIntegration(partnerId: string): Promise<PartnerIntegration> {
  const result = await activateIntegrationApi(partnerId);
  if (!result.adspotLinked || result.status !== "active" || !result.apiKey) {
    throw new Error("Server did not confirm active integration — refusing to show connected state");
  }
  cacheIntegration(partnerId, result);
  return result;
}

export async function deactivateIntegration(partnerId: string): Promise<PartnerIntegration> {
  const result = await deactivateIntegrationApi(partnerId);
  cacheIntegration(partnerId, result);
  return result;
}

export function getEmbedTag(partnerId: string): string | null {
  const cached = readIntegrationCache(partnerId);
  if (!cached?.adspotLinked) return null;
  return cached.embedScript ?? cached.embedConfig?.scriptTag ?? null;
}

export function clearLocalIntegration(partnerId: string): void {
  clearIntegrationCache(partnerId);
}
