import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  networkPartnersTable,
  partnerIntegrationsTable,
} from "@workspace/db/schema";
import { desc, eq } from "drizzle-orm";
import { validateParams } from "../middlewares/validate";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { respondIfDatabaseUnavailable } from "../lib/handle-db-error";
import {
  activateMemoryIntegration,
  createMemoryPartner,
  deactivateMemoryIntegration,
  ensureAuditPartner,
  getMemoryAnalytics,
  getMemoryIntegration,
  getMemoryPartner,
  listMemoryPartners,
  partnerMemoryEnabled,
} from "../lib/partner-memory-store";

const router = Router();

const partnerIdParam = z.object({ id: z.string().uuid("id must be a valid UUID") });

function integrationBaseUrl(): string {
  return (
    process.env["ADSPOT_PUBLIC_URL"] ??
    process.env["PUBLIC_URL"] ??
    "https://adspot.ng"
  ).replace(/\/$/, "");
}

function buildEmbedConfig(partnerId: string, apiKey: string) {
  const baseUrl = integrationBaseUrl();
  const scriptTag = `<script src="${baseUrl}/embed/partner.js" data-partner-id="${partnerId}" data-api-key="${apiKey}" async></script>`;
  return {
    scriptTag,
    partnerId,
    baseUrl,
    apiKey,
    webhookUrl: `${baseUrl}/api/partners/${partnerId}/webhooks/completions`,
  };
}

function formatIntegration(
  integration: {
    adspotLinked: boolean;
    apiKey?: string | null;
    webhookUrl?: string | null;
    embedConfig?: { scriptTag?: string; partnerId?: string; baseUrl?: string } | null;
    activatedAt?: Date | null;
    deactivatedAt?: Date | null;
  },
  partnerId: string,
) {
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
    activatedAt: integration.activatedAt?.toISOString?.() ?? integration.activatedAt ?? null,
    deactivatedAt: integration.deactivatedAt?.toISOString?.() ?? integration.deactivatedAt ?? null,
  };
}

function formatPartnerWithIntegration(
  partner: {
    id: string;
    name: string;
    outletType: string;
    website?: string | null;
    contactEmail?: string | null;
    region?: string | null;
    createdAt?: Date | string;
  },
  integration: {
    adspotLinked: boolean;
    apiKey?: string | null;
    activatedAt?: Date | null;
  },
) {
  return {
    ...partner,
    integration: {
      adspotLinked: integration.adspotLinked,
      status: integration.adspotLinked ? "active" : "inactive",
      apiKey: integration.apiKey ?? undefined,
      activatedAt: integration.activatedAt?.toISOString?.() ?? integration.activatedAt ?? null,
    },
  };
}

async function getOrCreateIntegration(partnerId: string) {
  const [existing] = await db
    .select()
    .from(partnerIntegrationsTable)
    .where(eq(partnerIntegrationsTable.partnerId, partnerId))
    .limit(1);

  if (existing) return existing;

  const [created] = await db
    .insert(partnerIntegrationsTable)
    .values({ partnerId, adspotLinked: false })
    .returning();

  return created;
}

// GET /partners — list network partners (admin)
router.get("/partners", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    if (partnerMemoryEnabled()) {
      ensureAuditPartner();
      const partners = listMemoryPartners().map(({ integration, ...partner }) =>
        formatPartnerWithIntegration(partner, integration),
      );
      res.json({ partners, total: partners.length });
      return;
    }

    const partners = await db
      .select()
      .from(networkPartnersTable)
      .orderBy(desc(networkPartnersTable.createdAt));

    const rows = await Promise.all(
      partners.map(async (partner) => {
        const integration = await getOrCreateIntegration(partner.id);
        return formatPartnerWithIntegration(partner, integration);
      }),
    );

    res.json({ partners: rows, total: rows.length });
  } catch (err) {
    if (respondIfDatabaseUnavailable(res, err, "Failed to list partners")) return;
    logger.error({ err }, "Failed to list partners");
    res.status(500).json({ error: "internal_error", message: "Failed to list partners" });
  }
});

// GET /partners/:id/analytics — partner network analytics (admin or partner portal)
router.get(
  "/partners/:id/analytics",
  validateParams(partnerIdParam),
  async (req, res) => {
    try {
      const { id } = req.params as z.infer<typeof partnerIdParam>;

      if (partnerMemoryEnabled()) {
        ensureAuditPartner();
        const partner = getMemoryPartner(id);
        if (!partner) {
          res.status(404).json({ error: "not_found", message: "Partner not found" });
          return;
        }
        res.json({ analytics: getMemoryAnalytics(id) });
        return;
      }

      const [partner] = await db
        .select()
        .from(networkPartnersTable)
        .where(eq(networkPartnersTable.id, id))
        .limit(1);

      if (!partner) {
        res.status(404).json({ error: "not_found", message: "Partner not found" });
        return;
      }

      const integration = await getOrCreateIntegration(id);
      const linked = integration.adspotLinked;
      res.json({
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
      });
    } catch (err) {
      if (respondIfDatabaseUnavailable(res, err, "Failed to fetch partner analytics")) return;
      logger.error({ err }, "Failed to fetch partner analytics");
      res.status(500).json({ error: "internal_error", message: "Failed to fetch analytics" });
    }
  },
);

// GET /partners/:id — partner profile
router.get("/partners/:id", validateParams(partnerIdParam), async (req, res) => {
  try {
    const { id } = req.params as z.infer<typeof partnerIdParam>;

    if (partnerMemoryEnabled()) {
      ensureAuditPartner();
      const partner = getMemoryPartner(id);
      if (!partner) {
        res.status(404).json({ error: "not_found", message: "Partner not found" });
        return;
      }
      res.json({ partner });
      return;
    }

    const [partner] = await db
      .select()
      .from(networkPartnersTable)
      .where(eq(networkPartnersTable.id, id))
      .limit(1);

    if (!partner) {
      res.status(404).json({ error: "not_found", message: "Partner not found" });
      return;
    }

    res.json({ partner });
  } catch (err) {
    if (respondIfDatabaseUnavailable(res, err, "Failed to fetch partner")) return;
    logger.error({ err }, "Failed to fetch partner");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch partner" });
  }
});

// GET /partners/:id/integration
router.get(
  "/partners/:id/integration",
  validateParams(partnerIdParam),
  async (req, res) => {
    try {
      const { id } = req.params as z.infer<typeof partnerIdParam>;

      if (partnerMemoryEnabled()) {
        ensureAuditPartner();
        const partner = getMemoryPartner(id);
        if (!partner) {
          res.status(404).json({ error: "not_found", message: "Partner not found" });
          return;
        }
        const integration = getMemoryIntegration(id);
        res.json(formatIntegration(integration, id));
        return;
      }

      const [partner] = await db
        .select()
        .from(networkPartnersTable)
        .where(eq(networkPartnersTable.id, id))
        .limit(1);

      if (!partner) {
        res.status(404).json({ error: "not_found", message: "Partner not found" });
        return;
      }

      const integration = await getOrCreateIntegration(id);
      res.json(formatIntegration(integration, id));
    } catch (err) {
      if (respondIfDatabaseUnavailable(res, err, "Failed to fetch partner integration")) return;
      logger.error({ err }, "Failed to fetch partner integration");
      res.status(500).json({ error: "internal_error", message: "Failed to fetch integration" });
    }
  },
);

// POST /partners/:id/integration/activate
router.post(
  "/partners/:id/integration/activate",
  validateParams(partnerIdParam),
  async (req, res) => {
    try {
      const { id } = req.params as z.infer<typeof partnerIdParam>;

      if (partnerMemoryEnabled()) {
        ensureAuditPartner();
        const partner = getMemoryPartner(id);
        if (!partner) {
          res.status(404).json({ error: "not_found", message: "Partner not found" });
          return;
        }
        const integration = activateMemoryIntegration(id);
        res.json({
          ...formatIntegration(integration, id),
          message: "AdSpot integration activated. Campaign routing is now enabled.",
        });
        return;
      }

      const [partner] = await db
        .select()
        .from(networkPartnersTable)
        .where(eq(networkPartnersTable.id, id))
        .limit(1);

      if (!partner) {
        res.status(404).json({ error: "not_found", message: "Partner not found" });
        return;
      }

      const apiKey = `asp_${randomBytes(24).toString("hex")}`;
      const embedConfig = buildEmbedConfig(id, apiKey);
      const now = new Date();

      const [integration] = await db
        .insert(partnerIntegrationsTable)
        .values({
          partnerId: id,
          adspotLinked: true,
          apiKey,
          webhookUrl: embedConfig.webhookUrl,
          embedConfig: {
            scriptTag: embedConfig.scriptTag,
            partnerId: id,
            baseUrl: embedConfig.baseUrl,
          },
          activatedAt: now,
          deactivatedAt: null,
        })
        .onConflictDoUpdate({
          target: partnerIntegrationsTable.partnerId,
          set: {
            adspotLinked: true,
            apiKey,
            webhookUrl: embedConfig.webhookUrl,
            embedConfig: {
              scriptTag: embedConfig.scriptTag,
              partnerId: id,
              baseUrl: embedConfig.baseUrl,
            },
            activatedAt: now,
            deactivatedAt: null,
            updatedAt: now,
          },
        })
        .returning();

      res.json({
        ...formatIntegration(integration, id),
        message: "AdSpot integration activated. Campaign routing is now enabled.",
      });
    } catch (err) {
      if (respondIfDatabaseUnavailable(res, err, "Failed to activate partner integration")) return;
      logger.error({ err }, "Failed to activate partner integration");
      res.status(500).json({ error: "internal_error", message: "Failed to activate integration" });
    }
  },
);

// POST /partners/:id/integration/deactivate
router.post(
  "/partners/:id/integration/deactivate",
  validateParams(partnerIdParam),
  async (req, res) => {
    try {
      const { id } = req.params as z.infer<typeof partnerIdParam>;

      if (partnerMemoryEnabled()) {
        ensureAuditPartner();
        const partner = getMemoryPartner(id);
        if (!partner) {
          res.status(404).json({ error: "not_found", message: "Partner not found" });
          return;
        }
        const integration = deactivateMemoryIntegration(id);
        res.json({
          ...formatIntegration(integration, id),
          message: "AdSpot integration deactivated. Campaign routing has stopped.",
        });
        return;
      }

      const [partner] = await db
        .select()
        .from(networkPartnersTable)
        .where(eq(networkPartnersTable.id, id))
        .limit(1);

      if (!partner) {
        res.status(404).json({ error: "not_found", message: "Partner not found" });
        return;
      }

      const now = new Date();
      const [integration] = await db
        .update(partnerIntegrationsTable)
        .set({
          adspotLinked: false,
          deactivatedAt: now,
          updatedAt: now,
        })
        .where(eq(partnerIntegrationsTable.partnerId, id))
        .returning();

      if (!integration) {
        const created = await getOrCreateIntegration(id);
        res.json(formatIntegration(created, id));
        return;
      }

      res.json({
        ...formatIntegration(integration, id),
        message: "AdSpot integration deactivated. Campaign routing has stopped.",
      });
    } catch (err) {
      if (respondIfDatabaseUnavailable(res, err, "Failed to deactivate partner integration")) return;
      logger.error({ err }, "Failed to deactivate partner integration");
      res.status(500).json({ error: "internal_error", message: "Failed to deactivate integration" });
    }
  },
);

// POST /partners — create partner (onboarding)
const createPartnerBody = z.object({
  name: z.string().min(1).max(200),
  outletType: z.string().max(50).optional().default("newspaper"),
  website: z.string().url().optional(),
  contactEmail: z.string().email().optional(),
  region: z.string().max(100).optional(),
});

router.post("/partners", async (req, res) => {
  try {
    const parsed = createPartnerBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "validation_error", message: "Invalid request", details: parsed.error.issues });
      return;
    }

    if (partnerMemoryEnabled()) {
      const partner = createMemoryPartner(parsed.data);
      res.status(201).json({ partner });
      return;
    }

    const [partner] = await db
      .insert(networkPartnersTable)
      .values(parsed.data)
      .returning();

    await getOrCreateIntegration(partner.id);

    res.status(201).json({ partner });
  } catch (err) {
    if (respondIfDatabaseUnavailable(res, err, "Failed to create partner")) return;
    logger.error({ err }, "Failed to create partner");
    res.status(500).json({ error: "internal_error", message: "Failed to create partner" });
  }
});

export default router;
