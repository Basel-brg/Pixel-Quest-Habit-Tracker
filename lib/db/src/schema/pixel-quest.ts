import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const habitsTable = pgTable("pixel_quest_habits", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  frequency: text("frequency").notNull().default("daily"),
  days: integer("days").array().notNull().default(sql`'{}'::integer[]`),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const habitCompletionsTable = pgTable(
  "pixel_quest_habit_completions",
  {
    id: serial("id").primaryKey(),
    habitId: integer("habit_id")
      .notNull()
      .references(() => habitsTable.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    xpAwarded: integer("xp_awarded").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pixel_quest_habit_date_unique").on(table.habitId, table.date),
  ],
);

export const questTasksTable = pgTable("pixel_quest_tasks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  difficulty: text("difficulty").notNull().default("medium"),
  category: text("category").notNull(),
  priority: boolean("priority").notNull().default(false),
  status: text("status").notNull().default("active"),
  dueDate: date("due_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  xpAwarded: integer("xp_awarded").notNull().default(0),
});

export const playerProfileTable = pgTable("pixel_quest_player", {
  id: integer("id").primaryKey().default(1),
  xp: integer("xp").notNull().default(0),
});

export const insertHabitSchema = createInsertSchema(habitsTable).omit({
  id: true,
  createdAt: true,
});
export const insertTaskSchema = createInsertSchema(questTasksTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
  xpAwarded: true,
});

export type HabitRecord = typeof habitsTable.$inferSelect;
export type HabitCompletionRecord = typeof habitCompletionsTable.$inferSelect;
export type QuestTaskRecord = typeof questTasksTable.$inferSelect;
export type PlayerRecord = typeof playerProfileTable.$inferSelect;
export type InsertHabit = z.infer<typeof insertHabitSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
