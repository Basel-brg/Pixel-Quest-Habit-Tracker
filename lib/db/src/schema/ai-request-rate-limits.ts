import { sql } from "drizzle-orm";
import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { pixelQuestUsersTable } from "./pixel-quest";

/** Shared per-user timestamps for paid AI request throttling across API instances. */
export const aiRequestRateLimitsTable = pgTable(
  "ai_request_rate_limits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => pixelQuestUsersTable.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    requestTimestamps: timestamp("request_timestamps", {
      withTimezone: true,
    })
      .array()
      .notNull()
      .default(sql`ARRAY[]::timestamptz[]`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.endpoint] })],
);
