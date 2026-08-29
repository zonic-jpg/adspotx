import { pgTable, text, timestamp, uuid, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const genderEnum = pgEnum("gender", ["male", "female"]);
export const ageBandEnum = pgEnum("age_band", ["18_24", "25_34", "35_44", "45_54", "55_plus"]);
export const employmentStatusEnum = pgEnum("employment_status", [
  "employed",
  "self_employed",
  "student",
  "unemployed",
  "retired",
]);
export const incomeBandEnum = pgEnum("income_band", [
  "under_100k",
  "100k_300k",
  "300k_700k",
  "700k_1_5m",
  "over_1_5m",
]);
export const deviceTypeEnum = pgEnum("device_type", ["android", "ios", "desktop"]);
export const maritalStatusEnum = pgEnum("marital_status", ["single", "married", "other"]);
export const educationLevelEnum = pgEnum("education_level", [
  "primary",
  "secondary",
  "bachelors",
  "masters",
  "phd",
  "other",
]);

export const reviewerProfilesTable = pgTable("reviewer_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" })
    .unique(),
  gender: genderEnum("gender"),
  ageBand: ageBandEnum("age_band"),
  state: text("state"),
  employmentStatus: employmentStatusEnum("employment_status"),
  educationLevel: educationLevelEnum("education_level"),
  city: text("city"),
  incomeBand: incomeBandEnum("income_band"),
  occupationSector: text("occupation_sector"),
  deviceType: deviceTypeEnum("device_type"),
  maritalStatus: maritalStatusEnum("marital_status"),
  interests: text("interests").array(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReviewerProfileSchema = createInsertSchema(reviewerProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertReviewerProfile = z.infer<typeof insertReviewerProfileSchema>;
export type ReviewerProfile = typeof reviewerProfilesTable.$inferSelect;

export const NIGERIAN_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue",
  "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "FCT – Abuja", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina",
  "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger", "Ogun", "Ondo",
  "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;
