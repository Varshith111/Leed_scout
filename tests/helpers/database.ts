import { ConfigService } from '../../src/config/config';
import { DatabaseService, type IDatabaseService } from '../../src/database';
import { TEST_DATABASE_SUFFIX, getDatabaseName } from '../../src/database/url';
import { type ILogger, getLogger, initializeLogging } from '../../src/logger';
import { createTestEnv } from './env';

/**
 * Integration-test database helpers.
 *
 * The global setup (tests/setup/globalSetup.ts) creates and migrates the
 * `*_test` database and publishes its URL. Everything here refuses to touch a
 * database whose name does not end in `_test`.
 */

/** `true` when the global setup found a usable MySQL server. */
export const databaseAvailable = process.env.LEADSCOUT_DB_AVAILABLE === 'true';

/** `describe` that skips the whole block when no database is available. */
export const describeWithDatabase = databaseAvailable ? describe : describe.skip;

/** Every table the integration tests may clear, ordered child-first. */
const TABLES = [
  'VerifiedBusinesses',
  'RawBusinesses',
  'Exports',
  'Logs',
  'Settings',
  'Jobs',
] as const;

export interface TestDatabaseContext {
  readonly database: IDatabaseService;
  readonly logger: ILogger;
}

function testDatabaseUrl(): string {
  const url = process.env.LEADSCOUT_TEST_DATABASE_URL;

  if (url === undefined || url === '') {
    throw new Error('Test database URL is not set — is the Jest global setup running?');
  }

  const databaseName = getDatabaseName(url);
  if (!databaseName.endsWith(TEST_DATABASE_SUFFIX)) {
    throw new Error(`Refusing to use non-test database "${databaseName}".`);
  }

  return url;
}

/** Builds a DatabaseService bound to the migrated test database. */
export async function createTestDatabaseContext(): Promise<TestDatabaseContext> {
  const config = new ConfigService(
    createTestEnv({ DATABASE_URL: testDatabaseUrl(), DATABASE_CONNECTION_LIMIT: '5' }),
  ).get();

  initializeLogging(config);
  const logger = getLogger('integration');
  const database = new DatabaseService(config.database, logger);
  await database.initialize();

  return { database, logger };
}

/** Empties every table and resets AUTO_INCREMENT counters. */
export async function truncateAll(database: IDatabaseService): Promise<void> {
  await database.executeDdl('SET FOREIGN_KEY_CHECKS = 0');

  try {
    for (const table of TABLES) {
      await database.executeDdl(`TRUNCATE TABLE \`${table}\``);
    }
  } finally {
    await database.executeDdl('SET FOREIGN_KEY_CHECKS = 1');
  }
}

/** Inserts a job and returns its id. Convenience for tests needing a parent row. */
export async function insertJob(
  database: IDatabaseService,
  overrides: { provider?: string; category?: string; city?: string } = {},
): Promise<number> {
  const result = await database.execute(
    'INSERT INTO `Jobs` (`provider`, `category`, `city`, `state`, `country`) VALUES (?, ?, ?, ?, ?)',
    [
      overrides.provider ?? 'google',
      overrides.category ?? 'Restaurants',
      overrides.city ?? 'Hyderabad',
      'Telangana',
      'India',
    ],
  );

  return result.insertId;
}

/** Inserts a raw business belonging to `jobId` and returns its id. */
export async function insertRawBusiness(
  database: IDatabaseService,
  jobId: number,
  name = 'Test Business',
): Promise<number> {
  const result = await database.execute(
    `INSERT INTO \`RawBusinesses\` (\`jobId\`, \`provider\`, \`name\`, \`phone\`, \`address\`, \`city\`)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [jobId, 'google', name, '+914027843535', 'SD Road, Secunderabad', 'Hyderabad'],
  );

  return result.insertId;
}
