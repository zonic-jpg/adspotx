import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { adPackagesTable, brandsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody, validateParams } from "../middlewares/validate";
import { logEventSafe, EVENT_TYPES } from "../lib/events";
import { logger } from "../lib/logger";

const router = Router();

const packageIdParam = z.object({ packageId: z.string().uuid("packageId must be a valid UUID") });

const createPackageBody = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  price: z.number().positive(),
  adSlots: z.number().int().positive().optional().default(1),
  durationDays: z.number().int().positive().optional().default(30),
  maxImpressions: z.number().int().positive().optional().default(10000),
  weight: z.number().int().min(1).max(100).optional().default(1),
  featured: z.boolean().optional().default(false),
  active: z.boolean().optional().default(true),
});

const updatePackageBody = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  price: z.number().positive().optional(),
  adSlots: z.number().int().positive().optional(),
  durationDays: z.number().int().positive().optional(),
  maxImpressions: z.number().int().positive().optional(),
  weight: z.number().int().min(1).max(100).optional(),
  featured: z.boolean().optional(),
  active: z.boolean().optional(),
});

function formatPackage(p: typeof adPackagesTable.$inferSelect) {
  return { ...p, price: parseFloat(String(p.price)) };
}

// GET /admin/packages
router.get("/admin/packages", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const packages = await db.select().from(adPackagesTable).orderBy(adPackagesTable.price);
    res.json({ packages: packages.map(formatPackage) });
    await logEventSafe({
      eventType: EVENT_TYPES.ADMIN_ADS_QUERIED,
      actorId: null,
      entityType: "ad_packages",
      entityId: null,
      metadata: { action: "list_packages" },
    });
  } catch (err) {
    logger.error({ err }, "Failed to list packages");
    res.status(500).json({ error: "internal_error", message: "Failed to list packages" });
  }
});

// POST /admin/packages
router.post("/admin/packages", requireAuth, requireRole("admin"), validateBody(createPackageBody), async (req, res) => {
  try {
    const body = req.body as z.infer<typeof createPackageBody>;
    const [pkg] = await db
      .insert(adPackagesTable)
      .values({
        name: body.name,
        description: body.description,
        price: String(body.price),
        adSlots: body.adSlots,
        durationDays: body.durationDays,
        maxImpressions: body.maxImpressions,
        weight: body.weight,
        featured: body.featured,
        active: body.active,
      })
      .returning();

    await logEventSafe({
      eventType: EVENT_TYPES.AD_UPDATED,
      actorId: req.user!.userId,
      entityType: "ad_package",
      entityId: pkg!.id,
      metadata: { action: "create_package", name: body.name, price: body.price },
    });

    res.status(201).json(formatPackage(pkg!));
  } catch (err) {
    logger.error({ err }, "Failed to create package");
    res.status(500).json({ error: "internal_error", message: "Failed to create package" });
  }
});

// PATCH /admin/packages/:packageId
router.patch(
  "/admin/packages/:packageId",
  requireAuth,
  requireRole("admin"),
  validateParams(packageIdParam),
  validateBody(updatePackageBody),
  async (req, res) => {
    try {
      const { packageId } = req.params as { packageId: string };
      const body = req.body as z.infer<typeof updatePackageBody>;

      const updates: Record<string, unknown> = {};
      if (body.name !== undefined) updates["name"] = body.name;
      if (body.description !== undefined) updates["description"] = body.description;
      if (body.price !== undefined) updates["price"] = String(body.price);
      if (body.adSlots !== undefined) updates["adSlots"] = body.adSlots;
      if (body.durationDays !== undefined) updates["durationDays"] = body.durationDays;
      if (body.maxImpressions !== undefined) updates["maxImpressions"] = body.maxImpressions;
      if (body.weight !== undefined) updates["weight"] = body.weight;
      if (body.featured !== undefined) updates["featured"] = body.featured;
      if (body.active !== undefined) updates["active"] = body.active;

      if (Object.keys(updates).length === 0) {
        res.status(400).json({ error: "validation_error", message: "No fields to update" });
        return;
      }

      const [pkg] = await db
        .update(adPackagesTable)
        .set(updates)
        .where(eq(adPackagesTable.id, packageId))
        .returning();

      if (!pkg) {
        res.status(404).json({ error: "not_found", message: "Package not found" });
        return;
      }

      await logEventSafe({
        eventType: EVENT_TYPES.AD_UPDATED,
        actorId: req.user!.userId,
        entityType: "ad_package",
        entityId: pkg.id,
        metadata: { action: "update_package", updates },
      });

      res.json(formatPackage(pkg));
    } catch (err) {
      logger.error({ err }, "Failed to update package");
      res.status(500).json({ error: "internal_error", message: "Failed to update package" });
    }
  }
);

// DELETE /admin/packages/:packageId
router.delete(
  "/admin/packages/:packageId",
  requireAuth,
  requireRole("admin"),
  validateParams(packageIdParam),
  async (req, res) => {
    try {
      const { packageId } = req.params as { packageId: string };
      const [deleted] = await db
        .delete(adPackagesTable)
        .where(eq(adPackagesTable.id, packageId))
        .returning();

      if (!deleted) {
        res.status(404).json({ error: "not_found", message: "Package not found" });
        return;
      }

      await logEventSafe({
        eventType: EVENT_TYPES.AD_UPDATED,
        actorId: req.user!.userId,
        entityType: "ad_package",
        entityId: packageId,
        metadata: { action: "delete_package" },
      });

      res.status(204).send();
    } catch (err) {
      logger.error({ err }, "Failed to delete package");
      res.status(500).json({ error: "internal_error", message: "Failed to delete package" });
    }
  }
);

// POST /brands/packages/:packageId/purchase — brand purchases a package
router.post(
  "/brands/packages/:packageId/purchase",
  requireAuth,
  requireRole("brand"),
  validateParams(packageIdParam),
  async (req, res) => {
    try {
      const { packageId } = req.params as { packageId: string };

      const [pkg] = await db
        .select()
        .from(adPackagesTable)
        .where(eq(adPackagesTable.id, packageId))
        .limit(1);

      if (!pkg || !pkg.active) {
        res.status(404).json({ error: "not_found", message: "Package not found or inactive" });
        return;
      }

      const [brand] = await db
        .select()
        .from(brandsTable)
        .where(eq(brandsTable.userId, req.user!.userId))
        .limit(1);

      if (!brand) {
        res.status(404).json({ error: "not_found", message: "Brand profile not found" });
        return;
      }

      const purchasedAt = new Date();
      const expiresAt = new Date(purchasedAt.getTime() + pkg.durationDays * 24 * 60 * 60 * 1000);

      await logEventSafe({
        eventType: EVENT_TYPES.AD_UPDATED,
        actorId: req.user!.userId,
        entityType: "ad_package",
        entityId: pkg.id,
        metadata: {
          action: "purchase_package",
          brandId: brand.id,
          packageName: pkg.name,
          price: pkg.price,
          adSlots: pkg.adSlots,
        },
      });

      res.json({
        packageId: pkg.id,
        packageName: pkg.name,
        brandId: brand.id,
        adSlotsGranted: pkg.adSlots,
        expiresAt: expiresAt.toISOString(),
        purchasedAt: purchasedAt.toISOString(),
      });
    } catch (err) {
      logger.error({ err }, "Failed to purchase package");
      res.status(500).json({ error: "internal_error", message: "Failed to purchase package" });
    }
  }
);

export default router;
