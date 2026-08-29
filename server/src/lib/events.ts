import { db as defaultDb } from "@workspace/db";
import { eventsLogTable, EVENT_TYPES } from "@workspace/db/schema";

export { EVENT_TYPES };

export interface LogEventParams {
  eventType: string;
  actorId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}

type InsertCapable = Pick<typeof defaultDb, "insert">;

/**
 * Log a platform event to the immutable events_log table.
 * Throws on failure — callers must handle or let the error propagate
 * so that a failed event write never silently produces a success response.
 *
 * Pass the transaction handle `tx` when calling inside a db.transaction()
 * to keep the event write part of the same atomic transaction.
 */
export async function logEvent(params: LogEventParams, client: InsertCapable = defaultDb): Promise<void> {
  await client.insert(eventsLogTable).values({
    eventType: params.eventType,
    actorId: params.actorId ?? null,
    entityType: params.entityType ?? null,
    entityId: params.entityId ?? null,
    metadata: params.metadata ?? null,
  });
}

/**
 * Same as logEvent but swallows errors. Use only for non-critical informational
 * events that must not block the primary operation (e.g. read audit trails,
 * snapshot writes).
 */
export async function logEventSafe(params: LogEventParams, client: InsertCapable = defaultDb): Promise<void> {
  try {
    await logEvent(params, client);
  } catch (err) {
    console.error("Failed to log event (non-fatal):", err);
  }
}
