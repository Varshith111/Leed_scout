-- ---------------------------------------------------------------------------
-- 001_initial_schema
--
-- Core tables for Supabase / PostgreSQL.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "Jobs" (
    "id" BIGSERIAL PRIMARY KEY,
    "provider" VARCHAR(32) NOT NULL,
    "category" VARCHAR(191) NOT NULL,
    "city" VARCHAR(191) NOT NULL,
    "state" VARCHAR(191) NULL,
    "country" VARCHAR(191) NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "progress" SMALLINT NOT NULL DEFAULT 0,
    "businessesFound" INT NOT NULL DEFAULT 0,
    "businessesVerified" INT NOT NULL DEFAULT 0,
    "businessesWithoutWebsite" INT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMPTZ(3) NULL,
    "completedAt" TIMESTAMPTZ(3) NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "RawBusinesses" (
    "id" BIGSERIAL PRIMARY KEY,
    "jobId" BIGINT NOT NULL,
    "provider" VARCHAR(32) NOT NULL,
    "providerBusinessId" VARCHAR(191) NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(191) NULL,
    "phone" VARCHAR(64) NULL,
    "website" VARCHAR(512) NULL,
    "address" VARCHAR(512) NULL,
    "city" VARCHAR(191) NULL,
    "state" VARCHAR(191) NULL,
    "country" VARCHAR(191) NULL,
    "rating" DECIMAL(2, 1) NULL,
    "reviewCount" INT NULL,
    "latitude" DECIMAL(10, 7) NULL,
    "longitude" DECIMAL(10, 7) NULL,
    "googleMapsUrl" VARCHAR(1024) NULL,
    "rawData" JSONB NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "VerifiedBusinesses" (
    "id" BIGSERIAL PRIMARY KEY,
    "rawBusinessId" BIGINT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(191) NULL,
    "phone" VARCHAR(64) NOT NULL DEFAULT '',
    "website" VARCHAR(512) NULL,
    "address" VARCHAR(255) NOT NULL DEFAULT '',
    "city" VARCHAR(191) NULL,
    "state" VARCHAR(191) NULL,
    "country" VARCHAR(191) NULL,
    "rating" DECIMAL(2, 1) NULL,
    "reviewCount" INT NULL,
    "latitude" DECIMAL(10, 7) NULL,
    "longitude" DECIMAL(10, 7) NULL,
    "googleMapsUrl" VARCHAR(1024) NULL,
    "provider" VARCHAR(32) NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT FALSE,
    "hasWebsite" BOOLEAN NOT NULL DEFAULT FALSE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Exports" (
    "id" BIGSERIAL PRIMARY KEY,
    "jobId" BIGINT NULL,
    "format" VARCHAR(32) NOT NULL,
    "filePath" VARCHAR(1024) NOT NULL,
    "recordCount" INT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Logs" (
    "id" BIGSERIAL PRIMARY KEY,
    "level" VARCHAR(32) NOT NULL,
    "event" VARCHAR(64) NULL,
    "context" VARCHAR(191) NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Settings" (
    "id" INT NOT NULL PRIMARY KEY,
    "workers" INT NOT NULL DEFAULT 4,
    "headless" BOOLEAN NOT NULL DEFAULT TRUE,
    "retryCount" INT NOT NULL DEFAULT 3,
    "timeout" INT NOT NULL DEFAULT 30000,
    "proxyEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "rateLimit" INT NOT NULL DEFAULT 60,
    "browserType" VARCHAR(32) NOT NULL DEFAULT 'chromium',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
