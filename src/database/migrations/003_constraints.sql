-- ---------------------------------------------------------------------------
-- 003_constraints
--
-- Referential integrity and duplicate prevention for Supabase / PostgreSQL.
-- ---------------------------------------------------------------------------

ALTER TABLE "RawBusinesses"
    DROP CONSTRAINT IF EXISTS "fk_RawBusinesses_jobId",
    ADD CONSTRAINT "fk_RawBusinesses_jobId"
    FOREIGN KEY ("jobId") REFERENCES "Jobs" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VerifiedBusinesses"
    DROP CONSTRAINT IF EXISTS "fk_VerifiedBusinesses_rawBusinessId",
    ADD CONSTRAINT "fk_VerifiedBusinesses_rawBusinessId"
    FOREIGN KEY ("rawBusinessId") REFERENCES "RawBusinesses" ("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Exports"
    DROP CONSTRAINT IF EXISTS "fk_Exports_jobId",
    ADD CONSTRAINT "fk_Exports_jobId"
    FOREIGN KEY ("jobId") REFERENCES "Jobs" ("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "VerifiedBusinesses"
    DROP CONSTRAINT IF EXISTS "uq_VerifiedBusinesses_identity",
    ADD CONSTRAINT "uq_VerifiedBusinesses_identity"
    UNIQUE ("name", "address", "phone");
