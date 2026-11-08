/**
 * Migration entry point.
 *
 * Thin composition wrapper: builds the configuration, logger and
 * DatabaseService, then hands over to {@link MigrationRunner}. All logic lives
 * in `src/database/MigrationRunner.ts`.
 *
 * Usage:
 *   npm run db:migrate           apply pending migrations
 *   npm run db:migrate:status    list applied / pending migrations
 */
import 'dotenv/config';

import { ConfigService } from '../src/config/config';
import { DatabaseService, MigrationRunner, getDatabaseName } from '../src/database';
import { getLogger, initializeLogging } from '../src/logger';

async function main(): Promise<number> {
  const statusOnly = process.argv.includes('--status');

  const config = new ConfigService().get();
  initializeLogging(config);
  const logger = getLogger('migrate');

  const database = new DatabaseService(config.database, logger);
  const runner = new MigrationRunner(database, logger);

  try {
    await database.initialize();
    console.log(`Database: ${getDatabaseName(config.database.url)}`);

    if (statusOnly) {
      for (const entry of await runner.status()) {
        const marker = entry.applied ? '[applied]' : '[pending]';
        const when = entry.executedAt === undefined ? '' : ` (${entry.executedAt})`;
        console.log(`${marker} ${entry.name}${when}`);
      }

      return 0;
    }

    const applied = await runner.run();

    if (applied.length === 0) {
      console.log('No pending migrations.');
    } else {
      for (const outcome of applied) {
        const skipped = outcome.skipped > 0 ? `, ${String(outcome.skipped)} already present` : '';
        console.log(
          `Applied ${outcome.name}: ${String(outcome.statements)} statements in ${String(outcome.durationMs)}ms${skipped}`,
        );
      }
    }

    return 0;
  } catch (error) {
    console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
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
