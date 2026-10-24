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

export const pixelQuestUsersTable = pgTable(
  "pixel_quest_users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    selectedAvatar: text("selected_avatar").notNull().default("novice"),
    selectedTheme: text("selected_theme").notNull().default("retro"),
    themeUpdatedAt: timestamp("theme_updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pixel_quest_users_username_unique").on(
      sql`lower(${table.username})`,
    ),
  ],
);

export const habitsTable = pgTable("pixel_quest_habits", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => pixelQuestUsersTable.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  category: text("category").notNull(),
  frequency: text("frequency").notNull().default("daily"),
  days: integer("days").array().notNull().default(sql`'{}'::integer[]`),
  archived: boolean("archived").notNull().default(false),
  requiresPhotoProof: boolean("requires_photo_proof").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const habitCompletionsTable = pgTable(
  "pixel_quest_habit_completions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => pixelQuestUsersTable.id, {
      onDelete: "cascade",
    }),
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
  userId: text("user_id").references(() => pixelQuestUsersTable.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  difficulty: text("difficulty").notNull().default("medium"),
  category: text("category").notNull(),
  priority: boolean("priority").notNull().default(false),
  requiresPhotoProof: boolean("requires_photo_proof").notNull().default(false),
  status: text("status").notNull().default("active"),
  dueDate: date("due_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  xpAwarded: integer("xp_awarded").notNull().default(0),
});

export const rewardsTable = pgTable("pixel_quest_rewards", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => pixelQuestUsersTable.id, {
    onDelete: "cascade",
  }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("Personal"),
  ruleType: text("rule_type").notNull(),
  target: integer("target").notNull(),
  habitId: integer("habit_id").references(() => habitsTable.id, {
    onDelete: "set null",
  }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const playerProfileTable = pgTable(
  "pixel_quest_player",
  {
    id: integer("id").primaryKey().default(1),
    userId: text("user_id").references(() => pixelQuestUsersTable.id, {
      onDelete: "cascade",
    }),
    xp: integer("xp").notNull().default(0),
    gold: integer("gold").notNull().default(0),
    lifetimeTasksVanquished: integer("lifetime_tasks_vanquished")
      .notNull()
      .default(0),
  },
  (table) => [
    uniqueIndex("pixel_quest_player_user_unique").on(table.userId),
  ],
);

export const playerMilestonesTable = pgTable(
  "pixel_quest_milestones",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => pixelQuestUsersTable.id, { onDelete: "cascade" }),
    key: text("milestone_key").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    achievedAt: timestamp("achieved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("pixel_quest_milestone_user_key_unique").on(
      table.userId,
      table.key,
    ),
  ],
);

export const insertHabitSchema = createInsertSchema(habitsTable).omit({
  id: true,
  userId: true,
  createdAt: true,
});
export const insertTaskSchema = createInsertSchema(questTasksTable).omit({
  id: true,
  userId: true,
  createdAt: true,
  completedAt: true,
  xpAwarded: true,
});
export const insertRewardSchema = createInsertSchema(rewardsTable).omit({
  id: true,
  userId: true,
  claimedAt: true,
  createdAt: true,
});

export type HabitRecord = typeof habitsTable.$inferSelect;
export type HabitCompletionRecord = typeof habitCompletionsTable.$inferSelect;
export type QuestTaskRecord = typeof questTasksTable.$inferSelect;
export type PlayerRecord = typeof playerProfileTable.$inferSelect;
export type RewardRecord = typeof rewardsTable.$inferSelect;
export type PixelQuestUserRecord = typeof pixelQuestUsersTable.$inferSelect;
export type PlayerMilestoneRecord = typeof playerMilestonesTable.$inferSelect;
export type InsertHabit = z.infer<typeof insertHabitSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type InsertReward = z.infer<typeof insertRewardSchema>;
