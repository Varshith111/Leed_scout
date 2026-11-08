import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { readFile, readdir } from 'node:fs/promises';

import { type ILogger } from '../logger';
import { DatabaseError } from '../utils/errors';
import { type IDatabaseService, isObjectExistsError } from './DatabaseService';

/**
 * SQL migration runner.
 *
 * Discovers `NNN_name.sql` files, applies the pending ones in filename order,
 * and records each in `schema_migrations` so re-runs are no-ops.
 *
 * Notes on MySQL semantics:
 *   * DDL causes an implicit commit, so a migration cannot be rolled back as a
 *     unit. Statements are therefore applied one at a time and a failure aborts
 *     the run immediately, leaving earlier migrations recorded and the failing
 *     one unrecorded — the state a human needs in order to fix it.
 *   * Applied files are checksummed. Editing a migration that already ran is a
 *     hard error rather than silent drift.
 */
export interface MigrationFile {
  /** Filename without extension, e.g. `001_initial_schema`. */
  readonly name: string;
  readonly fileName: string;
  readonly sql: string;
  readonly checksum: string;
}

export interface AppliedMigration {
  readonly name: string;
  readonly checksum: string;
  readonly executedAt: string;
  readonly executionTimeMs: number;
}

export interface MigrationStatus {
  readonly name: string;
  readonly applied: boolean;
  readonly executedAt: string | undefined;
}

export interface MigrationOutcome {
  readonly name: string;
  readonly statements: number;
  /** Statements whose object already existed (partially applied re-run). */
  readonly skipped: number;
  readonly durationMs: number;
}

const MIGRATIONS_TABLE = 'schema_migrations';

const CREATE_MIGRATIONS_TABLE = `
CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
    "id" SERIAL PRIMARY KEY,
    "name" VARCHAR(191) NOT NULL UNIQUE,
    "checksum" CHAR(64) NOT NULL,
    "executionTimeMs" INT NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;

export class MigrationRunner {
  private readonly migrationsDirectory: string;

  /**
   * @param database Connected database service.
   * @param logger   Logger for migration progress.
   * @param migrationsDirectory Defaults to the `migrations` folder shipped next
   *   to this file, which resolves correctly both from `src` and from `dist`.
   */
  public constructor(
    private readonly database: IDatabaseService,
    private readonly logger: ILogger,
    migrationsDirectory?: string,
  ) {
    this.migrationsDirectory = migrationsDirectory ?? join(__dirname, 'migrations');
  }

  /** Applies every pending migration in order. */
  public async run(): Promise<MigrationOutcome[]> {
    await this.ensureMigrationsTable();

    const [available, applied] = await Promise.all([this.discover(), this.getApplied()]);
    this.assertNoDrift(available, applied);

    const appliedNames = new Set(applied.map((migration) => migration.name));
    const pending = available.filter((migration) => !appliedNames.has(migration.name));

    if (pending.length === 0) {
      this.logger.info('Database schema is up to date', { applied: applied.length });
      return [];
    }

    const outcomes: MigrationOutcome[] = [];

    for (const migration of pending) {
      outcomes.push(await this.apply(migration));
    }

    this.logger.info('Migrations applied', { count: outcomes.length });
    return outcomes;
  }

  /** Reports applied and pending migrations without changing anything. */
  public async status(): Promise<MigrationStatus[]> {
    await this.ensureMigrationsTable();

    const [available, applied] = await Promise.all([this.discover(), this.getApplied()]);
    const byName = new Map(applied.map((migration) => [migration.name, migration]));

    return available.map((migration) => ({
      name: migration.name,
      applied: byName.has(migration.name),
      executedAt: byName.get(migration.name)?.executedAt,
    }));
  }

  /** Reads and checksums every `.sql` file, sorted by filename. */
  public async discover(): Promise<MigrationFile[]> {
    let entries: string[];

    try {
      entries = await readdir(this.migrationsDirectory);
    } catch (error) {
      throw new DatabaseError(
        `Migrations directory not found: ${this.migrationsDirectory}`,
        { directory: this.migrationsDirectory },
        error,
      );
    }

    const fileNames = entries.filter((entry) => entry.endsWith('.sql')).sort();

    return Promise.all(
      fileNames.map(async (fileName) => {
        const sql = await readFile(join(this.migrationsDirectory, fileName), 'utf8');

        return {
          name: fileName.replace(/\.sql$/, ''),
          fileName,
          sql,
          checksum: createHash('sha256').update(normalizeForChecksum(sql)).digest('hex'),
        };
      }),
    );
  }

  /** Rows currently recorded in `schema_migrations`. */
  public async getApplied(): Promise<AppliedMigration[]> {
    return this.database.query<AppliedMigration>(
      `SELECT \`name\`, \`checksum\`, \`executedAt\`, \`executionTimeMs\`
         FROM \`${MIGRATIONS_TABLE}\`
        ORDER BY \`name\` ASC`,
    );
  }

  private async ensureMigrationsTable(): Promise<void> {
    await this.database.executeDdl(CREATE_MIGRATIONS_TABLE);
  }

  /** Fails when a migration that already ran has been edited since. */
  private assertNoDrift(available: MigrationFile[], applied: AppliedMigration[]): void {
    const byName = new Map(available.map((migration) => [migration.name, migration]));

    for (const record of applied) {
      const migration = byName.get(record.name);

      if (migration !== undefined && migration.checksum !== record.checksum) {
        throw new DatabaseError(
          `Migration ${record.name} was modified after it was applied. ` +
            'Create a new migration instead of editing an applied one.',
          { migration: record.name },
        );
      }
    }
  }

  private async apply(migration: MigrationFile): Promise<MigrationOutcome> {
    const statements = splitStatements(migration.sql);
    const startedAt = Date.now();

    this.logger.info('Applying migration', {
      migration: migration.name,
      statements: statements.length,
    });

    let skipped = 0;

    for (const [index, statement] of statements.entries()) {
      try {
        await this.database.executeDdl(statement);
      } catch (error) {
        // MySQL commits each DDL statement, so an interrupted migration leaves
        // some objects behind. Re-running must converge rather than dead-end on
        // the first object that already exists.
        if (isObjectExistsError(error)) {
          skipped += 1;
          this.logger.warn('Skipping statement, object already exists', {
            migration: migration.name,
            statement: index + 1,
          });
          continue;
        }

        throw new DatabaseError(
          `Migration ${migration.name} failed at statement ${String(index + 1)} of ${String(statements.length)}`,
          { migration: migration.name, statement: index + 1 },
          error,
        );
      }
    }

    const durationMs = Date.now() - startedAt;

    await this.database.execute(
      `INSERT INTO \`${MIGRATIONS_TABLE}\` (\`name\`, \`checksum\`, \`executionTimeMs\`)
       VALUES (?, ?, ?)`,
      [migration.name, migration.checksum, durationMs],
    );

    this.logger.info('Migration applied', { migration: migration.name, durationMs, skipped });

    return { name: migration.name, statements: statements.length, skipped, durationMs };
  }
}

/**
 * Splits a migration file into executable statements.
 *
 * Comment lines are dropped first so that a `;` inside a comment cannot split a
 * statement. String literals in these files never contain semicolons.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

/** Normalises line endings so a checksum survives a git checkout on Windows. */
function normalizeForChecksum(sql: string): string {
  return sql.replace(/\r\n/g, '\n').trimEnd();
}
