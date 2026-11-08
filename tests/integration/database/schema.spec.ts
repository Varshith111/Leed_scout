import type { IDatabaseService } from '../../../src/database';
import { DatabaseError } from '../../../src/utils/errors';
import {
  createTestDatabaseContext,
  describeWithDatabase,
  insertJob,
  insertRawBusiness,
  truncateAll,
} from '../../helpers/database';

interface CountRow {
  readonly total: number;
}

interface IndexRow {
  readonly INDEX_NAME: string;
}

interface ConstraintRow {
  readonly CONSTRAINT_NAME: string;
  readonly DELETE_RULE: string;
}

async function insertVerified(
  database: IDatabaseService,
  rawBusinessId: number,
  overrides: { name?: string; address?: string; phone?: string; hasWebsite?: boolean } = {},
): Promise<number> {
  const result = await database.execute(
    `INSERT INTO \`VerifiedBusinesses\`
       (\`rawBusinessId\`, \`name\`, \`address\`, \`phone\`, \`provider\`, \`verified\`, \`hasWebsite\`)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      rawBusinessId,
      overrides.name ?? 'Paradise Biryani',
      overrides.address ?? 'SD Road, Secunderabad',
      overrides.phone ?? '+914027843535',
      'google',
      true,
      overrides.hasWebsite ?? false,
    ],
  );

  return result.insertId;
}

describeWithDatabase('schema', () => {
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

  describe('composite unique key on VerifiedBusinesses', () => {
    it('rejects a second row with the same (name, address, phone)', async () => {
      const jobId = await insertJob(database);
      const rawId = await insertRawBusiness(database, jobId);
      await insertVerified(database, rawId);

      await expect(insertVerified(database, rawId)).rejects.toThrow(DatabaseError);

      const [row] = await database.query<CountRow>(
        'SELECT COUNT(*) AS total FROM `VerifiedBusinesses`',
      );
      expect(Number(row?.total)).toBe(1);
    });

    it('treats a different phone as a different business', async () => {
      const jobId = await insertJob(database);
      const rawId = await insertRawBusiness(database, jobId);

      await insertVerified(database, rawId, { phone: '+914027843535' });
      await insertVerified(database, rawId, { phone: '+914027843536' });

      const [row] = await database.query<CountRow>(
        'SELECT COUNT(*) AS total FROM `VerifiedBusinesses`',
      );
      expect(Number(row?.total)).toBe(2);
    });

    it('de-duplicates rows with empty address and phone, since they are NOT NULL', async () => {
      const jobId = await insertJob(database);
      const rawId = await insertRawBusiness(database, jobId);

      await insertVerified(database, rawId, { name: 'Nameless Kitchen', address: '', phone: '' });

      await expect(
        insertVerified(database, rawId, { name: 'Nameless Kitchen', address: '', phone: '' }),
      ).rejects.toThrow(DatabaseError);
    });

    it('supports upsert-on-duplicate for the identity key', async () => {
      const jobId = await insertJob(database);
      const rawId = await insertRawBusiness(database, jobId);
      await insertVerified(database, rawId, { hasWebsite: false });

      await database.execute(
        `INSERT INTO \`VerifiedBusinesses\`
           (\`rawBusinessId\`, \`name\`, \`address\`, \`phone\`, \`provider\`, \`verified\`, \`hasWebsite\`)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE \`hasWebsite\` = VALUES(\`hasWebsite\`)`,
        [rawId, 'Paradise Biryani', 'SD Road, Secunderabad', '+914027843535', 'google', true, true],
      );

      const [row] = await database.query<CountRow & { hasWebsite: number }>(
        'SELECT COUNT(*) AS total, MAX(`hasWebsite`) AS hasWebsite FROM `VerifiedBusinesses`',
      );

      expect(Number(row?.total)).toBe(1);
      expect(Number(row?.hasWebsite)).toBe(1);
    });
  });

  describe('foreign keys', () => {
    it('cascades job deletion to its raw businesses', async () => {
      const jobId = await insertJob(database);
      await insertRawBusiness(database, jobId, 'A');
      await insertRawBusiness(database, jobId, 'B');

      await database.execute('DELETE FROM `Jobs` WHERE `id` = ?', [jobId]);

      const [row] = await database.query<CountRow>('SELECT COUNT(*) AS total FROM `RawBusinesses`');
      expect(Number(row?.total)).toBe(0);
    });

    it('refuses to delete a raw business that a verified business points at', async () => {
      const jobId = await insertJob(database);
      const rawId = await insertRawBusiness(database, jobId);
      await insertVerified(database, rawId);

      await expect(
        database.execute('DELETE FROM `RawBusinesses` WHERE `id` = ?', [rawId]),
      ).rejects.toThrow(DatabaseError);
    });

    it('nulls the job reference of an export when the job is deleted', async () => {
      const jobId = await insertJob(database);
      await database.execute(
        'INSERT INTO `Exports` (`jobId`, `format`, `filePath`, `recordCount`) VALUES (?, ?, ?, ?)',
        [jobId, 'csv', 'output/leads.csv', 12],
      );

      await database.execute('DELETE FROM `Jobs` WHERE `id` = ?', [jobId]);

      const row = await database.queryOne<{ jobId: number | null }>(
        'SELECT `jobId` FROM `Exports` LIMIT 1',
      );

      expect(row).not.toBeNull();
      expect(row?.jobId).toBeNull();
    });

    it('declares the documented delete rules', async () => {
      const rules = await database.query<ConstraintRow>(
        `SELECT \`CONSTRAINT_NAME\`, \`DELETE_RULE\`
           FROM information_schema.REFERENTIAL_CONSTRAINTS
          WHERE \`CONSTRAINT_SCHEMA\` = DATABASE()`,
      );

      const byName = new Map(rules.map((rule) => [rule.CONSTRAINT_NAME, rule.DELETE_RULE]));

      expect(byName.get('fk_RawBusinesses_jobId')).toBe('CASCADE');
      expect(byName.get('fk_VerifiedBusinesses_rawBusinessId')).toBe('RESTRICT');
      expect(byName.get('fk_Exports_jobId')).toBe('SET NULL');
    });
  });

  describe('indexes', () => {
    async function indexNames(table: string): Promise<string[]> {
      const rows = await database.query<IndexRow>(
        `SELECT DISTINCT \`INDEX_NAME\`
           FROM information_schema.STATISTICS
          WHERE \`TABLE_SCHEMA\` = DATABASE() AND \`TABLE_NAME\` = ?`,
        [table],
      );

      return rows.map((row) => row.INDEX_NAME);
    }

    it('indexes the documented Jobs columns', async () => {
      const names = await indexNames('Jobs');

      expect(names).toEqual(
        expect.arrayContaining([
          'idx_Jobs_status',
          'idx_Jobs_provider',
          'idx_Jobs_createdAt',
          'idx_Jobs_status_provider',
        ]),
      );
    });

    it('indexes the documented RawBusinesses columns', async () => {
      const names = await indexNames('RawBusinesses');

      expect(names).toEqual(
        expect.arrayContaining([
          'idx_RawBusinesses_provider',
          'idx_RawBusinesses_city',
          'idx_RawBusinesses_state',
          'idx_RawBusinesses_category',
          'idx_RawBusinesses_createdAt',
        ]),
      );
    });

    it('indexes the documented VerifiedBusinesses columns, including the export predicate', async () => {
      const names = await indexNames('VerifiedBusinesses');

      expect(names).toEqual(
        expect.arrayContaining([
          'idx_VerifiedBusinesses_city',
          'idx_VerifiedBusinesses_state',
          'idx_VerifiedBusinesses_category',
          'idx_VerifiedBusinesses_provider',
          'idx_VerifiedBusinesses_verified',
          'idx_VerifiedBusinesses_hasWebsite',
          'idx_VerifiedBusinesses_rating',
          'idx_VerifiedBusinesses_reviewCount',
          'idx_VerifiedBusinesses_verified_hasWebsite',
          'uq_VerifiedBusinesses_identity',
        ]),
      );
    });
  });

  describe('column behaviour', () => {
    it('maintains createdAt and updatedAt server-side', async () => {
      const jobId = await insertJob(database);

      const before = await database.queryOne<{ createdAt: string; updatedAt: string }>(
        'SELECT `createdAt`, `updatedAt` FROM `Jobs` WHERE `id` = ?',
        [jobId],
      );

      expect(before?.createdAt).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 1_100));
      await database.execute('UPDATE `Jobs` SET `progress` = ? WHERE `id` = ?', [50, jobId]);

      const after = await database.queryOne<{ createdAt: string; updatedAt: string }>(
        'SELECT `createdAt`, `updatedAt` FROM `Jobs` WHERE `id` = ?',
        [jobId],
      );

      expect(after?.createdAt).toBe(before?.createdAt);
      expect(after?.updatedAt).not.toBe(before?.updatedAt);
    });

    it('stores and returns JSON columns', async () => {
      const jobId = await insertJob(database);
      await database.execute(
        'INSERT INTO `RawBusinesses` (`jobId`, `provider`, `name`, `rawData`) VALUES (?, ?, ?, ?)',
        [jobId, 'google', 'JSON Cafe', JSON.stringify({ openingHours: '09:00-22:00' })],
      );

      const row = await database.queryOne<{ rawData: { openingHours: string } }>(
        'SELECT `rawData` FROM `RawBusinesses` WHERE `name` = ?',
        ['JSON Cafe'],
      );

      expect(row?.rawData.openingHours).toBe('09:00-22:00');
    });

    it('rejects an unknown enum value', async () => {
      await expect(
        database.execute('INSERT INTO `Jobs` (`provider`, `category`, `city`) VALUES (?, ?, ?)', [
          'yelp',
          'Restaurants',
          'Hyderabad',
        ]),
      ).rejects.toThrow(DatabaseError);
    });
  });
});
