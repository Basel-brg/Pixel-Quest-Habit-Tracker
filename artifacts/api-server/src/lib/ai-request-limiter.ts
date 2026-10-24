import { and, eq, sql } from "drizzle-orm";
import { aiRequestRateLimitsTable, db } from "@workspace/db";

const REQUEST_LIMIT = 5;
const WINDOW_MS = 60_000;

export type AiEndpoint = "voice" | "photo" | "assistant";

/**
 * Records an AI request atomically in PostgreSQL so the user limit is shared
 * across API instances and survives process restarts.
 */
export async function consumeAiRequestLimit(
  userId: string,
  endpoint: AiEndpoint,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    // Serialize requests for the same account + endpoint, including the first
    // request before a row exists. Hash collisions only cause extra waiting.
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${userId}:${endpoint}`}, 0))`,
    );
    // Raw Drizzle results do not guarantee pg's Date decoder. Ask PostgreSQL
    // for epoch milliseconds instead, retaining the shared database clock.
    const clock = await tx.execute(
      sql`SELECT (EXTRACT(EPOCH FROM clock_timestamp()) * 1000)::double precision AS now_ms`,
    );
    const databaseTimestamp: unknown = clock.rows[0]?.["now_ms"];
    if (typeof databaseTimestamp !== "number" || !Number.isFinite(databaseTimestamp)) {
      throw new Error("Could not read the database clock.");
    }
    const now = databaseTimestamp;

    const [existing] = await tx
      .select({
        requestTimestamps: aiRequestRateLimitsTable.requestTimestamps,
      })
      .from(aiRequestRateLimitsTable)
      .where(
        and(
          eq(aiRequestRateLimitsTable.userId, userId),
          eq(aiRequestRateLimitsTable.endpoint, endpoint),
        ),
      )
      .limit(1);

    const recent = (existing?.requestTimestamps ?? []).filter(
      (timestamp) => now - timestamp.getTime() < WINDOW_MS,
    );
    if (recent.length >= REQUEST_LIMIT) return false;

    recent.push(new Date(now));
    await tx
      .insert(aiRequestRateLimitsTable)
      .values({ userId, endpoint, requestTimestamps: recent })
      .onConflictDoUpdate({
        target: [
          aiRequestRateLimitsTable.userId,
          aiRequestRateLimitsTable.endpoint,
        ],
        set: { requestTimestamps: recent },
      });

    return true;
  });
}
