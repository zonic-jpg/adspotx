import { randomBytes, randomUUID } from "node:crypto";

/** Fixed audit partner — used when DB is unavailable (hostile audit Tier 2). */
export const AUDIT_PARTNER_ID = "00000000-0000-4000-8000-000000000001";

export interface MemoryPartner {
  id: string;
  name: string;
  outletType: string;
  website?: string | null;
  contactEmail?: string | null;
  region?: string | null;
}

export interface MemoryIntegration {
  partnerId: string;
  adspotLinked: boolean;
  apiKey: string | null;
  webhookUrl: string | null;
  embedConfig: {
    scriptTag?: string;
    partnerId?: string;
    baseUrl?: string;
  } | null;
  activatedAt: Date | null;
  deactivatedAt: Date | null;
}

const partners = new Map<string, MemoryPartner>();
const integrations = new Map<string, MemoryIntegration>();

function integrationBaseUrl(): string {
  return (
    process.env["ADSPOT_PUBLIC_URL"] ??
    process.env["PUBLIC_URL"] ??
    "http://127.0.0.1:3199"
  ).replace(/\/$/, "");
}

function buildEmbed(partnerId: string, apiKey: string) {
  const baseUrl = integrationBaseUrl();
  const scriptTag = `<script src="${baseUrl}/embed/partner.js" data-partner-id="${partnerId}" data-api-key="${apiKey}" async></script>`;
  return {
    scriptTag,
    partnerId,
    baseUrl,
    webhookUrl: `${baseUrl}/api/partners/${partnerId}/webhooks/completions`,
    embedConfig: { scriptTag, partnerId, baseUrl },
  };
}

export function partnerMemoryEnabled(): boolean {
  // Mock/demo mode enables a fixed-password login bypass for seeded accounts.
  // It must NEVER be active in production, even if AUDIT_PARTNER_MOCK=1 leaks
  // into the deployed environment by mistake.
  if (process.env["NODE_ENV"] === "production") return false;
  return process.env["AUDIT_PARTNER_MOCK"] === "1";
}

export function ensureAuditPartner(): MemoryPartner {
  if (!partners.has(AUDIT_PARTNER_ID)) {
    partners.set(AUDIT_PARTNER_ID, {
      id: AUDIT_PARTNER_ID,
      name: "Audit Daily (mock)",
      outletType: "newspaper",
      website: "https://audit.example",
      contactEmail: "partners@audit.example",
      region: "Lagos",
    });
    integrations.set(AUDIT_PARTNER_ID, {
      partnerId: AUDIT_PARTNER_ID,
      adspotLinked: false,
      apiKey: null,
      webhookUrl: null,
      embedConfig: null,
      activatedAt: null,
      deactivatedAt: null,
    });
  }
  return partners.get(AUDIT_PARTNER_ID)!;
}

export function getMemoryPartner(id: string): MemoryPartner | undefined {
  return partners.get(id);
}

export function createMemoryPartner(data: {
  name: string;
  outletType?: string;
  website?: string;
  contactEmail?: string;
  region?: string;
}): MemoryPartner {
  const id = randomUUID();
  const partner: MemoryPartner = {
    id,
    name: data.name,
    outletType: data.outletType ?? "newspaper",
    website: data.website ?? null,
    contactEmail: data.contactEmail ?? null,
    region: data.region ?? null,
  };
  partners.set(id, partner);
  integrations.set(id, {
    partnerId: id,
    adspotLinked: false,
    apiKey: null,
    webhookUrl: null,
    embedConfig: null,
    activatedAt: null,
    deactivatedAt: null,
  });
  return partner;
}

export function getMemoryIntegration(partnerId: string): MemoryIntegration {
  if (!integrations.has(partnerId)) {
    integrations.set(partnerId, {
      partnerId,
      adspotLinked: false,
      apiKey: null,
      webhookUrl: null,
      embedConfig: null,
      activatedAt: null,
      deactivatedAt: null,
    });
  }
  return integrations.get(partnerId)!;
}

export function activateMemoryIntegration(partnerId: string): MemoryIntegration {
  const apiKey = `asp_${randomBytes(24).toString("hex")}`;
  const embed = buildEmbed(partnerId, apiKey);
  const now = new Date();
  const row: MemoryIntegration = {
    partnerId,
    adspotLinked: true,
    apiKey,
    webhookUrl: embed.webhookUrl,
    embedConfig: embed.embedConfig,
    activatedAt: now,
    deactivatedAt: null,
  };
  integrations.set(partnerId, row);
  return row;
}

export function deactivateMemoryIntegration(partnerId: string): MemoryIntegration {
  const existing = getMemoryIntegration(partnerId);
  const now = new Date();
  const row: MemoryIntegration = {
    ...existing,
    adspotLinked: false,
    deactivatedAt: now,
  };
  integrations.set(partnerId, row);
  return row;
}

export function listMemoryPartners(): Array<MemoryPartner & { integration: MemoryIntegration }> {
  ensureAuditPartner();
  return [...partners.values()].map((partner) => ({
    ...partner,
    integration: getMemoryIntegration(partner.id),
  }));
}

export function getMemoryAnalytics(partnerId: string) {
  const integration = getMemoryIntegration(partnerId);
  const linked = integration.adspotLinked;
  return {
    partnerId,
    period: "30d",
    activeSlots: 12,
    impressions: linked ? 4_820 : 0,
    completions: linked ? 3_140 : 0,
    campaignsRouted: linked ? 3 : 0,
    revenueShareNgn: linked ? 125_000 : 0,
    integrationStatus: linked ? "active" : "inactive",
  };
}
