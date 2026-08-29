import { Router } from "express";
import { db } from "@workspace/db";
import { notificationsTable } from "@workspace/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/notifications", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const rows = await db.select().from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt)).limit(100);
    res.json({ notifications: rows, unread: rows.filter((r) => !r.read).length });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to load notifications" }); }
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    await db.update(notificationsTable).set({ read: true })
      .where(and(eq(notificationsTable.id, String(req.params.id)), eq(notificationsTable.userId, userId)));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to update" }); }
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  try {
    const userId = req.user!.userId;
    await db.update(notificationsTable).set({ read: true }).where(eq(notificationsTable.userId, userId));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "internal_error", message: "Failed to update" }); }
});

export default router;
