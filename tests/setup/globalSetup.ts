import 'dotenv/config';
import { createConnection } from 'mysql2/promise';

import { ConfigService } from '../../src/config/config';
import { DatabaseService, MigrationRunner } from '../../src/database';
import {
  TEST_DATABASE_SUFFIX,
  getDatabaseName,
  parseMysqlUrl,
  resolveTestDatabaseUrl,
} from '../../src/database/url';
import { getLogger, initializeLogging } from '../../src/logger';

/**
 * Jest global setup for integration tests.
 *
 * Creates the `*_test` database if needed and migrates it once, then publishes
 * the connection string through `process.env` for the test workers (Jest forks
 * workers after this hook, so they inherit the environment).
 *
 * When MySQL is unreachable the integration suites skip themselves instead of
 * failing, so `npm test` still works on a machine without a database.
 */
export default async function globalSetup(): Promise<void> {
  const testUrl = resolveTestDatabaseUrl(
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_TEST,
  );

  if (testUrl === undefined) {
    process.env.LEADSCOUT_DB_AVAILABLE = 'false';
    console.warn('\n[integration] DATABASE_URL is not set — integration tests will be skipped.\n');
    return;
  }

  const databaseName = getDatabaseName(testUrl);

  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to run integration tests against "${databaseName}": ` +
        `the database name must end with "${TEST_DATABASE_SUFFIX}".`,
    );
  }

  try {
    await createTestDatabase(testUrl, databaseName);
    await migrateTestDatabase(testUrl);

    process.env.LEADSCOUT_TEST_DATABASE_URL = testUrl;
    process.env.LEADSCOUT_DB_AVAILABLE = 'true';
  } catch (error) {
    process.env.LEADSCOUT_DB_AVAILABLE = 'false';
    console.warn(
      `\n[integration] MySQL unavailable (${error instanceof Error ? error.message : String(error)}) ` +
        '— integration tests will be skipped.\n',
    );
  }
}

async function createTestDatabase(testUrl: string, databaseName: string): Promise<void> {
  const { database: _ignored, ...server } = parseMysqlUrl(testUrl);
  const connection = await createConnection({ ...server, connectTimeout: 5_000 });

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS \`${databaseName.replace(/`/g, '``')}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}

async function migrateTestDatabase(testUrl: string): Promise<void> {
  const config = new ConfigService({ ...process.env, DATABASE_URL: testUrl }).get();
  initializeLogging(config);

  const logger = getLogger('test-setup');
  const database = new DatabaseService(config.database, logger);

  try {
    await database.initialize();
    await new MigrationRunner(database, logger).run();
  } finally {
    await database.shutdown();
  }
}
