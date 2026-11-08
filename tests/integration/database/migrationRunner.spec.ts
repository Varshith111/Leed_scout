import type { IDatabaseService } from '../../../src/database';
import { MigrationRunner } from '../../../src/database';
import type { ILogger } from '../../../src/logger';
import { DatabaseError } from '../../../src/utils/errors';
import { createTestDatabaseContext, describeWithDatabase } from '../../helpers/database';

interface CountRow {
  readonly total: number;
}

describeWithDatabase('MigrationRunner', () => {
  let database: IDatabaseService;
  let logger: ILogger;
  let runner: MigrationRunner;

  beforeAll(async () => {
    ({ database, logger } = await createTestDatabaseContext());
    runner = new MigrationRunner(database, logger);
  });

  afterAll(async () => {
    await database.shutdown();
  });

  it('discovers the shipped migrations in filename order', async () => {
    const discovered = await runner.discover();

    expect(discovered.map((migration) => migration.name)).toEqual([
      '001_initial_schema',
      '002_indexes',
      '003_constraints',
    ]);
    expect(discovered[0]?.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it('records every applied migration (global setup ran them)', async () => {
    const applied = await runner.getApplied();

    expect(applied.map((migration) => migration.name)).toEqual([
      '001_initial_schema',
      '002_indexes',
      '003_constraints',
    ]);
  });

  it('is a no-op when everything is already applied', async () => {
    await expect(runner.run()).resolves.toEqual([]);
  });

  it('reports status for each migration', async () => {
    const status = await runner.status();

    expect(status).toHaveLength(3);
    expect(status.every((entry) => entry.applied)).toBe(true);
    expect(status[0]?.executedAt).toBeDefined();
  });

  it('created every application table', async () => {
    const [row] = await database.query<CountRow>(
      `SELECT COUNT(*) AS total
         FROM information_schema.TABLES
        WHERE \`TABLE_SCHEMA\` = DATABASE()
          AND \`TABLE_NAME\` IN ('Jobs', 'RawBusinesses', 'VerifiedBusinesses', 'Exports', 'Logs', 'Settings', 'schema_migrations')`,
    );

    expect(Number(row?.total)).toBe(7);
  });

  it('refuses to run when an applied migration was edited afterwards', async () => {
    await database.execute('UPDATE `schema_migrations` SET `checksum` = ? WHERE `name` = ?', [
      '0'.repeat(64),
      '002_indexes',
    ]);

    try {
      await expect(runner.run()).rejects.toThrow(/modified after it was applied/);
    } finally {
      const [migration] = (await runner.discover()).filter((file) => file.name === '002_indexes');
      await database.execute('UPDATE `schema_migrations` SET `checksum` = ? WHERE `name` = ?', [
        migration?.checksum ?? '',
        '002_indexes',
      ]);
    }
  });

  it('converges when a migration is re-run over already-created objects', async () => {
    // Simulates an interrupted run: the objects exist but the bookkeeping row
    // is gone. MySQL cannot roll back DDL, so re-running must not dead-end.
    await database.execute('DELETE FROM `schema_migrations` WHERE `name` = ?', ['003_constraints']);

    const outcomes = await runner.run();

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.name).toBe('003_constraints');
    expect(outcomes[0]?.skipped).toBe(outcomes[0]?.statements);

    const applied = await runner.getApplied();
    expect(applied.map((migration) => migration.name)).toContain('003_constraints');
  });

  it('fails clearly when the migrations directory is missing', async () => {
    const brokenRunner = new MigrationRunner(database, logger, 'no/such/directory');

    await expect(brokenRunner.run()).rejects.toThrow(DatabaseError);
  });
});
