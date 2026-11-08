import { ConfigurationError } from '../utils/errors';

/**
 * MySQL connection string parsing.
 *
 * The pool is configured with explicit options rather than a raw URL, so the
 * connection string is parsed exactly once, here. Credentials are
 * percent-decoded, which is what makes passwords containing `@`, `:` or `/`
 * (encoded as `%40`, `%3A`, `%2F`) work.
 */
export interface MysqlConnectionParameters {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
}

const DEFAULT_MYSQL_PORT = 3306;

/**
 * Parses a `mysql://user:password@host:port/database` connection string.
 *
 * @throws {ConfigurationError} when the URL is malformed or incomplete.
 */
export function parseMysqlUrl(connectionUrl: string): MysqlConnectionParameters {
  let parsed: URL;

  try {
    parsed = new URL(connectionUrl);
  } catch (error) {
    throw new ConfigurationError('DATABASE_URL is not a valid connection string', {}, error);
  }

  if (parsed.protocol !== 'mysql:') {
    throw new ConfigurationError(
      `Unsupported database protocol "${parsed.protocol}" — LeadScout requires MySQL 8+`,
      { protocol: parsed.protocol },
    );
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (database === '') {
    throw new ConfigurationError('DATABASE_URL must include a database name');
  }

  if (parsed.hostname === '') {
    throw new ConfigurationError('DATABASE_URL must include a host');
  }

  return {
    host: decodeURIComponent(parsed.hostname),
    port: parsed.port === '' ? DEFAULT_MYSQL_PORT : Number(parsed.port),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database,
  };
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
