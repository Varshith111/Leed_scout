import 'dotenv/config';
import { Client } from 'pg';

import { ConfigService } from '../../src/config/config';
import { DatabaseService, MigrationRunner } from '../../src/database';
import {
  TEST_DATABASE_SUFFIX,
  getDatabaseName,
  parseDatabaseUrl,
  resolveTestDatabaseUrl,
} from '../../src/database/url';
import { getLogger, initializeLogging } from '../../src/logger';

/**
 * Jest global setup for integration tests.
 *
 * Creates the `*_test` database if needed and migrates it once, then publishes
 * the connection string through `process.env` for the test workers.
 */
export default async function globalSetup(): Promise<void> {
  try {
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

    await createTestDatabase(testUrl, databaseName);
    await migrateTestDatabase(testUrl);

    process.env.LEADSCOUT_TEST_DATABASE_URL = testUrl;
    process.env.LEADSCOUT_DB_AVAILABLE = 'true';
  } catch (error) {
    process.env.LEADSCOUT_DB_AVAILABLE = 'false';
    console.warn(
      `\n[integration] Database unavailable (${error instanceof Error ? error.message : String(error)}) ` +
        '— integration tests will be skipped.\n',
    );
  }
}

async function createTestDatabase(testUrl: string, databaseName: string): Promise<void> {
  const server = parseDatabaseUrl(testUrl);
  const client = new Client({
    host: server.host,
    port: server.port,
    user: server.user,
    password: server.password,
    database: 'postgres',
    ssl: server.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 5_000,
  });

  try {
    await client.connect();
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (res.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await client.end().catch(() => undefined);
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
