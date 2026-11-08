/**
 * Seed entry point.
 *
 * Thin composition wrapper around {@link seedDatabase}.
 *
 * Usage:
 *   npm run db:seed
 */
import 'dotenv/config';

import { ConfigService } from '../src/config/config';
import { DatabaseService, seedDatabase } from '../src/database';
import { getLogger, initializeLogging } from '../src/logger';

async function main(): Promise<number> {
  const config = new ConfigService().get();
  initializeLogging(config);
  const logger = getLogger('seed');

  const database = new DatabaseService(config.database, logger);

  try {
    await database.initialize();
    const result = await seedDatabase(database, logger);

    console.log(
      result.settingsCreated
        ? 'Seed complete: default settings inserted.'
        : 'Seed complete: settings already present, nothing changed.',
    );

    return 0;
  } catch (error) {
    console.error(`Seed failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    await database.shutdown();
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
