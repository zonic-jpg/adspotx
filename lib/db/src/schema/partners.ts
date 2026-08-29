import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Newspapers / media outlets in the AdSpot Network Partner Program */
export const networkPartnersTable = pgTable("network_partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  outletType: text("outlet_type").notNull().default("newspaper"),
  website: text("website"),
  contactEmail: text("contact_email"),
  region: text("region"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** AdSpot integration link — default inactive until partner opts in */
export const partnerIntegrationsTable = pgTable("partner_integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id")
    .notNull()
    .references(() => networkPartnersTable.id, { onDelete: "cascade" })
    .unique(),
  adspotLinked: boolean("adspot_linked").notNull().default(false),
  apiKey: text("api_key"),
  webhookUrl: text("webhook_url"),
  embedConfig: jsonb("embed_config").$type<{
    scriptTag?: string;
    partnerId?: string;
    baseUrl?: string;
  }>(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNetworkPartnerSchema = createInsertSchema(networkPartnersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertNetworkPartner = z.infer<typeof insertNetworkPartnerSchema>;
export type NetworkPartner = typeof networkPartnersTable.$inferSelect;
export type PartnerIntegration = typeof partnerIntegrationsTable.$inferSelect;
