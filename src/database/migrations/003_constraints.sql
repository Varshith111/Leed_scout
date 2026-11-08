-- ---------------------------------------------------------------------------
-- 003_constraints
--
-- Referential integrity and duplicate prevention.
--
-- Delete behaviour:
--   * RawBusinesses.jobId       -> CASCADE. Raw listings belong to their job.
--   * VerifiedBusinesses.rawBusinessId -> RESTRICT. Curated, verified leads are
--     never removed as a side effect; deleting their origin row must fail loudly.
--   * Exports.jobId             -> SET NULL. Export files outlive their job.
--
-- The composite unique key is the duplicate-detection rule: one verified
-- business per (name, address, phone). A second sighting updates that row
-- instead of inserting a new one.
-- ---------------------------------------------------------------------------

ALTER TABLE `RawBusinesses`
    ADD CONSTRAINT `fk_RawBusinesses_jobId`
    FOREIGN KEY (`jobId`) REFERENCES `Jobs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `VerifiedBusinesses`
    ADD CONSTRAINT `fk_VerifiedBusinesses_rawBusinessId`
    FOREIGN KEY (`rawBusinessId`) REFERENCES `RawBusinesses` (`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Exports`
    ADD CONSTRAINT `fk_Exports_jobId`
    FOREIGN KEY (`jobId`) REFERENCES `Jobs` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `VerifiedBusinesses`
    ADD CONSTRAINT `uq_VerifiedBusinesses_identity`
    UNIQUE (`name`, `address`, `phone`);
