import { pgTable, text, timestamp, uuid, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const adPackagesTable = pgTable("ad_packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  adSlots: integer("ad_slots").notNull().default(1),
  durationDays: integer("duration_days").notNull().default(30),
  maxImpressions: integer("max_impressions").notNull().default(10000),
  weight: integer("weight").notNull().default(1),
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAdPackageSchema = createInsertSchema(adPackagesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertAdPackage = z.infer<typeof insertAdPackageSchema>;
export type AdPackage = typeof adPackagesTable.$inferSelect;
