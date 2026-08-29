-- Reviewer profile expansion: 6 new demographic dimensions + interests.
-- Apply with `pnpm --filter @workspace/db run push`, or run this directly.
DO $$ BEGIN CREATE TYPE income_band AS ENUM ('under_100k','100k_300k','300k_700k','700k_1_5m','over_1_5m'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE device_type AS ENUM ('android','ios','desktop'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE marital_status AS ENUM ('single','married','other'); EXCEPTION WHEN duplicate_object THEN null; END $$;
ALTER TABLE reviewer_profiles
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS income_band income_band,
  ADD COLUMN IF NOT EXISTS occupation_sector text,
  ADD COLUMN IF NOT EXISTS device_type device_type,
  ADD COLUMN IF NOT EXISTS marital_status marital_status,
  ADD COLUMN IF NOT EXISTS interests text[];
