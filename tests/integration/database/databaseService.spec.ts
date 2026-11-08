import type { IDatabaseService } from '../../../src/database';
import { isTransientDatabaseError } from '../../../src/database/DatabaseService';
import { DatabaseError } from '../../../src/utils/errors';
import {
  createTestDatabaseContext,
  describeWithDatabase,
  insertJob,
  truncateAll,
} from '../../helpers/database';

interface JobCountRow {
  readonly total: number;
}

interface JobNameRow {
  readonly id: number;
  readonly category: string;
}

describeWithDatabase('DatabaseService', () => {
  let database: IDatabaseService;

  beforeAll(async () => {
    ({ database } = await createTestDatabaseContext());
  });

  afterAll(async () => {
    await database.shutdown();
  });

  beforeEach(async () => {
    await truncateAll(database);
  });

  it('reports a healthy connection', async () => {
    await expect(database.healthCheck()).resolves.toBe(true);
  });

  it('returns rows from a SELECT', async () => {
    await insertJob(database, { category: 'Cafes' });
    await insertJob(database, { category: 'Bakeries' });

    const rows = await database.query<JobNameRow>(
      'SELECT `id`, `category` FROM `Jobs` ORDER BY `id` ASC',
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.category)).toEqual(['Cafes', 'Bakeries']);
  });

  it('returns the insert id and affected rows from a write', async () => {
    const inserted = await database.execute(
      'INSERT INTO `Jobs` (`provider`, `category`, `city`) VALUES (?, ?, ?)',
      ['google', 'Salons', 'Hyderabad'],
    );

    expect(inserted.insertId).toBeGreaterThan(0);

    const updated = await database.execute('UPDATE `Jobs` SET `progress` = ? WHERE `id` = ?', [
      42,
      inserted.insertId,
    ]);

    expect(updated.affectedRows).toBe(1);
  });

  it('returns null from queryOne when nothing matches', async () => {
    await expect(
      database.queryOne('SELECT `id` FROM `Jobs` WHERE `id` = ?', [999_999]),
    ).resolves.toBeNull();
  });

  it('sends parameters as prepared-statement values, not SQL', async () => {
    const jobId = await insertJob(database, { category: "Chai'wala; DROP TABLE Jobs; --" });

    const row = await database.queryOne<JobNameRow>(
      'SELECT `id`, `category` FROM `Jobs` WHERE `id` = ?',
      [jobId],
    );

    // The value round-trips verbatim and the table still exists.
    expect(row?.category).toBe("Chai'wala; DROP TABLE Jobs; --");
    await expect(database.query('SELECT COUNT(*) AS total FROM `Jobs`')).resolves.toHaveLength(1);
  });

  it('commits work performed inside a transaction', async () => {
    await database.transaction(async (connection) => {
      await database.execute(
        'INSERT INTO `Jobs` (`provider`, `category`, `city`) VALUES (?, ?, ?)',
        ['google', 'Gyms', 'Hyderabad'],
        connection,
      );
      await database.execute(
        'INSERT INTO `Jobs` (`provider`, `category`, `city`) VALUES (?, ?, ?)',
        ['justdial', 'Spas', 'Hyderabad'],
        connection,
      );
    });

    const [row] = await database.query<JobCountRow>('SELECT COUNT(*) AS total FROM `Jobs`');

    expect(Number(row?.total)).toBe(2);
  });

  it('rolls back every statement when the transaction body throws', async () => {
    const failure = database.transaction(async (connection) => {
      await database.execute(
        'INSERT INTO `Jobs` (`provider`, `category`, `city`) VALUES (?, ?, ?)',
        ['google', 'Gyms', 'Hyderabad'],
        connection,
      );

      throw new Error('provider crashed mid-job');
    });

    await expect(failure).rejects.toThrow(DatabaseError);

    const [row] = await database.query<JobCountRow>('SELECT COUNT(*) AS total FROM `Jobs`');
    expect(Number(row?.total)).toBe(0);
  });

  it('rolls back when a statement violates a constraint', async () => {
    const failure = database.transaction(async (connection) => {
      await database.execute(
        'INSERT INTO `Jobs` (`provider`, `category`, `city`) VALUES (?, ?, ?)',
        ['google', 'Gyms', 'Hyderabad'],
        connection,
      );

      // No such job — the foreign key rejects this row.
      await database.execute(
        'INSERT INTO `RawBusinesses` (`jobId`, `provider`, `name`) VALUES (?, ?, ?)',
        [999_999, 'google', 'Orphan'],
        connection,
      );
    });

    await expect(failure).rejects.toThrow(DatabaseError);

    const [row] = await database.query<JobCountRow>('SELECT COUNT(*) AS total FROM `Jobs`');
    expect(Number(row?.total)).toBe(0);
  });

  it('wraps driver failures in DatabaseError with the failing SQL', async () => {
    await expect(database.query('SELECT * FROM `NoSuchTable`')).rejects.toThrow(DatabaseError);
  });

  it('reuses a single pool across calls', () => {
    expect(database.getPool()).toBe(database.getPool());
  });

  it('is safe to initialise twice', async () => {
    await expect(database.initialize()).resolves.toBeUndefined();
  });
});

describe('isTransientDatabaseError', () => {
  it('recognises dropped connections and lock conflicts', () => {
    expect(isTransientDatabaseError({ code: 'PROTOCOL_CONNECTION_LOST' })).toBe(true);
    expect(isTransientDatabaseError({ code: 'ER_LOCK_DEADLOCK' })).toBe(true);
  });

  it('does not retry programming errors', () => {
    expect(isTransientDatabaseError({ code: 'ER_NO_SUCH_TABLE' })).toBe(false);
    expect(isTransientDatabaseError(new Error('boom'))).toBe(false);
  });
});
