import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const platformSettingsTable = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  label: text("label").notNull(),
  description: text("description"),
  type: text("type").notNull().default("string"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
