import { pgTable, text, timestamp, uuid, integer, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { adsTable } from "./ads";

export const questionTypeEnum = pgEnum("question_type", [
  "multiple_choice",
  "rating",
  "open_text",
  "emoji",
  "yes_no",
]);

export const questionsTable = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  adId: uuid("ad_id").notNull().references(() => adsTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  questionType: questionTypeEnum("question_type").notNull(),
  questionText: text("question_text").notNull(),
  options: jsonb("options").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertQuestionSchema = createInsertSchema(questionsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Question = typeof questionsTable.$inferSelect;
