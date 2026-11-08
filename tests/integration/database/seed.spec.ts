import type { IDatabaseService } from '../../../src/database';
import { DEFAULT_SETTINGS, SETTINGS_ROW_ID, seedDatabase } from '../../../src/database';
import type { ILogger } from '../../../src/logger';
import { toBoolean } from '../../../src/models/entities';
import {
  createTestDatabaseContext,
  describeWithDatabase,
  truncateAll,
} from '../../helpers/database';

interface CountRow {
  readonly total: number;
}

describeWithDatabase('seedDatabase', () => {
  let database: IDatabaseService;
  let logger: ILogger;

  beforeAll(async () => {
    ({ database, logger } = await createTestDatabaseContext());
  });

  afterAll(async () => {
    await database.shutdown();
  });

  beforeEach(async () => {
    await truncateAll(database);
  });

  it('creates the settings row with the documented defaults', async () => {
    const result = await seedDatabase(database, logger);

    expect(result.settingsCreated).toBe(true);
    expect(result.settings.id).toBe(SETTINGS_ROW_ID);
    expect(result.settings.workers).toBe(DEFAULT_SETTINGS.workers);
    expect(toBoolean(result.settings.headless)).toBe(DEFAULT_SETTINGS.headless);
    expect(result.settings.retryCount).toBe(DEFAULT_SETTINGS.retryCount);
    expect(result.settings.timeout).toBe(DEFAULT_SETTINGS.timeout);
    expect(result.settings.rateLimit).toBe(DEFAULT_SETTINGS.rateLimit);
    expect(result.settings.browserType).toBe(DEFAULT_SETTINGS.browserType);
    expect(toBoolean(result.settings.proxyEnabled)).toBe(false);
  });

  it('is idempotent and never inserts a second row', async () => {
    await seedDatabase(database, logger);
    const second = await seedDatabase(database, logger);

    expect(second.settingsCreated).toBe(false);

    const [row] = await database.query<CountRow>('SELECT COUNT(*) AS total FROM `Settings`');
    expect(Number(row?.total)).toBe(1);
  });

  it('leaves user-tuned settings untouched', async () => {
    await seedDatabase(database, logger);
    await database.execute('UPDATE `Settings` SET `workers` = ?, `headless` = ? WHERE `id` = ?', [
      16,
      false,
      SETTINGS_ROW_ID,
    ]);

    const result = await seedDatabase(database, logger);

    expect(result.settings.workers).toBe(16);
    expect(toBoolean(result.settings.headless)).toBe(false);
  });
});
