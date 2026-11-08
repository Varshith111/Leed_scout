-- ---------------------------------------------------------------------------
-- 002_indexes
--
-- Read-path indexes for Supabase / PostgreSQL.
-- ---------------------------------------------------------------------------

-- Jobs
CREATE INDEX IF NOT EXISTS "idx_Jobs_status" ON "Jobs" ("status");
CREATE INDEX IF NOT EXISTS "idx_Jobs_provider" ON "Jobs" ("provider");
CREATE INDEX IF NOT EXISTS "idx_Jobs_createdAt" ON "Jobs" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_Jobs_status_provider" ON "Jobs" ("status", "provider");

-- RawBusinesses
CREATE INDEX IF NOT EXISTS "idx_RawBusinesses_provider" ON "RawBusinesses" ("provider");
CREATE INDEX IF NOT EXISTS "idx_RawBusinesses_city" ON "RawBusinesses" ("city");
CREATE INDEX IF NOT EXISTS "idx_RawBusinesses_state" ON "RawBusinesses" ("state");
CREATE INDEX IF NOT EXISTS "idx_RawBusinesses_category" ON "RawBusinesses" ("category");
CREATE INDEX IF NOT EXISTS "idx_RawBusinesses_createdAt" ON "RawBusinesses" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_RawBusinesses_jobId" ON "RawBusinesses" ("jobId");
CREATE INDEX IF NOT EXISTS "idx_RawBusinesses_provider_providerBusinessId"
    ON "RawBusinesses" ("provider", "providerBusinessId");

-- VerifiedBusinesses
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_city" ON "VerifiedBusinesses" ("city");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_state" ON "VerifiedBusinesses" ("state");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_category" ON "VerifiedBusinesses" ("category");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_provider" ON "VerifiedBusinesses" ("provider");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_verified" ON "VerifiedBusinesses" ("verified");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_hasWebsite" ON "VerifiedBusinesses" ("hasWebsite");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_rating" ON "VerifiedBusinesses" ("rating");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_reviewCount" ON "VerifiedBusinesses" ("reviewCount");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_rawBusinessId" ON "VerifiedBusinesses" ("rawBusinessId");
CREATE INDEX IF NOT EXISTS "idx_VerifiedBusinesses_verified_hasWebsite"
    ON "VerifiedBusinesses" ("verified", "hasWebsite");

-- Exports
CREATE INDEX IF NOT EXISTS "idx_Exports_jobId" ON "Exports" ("jobId");
CREATE INDEX IF NOT EXISTS "idx_Exports_format" ON "Exports" ("format");
CREATE INDEX IF NOT EXISTS "idx_Exports_createdAt" ON "Exports" ("createdAt");

-- Logs
CREATE INDEX IF NOT EXISTS "idx_Logs_level" ON "Logs" ("level");
CREATE INDEX IF NOT EXISTS "idx_Logs_event" ON "Logs" ("event");
CREATE INDEX IF NOT EXISTS "idx_Logs_createdAt" ON "Logs" ("createdAt");
