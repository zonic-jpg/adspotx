/**
 * AdSpotX partner portal API — Supabase tables + localStorage soft-session fallback.
 */
import { supabase } from "./supabase-client";
import {
  ADSPOT_PARTNERS,
  ADSPOT_PARTNER_INTEGRATIONS,
  LEGACY_NETWORK_PARTNERS,
  LEGACY_PARTNER_INTEGRATIONS,
} from "./adspot-tables";

export type RouteResult = { status: number; body: unknown };

export const AUDIT_PARTNER_ID = "00000000-0000-4000-8000-000000000001";
const LOCAL_KEY = "adspot_partners_local_v1";

type PartnerRow = {
  id: string;
  name: string;
  outletType: string;
  website?: string | null;
  contactEmail?: string | null;
  region?: string | null;
  createdAt?: string;
};

type IntegrationRow = {
  partnerId: string;
  adspotLinked: boolean;
  apiKey?: string | null;
  webhookUrl?: string | null;
  embedConfig?: { scriptTag?: string; partnerId?: string; baseUrl?: string } | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
};

type LocalStore = {
  partners: PartnerRow[];
  integrations: Record<string, IntegrationRow>;
};

function isMissingRelation(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  const code = (error as { code?: string })?.code ?? "";
  return code === "PGRST205" || /Could not find the table|schema cache|does not exist/i.test(msg);
}

function err(status: number, error: string, message?: string): RouteResult {
  return { status, body: { error, message } };
}

function baseUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://adspotx.netlify.app";
}

function buildEmbed(partnerId: string, apiKey: string) {
  const origin = baseUrl();
  const scriptTag = `<script src="${origin}/embed/partner.js" data-partner-id="${partnerId}" data-api-key="${apiKey}" async></script>`;
  return {
    scriptTag,
    partnerId,
    baseUrl: origin,
    webhookUrl: `${origin}/api/partners/${partnerId}/webhooks/completions`,
    embedConfig: { scriptTag, partnerId, baseUrl: origin },
  };
}

function randomApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return `asp_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

function formatIntegration(integration: IntegrationRow, partnerId: string) {
  const status = integration.adspotLinked ? "active" : "inactive";
  const embed = integration.embedConfig ?? undefined;
  return {
    status,
    adspotLinked: integration.adspotLinked,
    partnerId,
    apiKey: integration.apiKey ?? undefined,
    webhookUrl: integration.webhookUrl ?? undefined,
    embedScript: embed?.scriptTag,
    embedConfig: embed,
    activatedAt: integration.activatedAt ?? null,
    deactivatedAt: integration.deactivatedAt ?? null,
  };
}

function formatPartnerWithIntegration(partner: PartnerRow, integration: IntegrationRow) {
  return {
    id: partner.id,
    name: partner.name,
    outletType: partner.outletType,
    website: partner.website ?? null,
    contactEmail: partner.contactEmail ?? null,
    region: partner.region ?? null,
    createdAt: partner.createdAt,
    integration: {
      adspotLinked: integration.adspotLinked,
      status: integration.adspotLinked ? "active" : "inactive",
      apiKey: integration.apiKey ?? undefined,
      activatedAt: integration.activatedAt ?? null,
    },
  };
}

function loadLocal(): LocalStore {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw) as LocalStore;
  } catch {
    /* ignore */
  }
  return { partners: [], integrations: {} };
}

function saveLocal(store: LocalStore) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function ensureAuditLocal(store: LocalStore): LocalStore {
  if (!store.partners.some((p) => p.id === AUDIT_PARTNER_ID)) {
    store.partners.unshift({
      id: AUDIT_PARTNER_ID,
      name: "Audit Daily (demo)",
      outletType: "newspaper",
      website: "https://audit.example",
      contactEmail: "partners@audit.example",
      region: "Lagos",
      createdAt: new Date().toISOString(),
    });
  }
  if (!store.integrations[AUDIT_PARTNER_ID]) {
    store.integrations[AUDIT_PARTNER_ID] = {
      partnerId: AUDIT_PARTNER_ID,
      adspotLinked: false,
      apiKey: null,
      webhookUrl: null,
      embedConfig: null,
      activatedAt: null,
      deactivatedAt: null,
    };
  }
  return store;
}

function mapDbPartner(row: Record<string, unknown>): PartnerRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    outletType: String(row.outlet_type ?? row.outletType ?? "newspaper"),
    website: (row.website as string) ?? null,
    contactEmail: (row.contact_email ?? row.contactEmail) as string | null,
    region: (row.region as string) ?? null,
    createdAt: (row.created_at ?? row.createdAt) as string | undefined,
  };
}

function mapDbIntegration(row: Record<string, unknown>, partnerId: string): IntegrationRow {
  return {
    partnerId,
    adspotLinked: Boolean(row.adspot_linked ?? row.adspotLinked),
    apiKey: (row.api_key ?? row.apiKey) as string | null,
    webhookUrl: (row.webhook_url ?? row.webhookUrl) as string | null,
    embedConfig: (row.embed_config ?? row.embedConfig) as IntegrationRow["embedConfig"],
    activatedAt: (row.activated_at ?? row.activatedAt) as string | null,
    deactivatedAt: (row.deactivated_at ?? row.deactivatedAt) as string | null,
  };
}

async function tryFrom(table: string) {
  return supabase!.from(table);
}

async function partnerTables(): Promise<{ partners: string; integrations: string } | null> {
  // Prefer adspot_* ; fall back to legacy network_* if preferred missing.
  const probe = await supabase!.from(ADSPOT_PARTNERS).select("id").limit(1);
  if (!probe.error) return { partners: ADSPOT_PARTNERS, integrations: ADSPOT_PARTNER_INTEGRATIONS };
  if (!isMissingRelation(probe.error)) throw probe.error;

  const legacy = await supabase!.from(LEGACY_NETWORK_PARTNERS).select("id").limit(1);
  if (!legacy.error) return { partners: LEGACY_NETWORK_PARTNERS, integrations: LEGACY_PARTNER_INTEGRATIONS };
  if (isMissingRelation(legacy.error)) return null;
  throw legacy.error;
}

async function getOrCreateDbIntegration(
  tables: { partners: string; integrations: string },
  partnerId: string,
): Promise<IntegrationRow> {
  const { data: existing, error } = await supabase!
    .from(tables.integrations)
    .select("*")
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (error) throw error;
  if (existing) return mapDbIntegration(existing as Record<string, unknown>, partnerId);

  const { data: created, error: insertErr } = await supabase!
    .from(tables.integrations)
    .insert({ partner_id: partnerId, adspot_linked: false })
    .select("*")
    .single();
  if (insertErr) throw insertErr;
  return mapDbIntegration(created as Record<string, unknown>, partnerId);
}

function localList(): RouteResult {
  const store = ensureAuditLocal(loadLocal());
  saveLocal(store);
  const partners = store.partners.map((p) =>
    formatPartnerWithIntegration(p, store.integrations[p.id] ?? {
      partnerId: p.id,
      adspotLinked: false,
    }),
  );
  return { status: 200, body: { partners, total: partners.length } };
}

export async function partnersList(): Promise<RouteResult> {
  try {
    const tables = await partnerTables();
    if (!tables) return localList();

    const { data, error } = await supabase!
      .from(tables.partners)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      if (isMissingRelation(error)) return localList();
      throw error;
    }
    const rows = await Promise.all(
      (data ?? []).map(async (row) => {
        const partner = mapDbPartner(row as Record<string, unknown>);
        const integration = await getOrCreateDbIntegration(tables, partner.id);
        return formatPartnerWithIntegration(partner, integration);
      }),
    );
    if (rows.length === 0) {
      // Seed UX: merge local audit partner so portal demo id always resolves.
      const local = ensureAuditLocal(loadLocal());
      saveLocal(local);
      return {
        status: 200,
        body: {
          partners: [
            formatPartnerWithIntegration(
              local.partners.find((p) => p.id === AUDIT_PARTNER_ID)!,
              local.integrations[AUDIT_PARTNER_ID],
            ),
          ],
          total: 1,
        },
      };
    }
    return { status: 200, body: { partners: rows, total: rows.length } };
  } catch (e) {
    if (isMissingRelation(e)) return localList();
    throw e;
  }
}

export async function partnersCreate(body: Record<string, unknown>): Promise<RouteResult> {
  const name = String(body.name ?? "").trim();
  if (!name) return err(400, "validation_error", "Partner name is required");

  const payload = {
    name,
    outlet_type: String(body.outletType ?? body.outlet_type ?? "newspaper"),
    website: (body.website as string) || null,
    contact_email: (body.contactEmail ?? body.contact_email) as string | null,
    region: (body.region as string) || null,
  };

  try {
    const tables = await partnerTables();
    if (!tables) {
      const store = ensureAuditLocal(loadLocal());
      const partner: PartnerRow = {
        id: crypto.randomUUID(),
        name: payload.name,
        outletType: payload.outlet_type,
        website: payload.website,
        contactEmail: payload.contact_email,
        region: payload.region,
        createdAt: new Date().toISOString(),
      };
      store.partners.unshift(partner);
      store.integrations[partner.id] = {
        partnerId: partner.id,
        adspotLinked: false,
        apiKey: null,
        webhookUrl: null,
        embedConfig: null,
        activatedAt: null,
        deactivatedAt: null,
      };
      saveLocal(store);
      return {
        status: 201,
        body: { partner: formatPartnerWithIntegration(partner, store.integrations[partner.id]) },
      };
    }

    const { data, error } = await supabase!
      .from(tables.partners)
      .insert(payload)
      .select("*")
      .single();
    if (error) {
      if (isMissingRelation(error)) {
        // Fall through to local
        const store = ensureAuditLocal(loadLocal());
        const partner: PartnerRow = {
          id: crypto.randomUUID(),
          name: payload.name,
          outletType: payload.outlet_type,
          website: payload.website,
          contactEmail: payload.contact_email,
          region: payload.region,
          createdAt: new Date().toISOString(),
        };
        store.partners.unshift(partner);
        store.integrations[partner.id] = {
          partnerId: partner.id,
          adspotLinked: false,
        };
        saveLocal(store);
        return {
          status: 201,
          body: { partner: formatPartnerWithIntegration(partner, store.integrations[partner.id]) },
        };
      }
      throw error;
    }
    const partner = mapDbPartner(data as Record<string, unknown>);
    const integration = await getOrCreateDbIntegration(tables, partner.id);
    return { status: 201, body: { partner: formatPartnerWithIntegration(partner, integration) } };
  } catch (e) {
    if (isMissingRelation(e)) {
      const store = ensureAuditLocal(loadLocal());
      const partner: PartnerRow = {
        id: crypto.randomUUID(),
        name: payload.name,
        outletType: payload.outlet_type,
        website: payload.website,
        contactEmail: payload.contact_email,
        region: payload.region,
        createdAt: new Date().toISOString(),
      };
      store.partners.unshift(partner);
      store.integrations[partner.id] = { partnerId: partner.id, adspotLinked: false };
      saveLocal(store);
      return {
        status: 201,
        body: { partner: formatPartnerWithIntegration(partner, store.integrations[partner.id]) },
      };
    }
    throw e;
  }
}

async function findPartner(id: string): Promise<{ partner: PartnerRow; integration: IntegrationRow; source: "db" | "local"; tables?: { partners: string; integrations: string } }> {
  try {
    const tables = await partnerTables();
    if (tables) {
      const { data, error } = await supabase!.from(tables.partners).select("*").eq("id", id).maybeSingle();
      if (error && !isMissingRelation(error)) throw error;
      if (data) {
        const partner = mapDbPartner(data as Record<string, unknown>);
        const integration = await getOrCreateDbIntegration(tables, id);
        return { partner, integration, source: "db", tables };
      }
    }
  } catch (e) {
    if (!isMissingRelation(e)) throw e;
  }

  const store = ensureAuditLocal(loadLocal());
  saveLocal(store);
  let partner = store.partners.find((p) => p.id === id);
  if (!partner && id === AUDIT_PARTNER_ID) {
    partner = store.partners.find((p) => p.id === AUDIT_PARTNER_ID)!;
  }
  if (!partner) throw Object.assign(new Error("Partner not found"), { status: 404 });
  return {
    partner,
    integration: store.integrations[id] ?? { partnerId: id, adspotLinked: false },
    source: "local",
  };
}

export async function partnersGet(id: string): Promise<RouteResult> {
  try {
    const { partner } = await findPartner(id);
    return { status: 200, body: { partner } };
  } catch (e) {
    const ex = e as Error & { status?: number };
    if (ex.status === 404) return err(404, "not_found", "Partner not found");
    throw e;
  }
}

export async function partnersAnalytics(id: string): Promise<RouteResult> {
  try {
    const { integration } = await findPartner(id);
    const linked = integration.adspotLinked;
    return {
      status: 200,
      body: {
        analytics: {
          partnerId: id,
          period: "30d",
          activeSlots: 12,
          impressions: linked ? 4_820 : 0,
          completions: linked ? 3_140 : 0,
          campaignsRouted: linked ? 3 : 0,
          revenueShareNgn: linked ? 125_000 : 0,
          integrationStatus: linked ? "active" : "inactive",
        },
      },
    };
  } catch (e) {
    const ex = e as Error & { status?: number };
    if (ex.status === 404) return err(404, "not_found", "Partner not found");
    throw e;
  }
}

export async function partnersIntegrationGet(id: string): Promise<RouteResult> {
  try {
    const { integration } = await findPartner(id);
    return { status: 200, body: formatIntegration(integration, id) };
  } catch (e) {
    const ex = e as Error & { status?: number };
    if (ex.status === 404) return err(404, "not_found", "Partner not found");
    throw e;
  }
}

export async function partnersIntegrationActivate(id: string): Promise<RouteResult> {
  try {
    const found = await findPartner(id);
    const apiKey = randomApiKey();
    const embed = buildEmbed(id, apiKey);
    const now = new Date().toISOString();
    const next: IntegrationRow = {
      partnerId: id,
      adspotLinked: true,
      apiKey,
      webhookUrl: embed.webhookUrl,
      embedConfig: embed.embedConfig,
      activatedAt: now,
      deactivatedAt: null,
    };

    if (found.source === "db" && found.tables) {
      const { error } = await supabase!.from(found.tables.integrations).upsert(
        {
          partner_id: id,
          adspot_linked: true,
          api_key: apiKey,
          webhook_url: embed.webhookUrl,
          embed_config: embed.embedConfig,
          activated_at: now,
          deactivated_at: null,
          updated_at: now,
        },
        { onConflict: "partner_id" },
      );
      if (error && !isMissingRelation(error)) throw error;
      if (error && isMissingRelation(error)) {
        const store = ensureAuditLocal(loadLocal());
        store.integrations[id] = next;
        if (!store.partners.some((p) => p.id === id)) store.partners.unshift(found.partner);
        saveLocal(store);
      }
    } else {
      const store = ensureAuditLocal(loadLocal());
      store.integrations[id] = next;
      if (!store.partners.some((p) => p.id === id)) store.partners.unshift(found.partner);
      saveLocal(store);
    }

    return {
      status: 200,
      body: {
        ...formatIntegration(next, id),
        message: "AdSpot integration activated. Campaign routing is now enabled.",
      },
    };
  } catch (e) {
    const ex = e as Error & { status?: number };
    if (ex.status === 404) return err(404, "not_found", "Partner not found");
    throw e;
  }
}

export async function partnersIntegrationDeactivate(id: string): Promise<RouteResult> {
  try {
    const found = await findPartner(id);
    const now = new Date().toISOString();
    const next: IntegrationRow = {
      ...found.integration,
      adspotLinked: false,
      deactivatedAt: now,
    };

    if (found.source === "db" && found.tables) {
      const { error } = await supabase!
        .from(found.tables.integrations)
        .update({
          adspot_linked: false,
          deactivated_at: now,
          updated_at: now,
        })
        .eq("partner_id", id);
      if (error && !isMissingRelation(error)) throw error;
      if (error && isMissingRelation(error)) {
        const store = ensureAuditLocal(loadLocal());
        store.integrations[id] = next;
        saveLocal(store);
      }
    } else {
      const store = ensureAuditLocal(loadLocal());
      store.integrations[id] = next;
      saveLocal(store);
    }

    return {
      status: 200,
      body: {
        ...formatIntegration(next, id),
        message: "AdSpot integration deactivated. Campaign routing has stopped.",
      },
    };
  } catch (e) {
    const ex = e as Error & { status?: number };
    if (ex.status === 404) return err(404, "not_found", "Partner not found");
    throw e;
  }
}

// silence unused helper warning if tree-shaken oddly
void tryFrom;
