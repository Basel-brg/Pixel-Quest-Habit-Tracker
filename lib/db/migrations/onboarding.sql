DO $migration$
DECLARE newly_added boolean;
BEGIN
  -- A brand-new database gets these defaults when the schema is subsequently pushed.
  IF to_regclass('pixel_quest_player') IS NULL THEN
    RETURN;
  END IF;
  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'pixel_quest_player'
      AND column_name = 'has_completed_onboarding'
  ) INTO newly_added;
  ALTER TABLE pixel_quest_player ADD COLUMN IF NOT EXISTS has_completed_onboarding boolean NOT NULL DEFAULT false;
  ALTER TABLE pixel_quest_player ADD COLUMN IF NOT EXISTS onboarding_draft jsonb NOT NULL DEFAULT '{"step":1}'::jsonb;
  ALTER TABLE pixel_quest_player ADD COLUMN IF NOT EXISTS hero_path text;
  ALTER TABLE pixel_quest_player ADD COLUMN IF NOT EXISTS onboarding_revision integer NOT NULL DEFAULT 0;
  IF newly_added THEN
    UPDATE pixel_quest_player SET has_completed_onboarding = true WHERE user_id IS NOT NULL;
  END IF;
END
$migration$;
