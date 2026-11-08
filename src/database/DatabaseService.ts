import pg, { type Pool, type PoolClient, type QueryResult } from 'pg';

import type { DatabaseConfig } from '../config/config';
import { type ILogger, LogEvent } from '../logger';
import { AppError, DatabaseError } from '../utils/errors';
import { sleep } from '../utils/time';
import { parseDatabaseUrl } from './url';

// Setup pg type parsers to match application row shapes
// Return timestamps/dates as strings so timezone is preserved
pg.types.setTypeParser(1114, (str: string) => str);
pg.types.setTypeParser(1184, (str: string) => str);
pg.types.setTypeParser(1082, (str: string) => str);
// Preserve decimal as string
pg.types.setTypeParser(1700, (val: string) => val);
// Convert bigint IDs (type 20) to numbers
pg.types.setTypeParser(20, (val: string) => Number(val));

/** Values accepted as prepared-statement parameters. */
export type SqlParameter = string | number | boolean | Date | Buffer | null;

/** Either the pool (auto-managed connection) or an explicit transaction handle. */
export type SqlExecutor = Pool | PoolClient;

export interface ExecutionResult {
  readonly affectedRows: number;
  readonly insertId: number;
}

/** Kept for compatibility with existing service calls. */
export type ResultSetHeader = ExecutionResult;

export interface IDatabaseService {
  /** Creates the pool and verifies the server is reachable. Idempotent. */
  initialize(): Promise<void>;
  /**
   * Runs a SELECT and returns typed rows.
   */
  query<T extends object>(
    sql: string,
    parameters?: readonly SqlParameter[],
    executor?: SqlExecutor,
  ): Promise<T[]>;
  /** Runs a SELECT expected to match at most one row. */
  queryOne<T extends object>(
    sql: string,
    parameters?: readonly SqlParameter[],
    executor?: SqlExecutor,
  ): Promise<T | null>;
  /** Runs an INSERT/UPDATE/DELETE and returns affected rows and insert id. */
  execute(
    sql: string,
    parameters?: readonly SqlParameter[],
    executor?: SqlExecutor,
  ): Promise<ExecutionResult>;
  /** Runs `work` inside a transaction, committing on success and rolling back on error. */
  transaction<T>(work: (connection: PoolClient) => Promise<T>): Promise<T>;
  /** `true` when a `SELECT 1` round-trip succeeds. */
  healthCheck(): Promise<boolean>;
  /** Closes the pool. Safe to call when never initialised. */
  shutdown(): Promise<void>;
  /** The underlying pool. Reserved for the migration runner. */
  getPool(): Pool;
  /**
   * Executes a statement without parameters (DDL).
   */
  executeDdl(sql: string, executor?: SqlExecutor): Promise<void>;
}

/** Error codes that a retry can plausibly fix. */
const TRANSIENT_ERROR_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_CON_COUNT_ERROR',
  'PROTOCOL_SEQUENCE_TIMEOUT',
  // PostgreSQL error codes
  '40001', // serialization_failure / deadlock
  '40P01', // deadlock_detected
  '57P01', // admin_shutdown
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
]);

/** Schema objects that already exist. */
const OBJECT_EXISTS_ERROR_CODES = new Set([
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_KEYNAME',
  'ER_DUP_FIELDNAME',
  'ER_FK_DUP_NAME',
  'ER_DUP_INDEX',
  // PostgreSQL error codes
  '42P07', // duplicate_table
  '42710', // duplicate_object
  '42701', // duplicate_column
  '23505', // unique_violation
]);

/**
 * Reads the driver error code, following the `cause` chain.
 */
export function findErrorCode(error: unknown): string | undefined {
  let current: unknown = error;

  for (let depth = 0; depth < 5 && typeof current === 'object' && current !== null; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };

    if (typeof code === 'string' && !(current instanceof AppError)) {
      return code;
    }

    current = cause;
  }

  return undefined;
}

/** `true` when the failure is a dropped connection or a lock conflict. */
export function isTransientDatabaseError(error: unknown): boolean {
  const code = findErrorCode(error);
  return code !== undefined && TRANSIENT_ERROR_CODES.has(code);
}

/** `true` when the statement failed only because its object already exists. */
export function isObjectExistsError(error: unknown): boolean {
  const code = findErrorCode(error);
  return code !== undefined && OBJECT_EXISTS_ERROR_CODES.has(code);
}

/**
 * Formats MySQL-style queries (backticks and `?` placeholders) into
 * PostgreSQL-compatible queries with double quotes and `$1, $2, ...`.
 */
export function formatPostgresSql(sql: string): string {
  let paramIndex = 1;
  let inSingleQuote = false;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'") {
      if (sql[i - 1] !== '\\') {
        inSingleQuote = !inSingleQuote;
      }
      result += char;
    } else if (char === '`') {
      result += inSingleQuote ? '`' : '"';
    } else if (char === '?' && !inSingleQuote) {
      result += `$${String(paramIndex++)}`;
    } else {
      result += char;
    }
  }

  return result;
}

export class DatabaseService implements IDatabaseService {
  private pool: Pool | undefined;
  private initialized = false;

  public constructor(
    private readonly config: DatabaseConfig,
    private readonly logger: ILogger,
  ) {}

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const pool = this.ensurePool();

    try {
      const client = await pool.connect();
      client.release();
    } catch (error) {
      const parsed = parseDatabaseUrl(this.config.url);
      throw new DatabaseError(
        `Could not connect to Supabase/PostgreSQL: ${error instanceof Error ? error.message : String(error)}`,
        { host: parsed.host },
        error,
      );
    }

    this.initialized = true;
    const parsed = parseDatabaseUrl(this.config.url);
    this.logger.event(LogEvent.DATABASE_CONNECTED, 'Database connection pool ready', {
      database: parsed.database,
      host: parsed.host,
      connectionLimit: this.config.connectionLimit,
    });
  }

  public getPool(): Pool {
    return this.ensurePool();
  }

  public async query<T extends object>(
    sql: string,
    parameters: readonly SqlParameter[] = [],
    executor?: SqlExecutor,
  ): Promise<T[]> {
    const formattedSql = formatPostgresSql(sql);
    return this.withRetry(sql, async () => {
      const target = executor ?? this.ensurePool();
      const result: QueryResult = await target.query(formattedSql, [...parameters]);
      return result.rows as unknown as T[];
    });
  }

  public async queryOne<T extends object>(
    sql: string,
    parameters: readonly SqlParameter[] = [],
    executor?: SqlExecutor,
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, parameters, executor);
    return rows[0] ?? null;
  }

  public async execute(
    sql: string,
    parameters: readonly SqlParameter[] = [],
    executor?: SqlExecutor,
  ): Promise<ExecutionResult> {
    let formattedSql = formatPostgresSql(sql);

    // If an INSERT statement does not have RETURNING, automatically append RETURNING "id"
    const isInsert = /^\s*INSERT\s+INTO\b/i.test(formattedSql);
    const hasReturning = /\bRETURNING\b/i.test(formattedSql);
    if (isInsert && !hasReturning) {
      formattedSql = `${formattedSql} RETURNING "id"`;
    }

    return this.withRetry(sql, async () => {
      const target = executor ?? this.ensurePool();
      const result: QueryResult = await target.query(formattedSql, [...parameters]);
      const row = result.rows[0] as { id?: unknown } | undefined;
      const insertId = row?.id !== undefined ? Number(row.id) : 0;
      return {
        affectedRows: result.rowCount ?? 0,
        insertId,
      };
    });
  }

  public async executeDdl(sql: string, executor?: SqlExecutor): Promise<void> {
    const target = executor ?? this.ensurePool();
    const formattedSql = formatPostgresSql(sql);
    const startedAt = Date.now();

    try {
      await target.query(formattedSql);
      this.traceQuery(sql, Date.now() - startedAt);
    } catch (error) {
      throw new DatabaseError('DDL statement failed', { sql: summarize(sql) }, error);
    }
  }

  /**
   * Runs `work` in a transaction on a dedicated client connection.
   */
  public async transaction<T>(work: (connection: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.ensurePool().connect();

    try {
      await client.query('BEGIN');

      try {
        const result = await work(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error instanceof DatabaseError
          ? error
          : new DatabaseError('Transaction rolled back', {}, error);
      }
    } finally {
      client.release();
    }
  }

  public async healthCheck(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.warn('Database health check failed', {
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  public async shutdown(): Promise<void> {
    const pool = this.pool;
    if (pool === undefined) {
      return;
    }

    this.pool = undefined;
    this.initialized = false;

    await pool.end();
    this.logger.event(LogEvent.DATABASE_DISCONNECTED, 'Database connection pool closed');
  }

  private ensurePool(): Pool {
    this.pool ??= new pg.Pool(this.buildPoolOptions());
    return this.pool;
  }

  private buildPoolOptions(): pg.PoolConfig {
    const connection = parseDatabaseUrl(this.config.url);

    return {
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password,
      database: connection.database,
      max: this.config.connectionLimit,
      connectionTimeoutMillis: this.config.connectTimeoutMs,
      idleTimeoutMillis: this.config.idleTimeoutMs,
      ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
    };
  }

  private async withRetry<T>(sql: string, operation: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    const startedAt = Date.now();

    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt += 1) {
      try {
        const result = await operation();
        this.traceQuery(sql, Date.now() - startedAt);
        return result;
      } catch (error) {
        lastError = error;

        if (attempt >= this.config.retryAttempts || !isTransientDatabaseError(error)) {
          break;
        }

        const delay = this.config.retryDelayMs * 2 ** attempt;
        this.logger.warn('Transient database error, retrying', {
          attempt: attempt + 1,
          maxAttempts: this.config.retryAttempts,
          delayMs: delay,
          error: error instanceof Error ? error.message : String(error),
        });

        await sleep(delay);
      }
    }

    throw new DatabaseError(
      'Database query failed',
      {
        sql: summarize(sql),
        code: findErrorCode(lastError),
      },
      lastError,
    );
  }

  private traceQuery(sql: string, durationMs: number): void {
    if (durationMs >= this.config.slowQueryMs) {
      this.logger.warn('Slow database query', {
        sql: summarize(sql),
        durationMs,
        thresholdMs: this.config.slowQueryMs,
      });
      return;
    }

    if (this.config.logQueries) {
      this.logger.debug('SQL query executed', {
        sql: summarize(sql),
        durationMs,
      });
    }
  }
}

function summarize(sql: string): string {
  const flattened = sql.replace(/\s+/g, ' ').trim();
  return flattened.length > 200 ? `${flattened.slice(0, 197)}...` : flattened;
}
