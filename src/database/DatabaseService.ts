import {
  type Pool,
  type PoolConnection,
  type PoolOptions,
  type ResultSetHeader,
  type RowDataPacket,
  createPool,
} from 'mysql2/promise';

import type { DatabaseConfig } from '../config/config';
import { type ILogger, LogEvent } from '../logger';
import { AppError, DatabaseError } from '../utils/errors';
import { sleep } from '../utils/time';
import { parseMysqlUrl } from './url';

/**
 * The single gateway between the application and MySQL.
 *
 * Responsibilities: one connection pool per process, prepared-statement
 * execution, transactions, health checks, transparent recovery from dropped
 * connections, query logging, and graceful shutdown.
 *
 * Services own the SQL they need; this class owns *how* SQL reaches the server.
 * Every parameterised call goes through mysql2's `execute()`, i.e. real
 * server-side prepared statements: values are never interpolated into SQL.
 */

/** Values accepted as prepared-statement parameters. */
export type SqlParameter = string | number | boolean | Date | Buffer | null;

/** Either the pool (auto-managed connection) or an explicit transaction handle. */
export type SqlExecutor = Pool | PoolConnection;

export interface IDatabaseService {
  /** Creates the pool and verifies the server is reachable. Idempotent. */
  initialize(): Promise<void>;
  /**
   * Runs a SELECT and returns typed rows.
   *
   * `T` is a plain domain row type: the mysql2 `RowDataPacket` brand is applied
   * and discarded inside this class so callers stay driver-agnostic.
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
  ): Promise<ResultSetHeader>;
  /** Runs `work` inside a transaction, committing on success and rolling back on error. */
  transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T>;
  /** `true` when a `SELECT 1` round-trip succeeds. */
  healthCheck(): Promise<boolean>;
  /** Closes the pool. Safe to call when never initialised. */
  shutdown(): Promise<void>;
  /** The underlying pool. Reserved for the migration runner. */
  getPool(): Pool;
  /**
   * Executes a statement without parameters (DDL).
   *
   * MySQL cannot prepare every DDL statement, so migrations use this path. It
   * accepts file-sourced SQL only and must never receive user input.
   */
  executeDdl(sql: string, executor?: SqlExecutor): Promise<void>;
}

/** MySQL/driver error codes that a retry can plausibly fix. */
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
]);

/**
 * Schema objects that already exist.
 *
 * MySQL performs an implicit commit per DDL statement, so a migration that
 * fails half way cannot be rolled back. The migration runner uses this to make
 * a re-run converge: statements whose object is already present are treated as
 * satisfied instead of fatal.
 */
const OBJECT_EXISTS_ERROR_CODES = new Set([
  'ER_TABLE_EXISTS_ERROR',
  'ER_DUP_KEYNAME',
  'ER_DUP_FIELDNAME',
  'ER_FK_DUP_NAME',
  'ER_DUP_INDEX',
]);

/**
 * Reads the driver error code, following the `cause` chain.
 *
 * Application errors carry their own `code` (`DATABASE_ERROR`, ...), so those
 * are stepped over: the interesting value is always the MySQL code underneath.
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
      const connection = await pool.getConnection();
      connection.release();
    } catch (error) {
      throw new DatabaseError(
        'Could not connect to MySQL. Check DATABASE_URL and that the server is running.',
        { host: parseMysqlUrl(this.config.url).host },
        error,
      );
    }

    this.initialized = true;
    this.logger.event(LogEvent.DATABASE_CONNECTED, 'MySQL connection pool ready', {
      database: parseMysqlUrl(this.config.url).database,
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
    return this.withRetry(sql, async () => {
      const target = executor ?? this.ensurePool();
      const [rows] = await target.execute<RowDataPacket[]>(sql, [...parameters]);
      return rows as unknown as T[];
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
  ): Promise<ResultSetHeader> {
    return this.withRetry(sql, async () => {
      const target = executor ?? this.ensurePool();
      const [result] = await target.execute<ResultSetHeader>(sql, [...parameters]);
      return result;
    });
  }

  public async executeDdl(sql: string, executor?: SqlExecutor): Promise<void> {
    const target = executor ?? this.ensurePool();
    const startedAt = Date.now();

    try {
      await target.query(sql);
      this.traceQuery(sql, Date.now() - startedAt);
    } catch (error) {
      throw new DatabaseError('DDL statement failed', { sql: summarize(sql) }, error);
    }
  }

  /**
   * Runs `work` in a transaction on a dedicated connection.
   *
   * The connection is always returned to the pool, and a failed rollback never
   * masks the original error.
   */
  public async transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.ensurePool().getConnection();

    try {
      await connection.beginTransaction();

      try {
        const result = await work(connection);
        await connection.commit();
        return result;
      } catch (error) {
        await this.rollbackQuietly(connection);
        throw error instanceof DatabaseError
          ? error
          : new DatabaseError('Transaction rolled back', {}, error);
      }
    } finally {
      connection.release();
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
    this.logger.event(LogEvent.DATABASE_DISCONNECTED, 'MySQL connection pool closed');
  }

  /** Lazily creates the single pool for this process. */
  private ensurePool(): Pool {
    this.pool ??= createPool(this.buildPoolOptions());
    return this.pool;
  }

  private buildPoolOptions(): PoolOptions {
    const connection = parseMysqlUrl(this.config.url);

    return {
      host: connection.host,
      port: connection.port,
      user: connection.user,
      password: connection.password,
      database: connection.database,
      waitForConnections: true,
      connectionLimit: this.config.connectionLimit,
      queueLimit: this.config.queueLimit,
      connectTimeout: this.config.connectTimeoutMs,
      idleTimeout: this.config.idleTimeoutMs,
      maxIdle: this.config.connectionLimit,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10_000,
      // Timestamps are read back as strings and converted by the model helpers,
      // which keeps stored values independent of the process timezone.
      dateStrings: true,
      // Guards against accidental multi-statement injection.
      multipleStatements: false,
      timezone: 'Z',
      charset: 'utf8mb4',
    };
  }

  /**
   * Executes an operation, retrying transient connection failures.
   *
   * mysql2 opens a fresh connection on the next call after one is dropped, so a
   * retry is all that "automatic reconnect" needs to mean here.
   */
  private async withRetry<T>(sql: string, operation: () => Promise<T>): Promise<T> {
    const attempts = this.config.retryAttempts + 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const startedAt = Date.now();

      try {
        const result = await operation();
        this.traceQuery(sql, Date.now() - startedAt);
        return result;
      } catch (error) {
        lastError = error;

        if (!isTransientDatabaseError(error) || attempt === attempts) {
          break;
        }

        const delay = this.config.retryDelayMs * attempt;
        this.logger.event(LogEvent.RETRY, 'Retrying database operation', {
          attempt,
          attempts,
          delayMs: delay,
          code: findErrorCode(error),
          sql: summarize(sql),
        });
        await sleep(delay);
      }
    }

    throw new DatabaseError(
      `Query failed: ${lastError instanceof Error ? lastError.message : 'unknown error'}`,
      { sql: summarize(sql), code: findErrorCode(lastError) },
      lastError,
    );
  }

  private traceQuery(sql: string, durationMs: number): void {
    if (durationMs >= this.config.slowQueryMs) {
      this.logger.warn('Slow query', { durationMs, sql: summarize(sql) });
      return;
    }

    if (this.config.logQueries) {
      this.logger.debug('SQL', { durationMs, sql: summarize(sql) });
    }
  }

  private async rollbackQuietly(connection: PoolConnection): Promise<void> {
    try {
      await connection.rollback();
    } catch (rollbackError) {
      this.logger.error('Transaction rollback failed', rollbackError);
    }
  }
}

const MAX_LOGGED_SQL_LENGTH = 300;

/** Collapses whitespace and truncates SQL so log lines stay readable. */
function summarize(sql: string): string {
  const normalized = sql.replace(/\s+/g, ' ').trim();

  return normalized.length > MAX_LOGGED_SQL_LENGTH
    ? `${normalized.slice(0, MAX_LOGGED_SQL_LENGTH)}...`
    : normalized;
}
