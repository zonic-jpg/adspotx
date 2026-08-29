import { db } from "@workspace/db";
import type { Queryable } from "./db-types";
import { notificationsTable } from "@workspace/db/schema";

type NotifyType = "reward" | "gift" | "redemption" | "referral" | "fraud" | "campaign" | "system";

export async function notify(
  userId: string, type: NotifyType, title: string, message: string, tx?: Queryable
) {
  const runner = tx ?? db;
  await runner.insert(notificationsTable).values({ userId, type, title, message });
}
