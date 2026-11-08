-- ---------------------------------------------------------------------------
-- 002_indexes
--
-- Read-path indexes. Every index below backs a query the application actually
-- issues:
--   * Jobs        — `leadscout jobs` (status/provider filters, newest first).
--   * RawBusinesses — per-job scrape progress and pending-verification scans.
--   * VerifiedBusinesses — the export query (verified = 1 AND hasWebsite = 0)
--     plus the location/category filters offered by the CLI.
-- ---------------------------------------------------------------------------

-- Jobs
CREATE INDEX `idx_Jobs_status` ON `Jobs` (`status`);
CREATE INDEX `idx_Jobs_provider` ON `Jobs` (`provider`);
CREATE INDEX `idx_Jobs_createdAt` ON `Jobs` (`createdAt`);
CREATE INDEX `idx_Jobs_status_provider` ON `Jobs` (`status`, `provider`);

-- RawBusinesses
CREATE INDEX `idx_RawBusinesses_provider` ON `RawBusinesses` (`provider`);
CREATE INDEX `idx_RawBusinesses_city` ON `RawBusinesses` (`city`);
CREATE INDEX `idx_RawBusinesses_state` ON `RawBusinesses` (`state`);
CREATE INDEX `idx_RawBusinesses_category` ON `RawBusinesses` (`category`);
CREATE INDEX `idx_RawBusinesses_createdAt` ON `RawBusinesses` (`createdAt`);
CREATE INDEX `idx_RawBusinesses_jobId` ON `RawBusinesses` (`jobId`);
CREATE INDEX `idx_RawBusinesses_provider_providerBusinessId`
    ON `RawBusinesses` (`provider`, `providerBusinessId`);

-- VerifiedBusinesses
CREATE INDEX `idx_VerifiedBusinesses_city` ON `VerifiedBusinesses` (`city`);
CREATE INDEX `idx_VerifiedBusinesses_state` ON `VerifiedBusinesses` (`state`);
CREATE INDEX `idx_VerifiedBusinesses_category` ON `VerifiedBusinesses` (`category`);
CREATE INDEX `idx_VerifiedBusinesses_provider` ON `VerifiedBusinesses` (`provider`);
CREATE INDEX `idx_VerifiedBusinesses_verified` ON `VerifiedBusinesses` (`verified`);
CREATE INDEX `idx_VerifiedBusinesses_hasWebsite` ON `VerifiedBusinesses` (`hasWebsite`);
CREATE INDEX `idx_VerifiedBusinesses_rating` ON `VerifiedBusinesses` (`rating`);
CREATE INDEX `idx_VerifiedBusinesses_reviewCount` ON `VerifiedBusinesses` (`reviewCount`);
CREATE INDEX `idx_VerifiedBusinesses_rawBusinessId` ON `VerifiedBusinesses` (`rawBusinessId`);
-- Covers the export predicate directly.
CREATE INDEX `idx_VerifiedBusinesses_verified_hasWebsite`
    ON `VerifiedBusinesses` (`verified`, `hasWebsite`);

-- Exports
CREATE INDEX `idx_Exports_jobId` ON `Exports` (`jobId`);
CREATE INDEX `idx_Exports_format` ON `Exports` (`format`);
CREATE INDEX `idx_Exports_createdAt` ON `Exports` (`createdAt`);

-- Logs
CREATE INDEX `idx_Logs_level` ON `Logs` (`level`);
CREATE INDEX `idx_Logs_event` ON `Logs` (`event`);
CREATE INDEX `idx_Logs_createdAt` ON `Logs` (`createdAt`);
