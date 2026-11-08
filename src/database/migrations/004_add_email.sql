-- ---------------------------------------------------------------------------
-- 004_add_email
--
-- Adds email / Gmail column to RawBusinesses and VerifiedBusinesses.
-- ---------------------------------------------------------------------------

ALTER TABLE "RawBusinesses"
    ADD COLUMN IF NOT EXISTS "email" VARCHAR(255) NULL;

ALTER TABLE "VerifiedBusinesses"
    ADD COLUMN IF NOT EXISTS "email" VARCHAR(255) NULL;

CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_email" ON "VerifiedBusinesses" ("email");
