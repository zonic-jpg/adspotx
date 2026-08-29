import { Router } from "express";
import { db } from "@workspace/db";
import { giftCatalogTable, giftGrantsTable } from "@workspace/db/schema";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router = Router();

// Reviewer: my gifts.
router.get("/gifts/me", requireAuth, requireRole("reviewer"), async (req, res) => {
  try {
    const userId = req.user!.userId;
    const grants = await db.select().from(giftGrantsTable)
      .where(eq(giftGrantsTable.userId, userId)).orderBy(desc(giftGrantsTable.createdAt));
    res.json({ gifts: grants });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to load gifts" }); }
});

// Admin/brand: list + manage the gift catalogue.
router.get("/gifts/catalog", requireAuth, requireRole("admin", "brand"), async (_req, res) => {
  try {
    const rows = await db.select().from(giftCatalogTable).orderBy(desc(giftCatalogTable.createdAt));
    res.json({ catalog: rows });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to load catalog" }); }
});

const giftSchema = z.object({
  adId: z.string().uuid().nullish(),
  type: z.enum(["discount", "cash", "airtime", "points", "voucher", "other"]),
  label: z.string().min(1),
  value: z.number().int().nonnegative().default(0),
  weight: z.number().int().positive().default(1),
  meta: z.record(z.any()).optional(),
  active: z.boolean().default(true),
});

router.post("/gifts/catalog", requireAuth, requireRole("admin", "brand"), async (req, res) => {
  try {
    const parsed = giftSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad_request", message: parsed.error.message });
    const [row] = await db.insert(giftCatalogTable).values(parsed.data as typeof giftCatalogTable.$inferInsert).returning();
    res.json({ gift: row });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to create gift" }); }
});

router.delete("/gifts/catalog/:id", requireAuth, requireRole("admin", "brand"), async (req, res) => {
  try {
    await db.update(giftCatalogTable).set({ active: false }).where(eq(giftCatalogTable.id, String(req.params.id)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to remove gift" }); }
});

export default router;
