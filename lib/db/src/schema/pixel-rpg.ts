import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { pixelQuestUsersTable } from "./pixel-quest";

/** Additive, account-owned mechanics journal. Original game records stay intact. */
export const pixelRpgStateTable = pgTable("pixel_quest_rpg_state", {
  userId: text("user_id").primaryKey().references(() => pixelQuestUsersTable.id, { onDelete: "cascade" }),
  journal: jsonb("journal").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
