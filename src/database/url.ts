import { ConfigurationError } from '../utils/errors';

/**
 * Database connection string parsing.
 *
 * Supports PostgreSQL (Supabase) and MySQL.
 * Credentials are percent-decoded, which is what makes passwords containing
 * reserved characters (`@`, `:`, `/`) work.
 */
export interface DatabaseConnectionParameters {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly ssl: boolean;
  readonly protocol: string;
}

export type MysqlConnectionParameters = DatabaseConnectionParameters;

export const DEFAULT_POSTGRES_PORT = 5432;
export const DEFAULT_MYSQL_PORT = 3306;

/**
 * Parses a `postgresql://` or `postgres://` or `mysql://` connection string.
 *
 * @throws {ConfigurationError} when the URL is malformed or incomplete.
 */
export function parseDatabaseUrl(connectionUrl: string): DatabaseConnectionParameters {
  let parsed: URL;

  try {
    parsed = new URL(connectionUrl);
  } catch (error) {
    throw new ConfigurationError('DATABASE_URL is not a valid connection string', {}, error);
  }

  const validProtocols = ['postgresql:', 'postgres:', 'mysql:'];
  if (!validProtocols.includes(parsed.protocol)) {
    throw new ConfigurationError(
      `Unsupported database protocol "${parsed.protocol}" — LeadScout supports Supabase (PostgreSQL) and MySQL`,
      { protocol: parsed.protocol },
    );
  }

  const isPostgres = parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
  const defaultPort = isPostgres ? DEFAULT_POSTGRES_PORT : DEFAULT_MYSQL_PORT;

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database === '') {
    throw new ConfigurationError('DATABASE_URL must include a database name');
  }

  if (parsed.hostname === '') {
    throw new ConfigurationError('DATABASE_URL must include a host');
  }

  const sslParam = parsed.searchParams.get('sslmode');
  const isSupabase =
    parsed.hostname.includes('supabase.co') || parsed.hostname.includes('supabase.com');
  const ssl =
    isSupabase ||
    sslParam === 'require' ||
    sslParam === 'verify-full' ||
    sslParam === 'verify-ca' ||
    isPostgres;

  return {
    host: decodeURIComponent(parsed.hostname),
    port: parsed.port === '' ? defaultPort : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
    ssl,
    protocol: parsed.protocol,
  };
}

export function parseMysqlUrl(connectionUrl: string): DatabaseConnectionParameters {
  return parseDatabaseUrl(connectionUrl);
}

/** Returns the database name of a connection string. Used by test safety checks. */
export function getDatabaseName(connectionUrl: string): string {
  return parseMysqlUrl(connectionUrl).database;
}

/** Rebuilds a connection string pointing at a different database. */
export function withDatabaseName(connectionUrl: string, database: string): string {
  const parsed = new URL(connectionUrl);
  parsed.pathname = `/${encodeURIComponent(database)}`;
  return parsed.toString();
}

/** Suffix that marks a database as safe to truncate between integration tests. */
export const TEST_DATABASE_SUFFIX = '_test';

/**
 * Resolves the integration-test connection string.
 *
 * `DATABASE_URL_TEST` wins when set; otherwise the development database name is
 * suffixed with `_test`. Integration tests refuse to run against a database
 * whose name does not end in that suffix, which is what makes "truncate
 * everything between tests" safe.
 */
export function resolveTestDatabaseUrl(
  databaseUrl: string | undefined,
  explicitTestUrl?: string,
): string | undefined {
  if (explicitTestUrl !== undefined && explicitTestUrl !== '') {
    return explicitTestUrl;
  }

  if (databaseUrl === undefined || databaseUrl === '') {
    return undefined;
  }

  const database = getDatabaseName(databaseUrl);

  return database.endsWith(TEST_DATABASE_SUFFIX)
    ? databaseUrl
    : withDatabaseName(databaseUrl, `${database}${TEST_DATABASE_SUFFIX}`);
}
