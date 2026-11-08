-- ---------------------------------------------------------------------------
-- 001_initial_schema
--
-- Core tables. Indexes are added in 002 and foreign keys / unique constraints
-- in 003, so each concern stays reviewable on its own.
--
-- Conventions:
--   * InnoDB + utf8mb4 everywhere (full Unicode, including emoji in names).
--   * DATETIME(3) with server-side defaults, so timestamps never depend on the
--     application clock or on an ORM.
--   * Enumerations mirror src/models/enums.ts exactly.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS `Jobs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `provider` ENUM('google', 'justdial', 'indiamart') NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED')
        NOT NULL DEFAULT 'PENDING',
    `progress` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    `businessesFound` INT UNSIGNED NOT NULL DEFAULT 0,
    `businessesVerified` INT UNSIGNED NOT NULL DEFAULT 0,
    `businessesWithoutWebsite` INT UNSIGNED NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `RawBusinesses` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `jobId` BIGINT UNSIGNED NOT NULL,
    `provider` ENUM('google', 'justdial', 'indiamart') NOT NULL,
    `providerBusinessId` VARCHAR(191) NULL,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(191) NULL,
    `phone` VARCHAR(64) NULL,
    `website` VARCHAR(512) NULL,
    `address` VARCHAR(512) NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `rating` DECIMAL(2, 1) NULL,
    `reviewCount` INT UNSIGNED NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `googleMapsUrl` VARCHAR(1024) NULL,
    `rawData` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- `name`, `address` and `phone` are NOT NULL with an empty-string default
-- because they form the composite unique key added in 003: MySQL treats NULLs
-- as distinct inside a UNIQUE index, which would silently defeat duplicate
-- detection.
CREATE TABLE IF NOT EXISTS `VerifiedBusinesses` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `rawBusinessId` BIGINT UNSIGNED NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `category` VARCHAR(191) NULL,
    `phone` VARCHAR(64) NOT NULL DEFAULT '',
    `website` VARCHAR(512) NULL,
    `address` VARCHAR(255) NOT NULL DEFAULT '',
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `country` VARCHAR(191) NULL,
    `rating` DECIMAL(2, 1) NULL,
    `reviewCount` INT UNSIGNED NULL,
    `latitude` DECIMAL(10, 7) NULL,
    `longitude` DECIMAL(10, 7) NULL,
    `googleMapsUrl` VARCHAR(1024) NULL,
    `provider` ENUM('google', 'justdial', 'indiamart') NOT NULL,
    `verified` BOOLEAN NOT NULL DEFAULT FALSE,
    `hasWebsite` BOOLEAN NOT NULL DEFAULT FALSE,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Exports` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `jobId` BIGINT UNSIGNED NULL,
    `format` ENUM('csv', 'excel', 'json') NOT NULL,
    `filePath` VARCHAR(1024) NOT NULL,
    `recordCount` INT UNSIGNED NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `Logs` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `level` ENUM('error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly') NOT NULL,
    `event` VARCHAR(64) NULL,
    `context` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- Single-row table holding the persisted runtime configuration layer.
CREATE TABLE IF NOT EXISTS `Settings` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `workers` TINYINT UNSIGNED NOT NULL DEFAULT 4,
    `headless` BOOLEAN NOT NULL DEFAULT TRUE,
    `retryCount` TINYINT UNSIGNED NOT NULL DEFAULT 3,
    `timeout` INT UNSIGNED NOT NULL DEFAULT 30000,
    `proxyEnabled` BOOLEAN NOT NULL DEFAULT FALSE,
    `rateLimit` SMALLINT UNSIGNED NOT NULL DEFAULT 60,
    `browserType` ENUM('chromium', 'firefox', 'webkit') NOT NULL DEFAULT 'chromium',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
