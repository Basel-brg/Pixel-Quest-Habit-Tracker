import pg from "pg";
import { readFile } from "node:fs/promises";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  // One atomic additive migration: existing accounts keep access and progression.
  // The default remains false for accounts registered after this migration.
  await pool.query(await readFile(new URL("../migrations/onboarding.sql", import.meta.url), "utf8"));
  console.info("Onboarding migration complete; existing accounts preserved.");
} finally {
  await pool.end();
}
