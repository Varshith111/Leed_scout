import type { ILogger } from '../logger';
import { BrowserType } from '../models/enums';
import type { SettingsRow } from '../models/entities';
import type { IDatabaseService } from './DatabaseService';

/**
 * Database seeding.
 *
 * Idempotent: inserts the single `Settings` row with the documented defaults if
 * it is missing, and leaves an existing row untouched. Running the seed twice
 * never changes configuration a user has already tuned.
 */

/** Row id of the singleton settings record. */
export const SETTINGS_ROW_ID = 1;

/** Documented defaults for the runtime settings layer. */
export const DEFAULT_SETTINGS = {
  workers: 4,
  headless: true,
  retryCount: 3,
  timeout: 30_000,
  proxyEnabled: false,
  rateLimit: 60,
  browserType: BrowserType.CHROMIUM,
} as const;

export interface SeedResult {
  readonly settingsCreated: boolean;
  readonly settings: SettingsRow;
}

const SELECT_SETTINGS = `
  SELECT \`id\`, \`workers\`, \`headless\`, \`retryCount\`, \`timeout\`, \`proxyEnabled\`,
         \`rateLimit\`, \`browserType\`, \`createdAt\`, \`updatedAt\`
    FROM \`Settings\`
   WHERE \`id\` = ?`;

/**
 * Ensures the default settings row exists.
 *
 * The existence check reports accurately whether this run created the row;
 * `ON DUPLICATE KEY UPDATE id = id` then makes the write itself a no-op, so two
 * seeds racing each other cannot fail on the primary key. (`affectedRows` alone
 * cannot distinguish the two cases: mysql2 connects with `CLIENT_FOUND_ROWS`,
 * which reports matched rows rather than changed rows.)
 */
export async function seedDatabase(
  database: IDatabaseService,
  logger: ILogger,
): Promise<SeedResult> {
  const before = await database.queryOne<SettingsRow>(SELECT_SETTINGS, [SETTINGS_ROW_ID]);

  await database.execute(
    `INSERT INTO "Settings"
        ("id", "workers", "headless", "retryCount", "timeout", "proxyEnabled", "rateLimit", "browserType")
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT ("id") DO NOTHING`,
    [
      SETTINGS_ROW_ID,
      DEFAULT_SETTINGS.workers,
      DEFAULT_SETTINGS.headless,
      DEFAULT_SETTINGS.retryCount,
      DEFAULT_SETTINGS.timeout,
      DEFAULT_SETTINGS.proxyEnabled,
      DEFAULT_SETTINGS.rateLimit,
      DEFAULT_SETTINGS.browserType,
    ],
  );

  const settingsCreated = before === null;
  const settings = await database.queryOne<SettingsRow>(SELECT_SETTINGS, [SETTINGS_ROW_ID]);

  if (settings === null) {
    throw new Error('Settings row could not be read back after seeding');
  }

  logger.info(settingsCreated ? 'Default settings created' : 'Default settings already present', {
    workers: settings.workers,
    headless: Boolean(settings.headless),
    retryCount: settings.retryCount,
    timeout: settings.timeout,
  });

  return { settingsCreated, settings };
}
