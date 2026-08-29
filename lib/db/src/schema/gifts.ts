import { pgTable, text, timestamp, uuid, integer, boolean, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { adsTable } from "./ads";

// A gift can be ANY reward type — not airtime-specific.
export const giftTypeEnum = pgEnum("gift_type", [
  "discount",   // % or amount off a product
  "cash",       // cash credit
  "airtime",    // mobile airtime
  "points",     // bonus points
  "voucher",    // third-party voucher
  "other",
]);

// Catalogue of possible gifts with a weight for the weighted-random draw.
// Admin/brand configures these; the engine draws one on review completion.
export const giftCatalogTable = pgTable("gift_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  adId: uuid("ad_id").references(() => adsTable.id, { onDelete: "cascade" }), // null = global pool
  type: giftTypeEnum("type").notNull(),
  label: text("label").notNull(),                 // "10% off", "₦200 airtime", "₦500 cash"
  value: integer("value").notNull().default(0),   // numeric value (kobo/points/percent)
  meta: jsonb("meta"),                            // e.g. { network, productId, code }
  weight: integer("weight").notNull().default(1), // relative probability
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const giftGrantStatusEnum = pgEnum("gift_grant_status", ["granted", "redeemed", "expired"]);

// Immutable record of a gift awarded to a user (the "random gift on completion").
export const giftGrantsTable = pgTable("gift_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  giftId: uuid("gift_id").notNull().references(() => giftCatalogTable.id),
  reviewSessionId: uuid("review_session_id"),
  type: giftTypeEnum("type").notNull(),
  label: text("label").notNull(),
  value: integer("value").notNull().default(0),
  status: giftGrantStatusEnum("status").notNull().default("granted"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGiftCatalogSchema = createInsertSchema(giftCatalogTable).omit({ id: true, createdAt: true });
export const insertGiftGrantSchema = createInsertSchema(giftGrantsTable).omit({ id: true, createdAt: true });
export type GiftCatalog = typeof giftCatalogTable.$inferSelect;
export type GiftGrant = typeof giftGrantsTable.$inferSelect;
