import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { platformSettingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { logEventSafe, EVENT_TYPES } from "../lib/events";
import { logger } from "../lib/logger";

const router = Router();

const updateSettingsBody = z.object({
  updates: z.array(
    z.object({
      key: z.string().min(1).max(100),
      value: z.string().max(1000),
    })
  ).min(1),
});

// GET /admin/settings
router.get("/admin/settings", requireAuth, requireRole("admin"), async (_req, res) => {
  try {
    const settings = await db.select().from(platformSettingsTable).orderBy(platformSettingsTable.key);
    res.json({ settings });
    await logEventSafe({
      eventType: EVENT_TYPES.ADMIN_EVENTS_QUERIED,
      actorId: null,
      entityType: "platform_settings",
      entityId: null,
      metadata: { action: "get_settings" },
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch settings");
    res.status(500).json({ error: "internal_error", message: "Failed to fetch settings" });
  }
});

// PATCH /admin/settings
router.patch(
  "/admin/settings",
  requireAuth,
  requireRole("admin"),
  validateBody(updateSettingsBody),
  async (req, res) => {
    try {
      const { updates } = req.body as z.infer<typeof updateSettingsBody>;

      for (const { key, value } of updates) {
        await db
          .update(platformSettingsTable)
          .set({ value, updatedAt: new Date() })
          .where(eq(platformSettingsTable.key, key));
      }

      const settings = await db.select().from(platformSettingsTable).orderBy(platformSettingsTable.key);

      await logEventSafe({
        eventType: EVENT_TYPES.AD_UPDATED,
        actorId: req.user!.userId,
        entityType: "platform_settings",
        entityId: null,
        metadata: { action: "update_settings", keys: updates.map((u) => u.key) },
      });

      res.json({ settings });
    } catch (err) {
      logger.error({ err }, "Failed to update settings");
      res.status(500).json({ error: "internal_error", message: "Failed to update settings" });
    }
  }
);

export default router;
