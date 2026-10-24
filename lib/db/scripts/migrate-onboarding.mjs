import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  // One atomic additive migration: existing accounts keep access and progression.
  // The default remains false for accounts registered after this migration.
  await pool.query(`
    DO $migration$
    DECLARE newly_added boolean;
    BEGIN
      SELECT NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'pixel_quest_player'
          AND column_name = 'has_completed_onboarding'
      ) INTO newly_added;
      ALTER TABLE pixel_quest_player ADD COLUMN IF NOT EXISTS has_completed_onboarding boolean NOT NULL DEFAULT false;
      ALTER TABLE pixel_quest_player ADD COLUMN IF NOT EXISTS onboarding_draft jsonb NOT NULL DEFAULT '{"step":1}'::jsonb;
      ALTER TABLE pixel_quest_player ADD COLUMN IF NOT EXISTS hero_path text;
      IF newly_added THEN
        UPDATE pixel_quest_player SET has_completed_onboarding = true;
      END IF;
    END
    $migration$;
  `);
  console.info("Onboarding migration complete; existing accounts preserved.");
} finally {
  await pool.end();
}
