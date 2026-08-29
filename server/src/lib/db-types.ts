import { db } from "@workspace/db";

/** A drizzle transaction handle (the callback parameter of db.transaction). */
export type DbTx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Anything that can run queries: the root client or a transaction. */
export type Queryable = typeof db | DbTx;
