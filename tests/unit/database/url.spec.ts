import {
  getDatabaseName,
  parseMysqlUrl,
  resolveTestDatabaseUrl,
  withDatabaseName,
} from '../../../src/database/url';
import { ConfigurationError } from '../../../src/utils/errors';

describe('parseMysqlUrl', () => {
  it('parses host, port, credentials and database', () => {
    expect(parseMysqlUrl('mysql://root:secret@db.internal:3307/leadscout')).toEqual({
      host: 'db.internal',
      port: 3307,
      user: 'root',
      password: 'secret',
      database: 'leadscout',
    });
  });

  it('defaults to port 3306', () => {
    expect(parseMysqlUrl('mysql://root:secret@localhost/leadscout').port).toBe(3306);
  });

  it('percent-decodes credentials so passwords may contain "@"', () => {
    const parsed = parseMysqlUrl('mysql://root:Varshith%40123@localhost:3306/leadscout');

    expect(parsed.password).toBe('Varshith@123');
    expect(parsed.host).toBe('localhost');
    expect(parsed.database).toBe('leadscout');
  });

  it('percent-decodes other reserved characters', () => {
    expect(parseMysqlUrl('mysql://user%40corp:p%3Aw%2Fd@localhost/db')).toMatchObject({
      user: 'user@corp',
      password: 'p:w/d',
    });
  });

  it('rejects a non-MySQL protocol', () => {
    expect(() => parseMysqlUrl('postgres://localhost:5432/leadscout')).toThrow(ConfigurationError);
  });

  it('rejects a missing database name', () => {
    expect(() => parseMysqlUrl('mysql://root:secret@localhost:3306/')).toThrow(/database name/);
  });

  it('rejects a malformed URL', () => {
    expect(() => parseMysqlUrl('not-a-url')).toThrow(ConfigurationError);
  });
});

describe('getDatabaseName', () => {
  it('returns the database segment', () => {
    expect(getDatabaseName('mysql://root@localhost:3306/leadscout')).toBe('leadscout');
  });
});

describe('withDatabaseName', () => {
  it('swaps the database, preserving credentials and host', () => {
    const swapped = withDatabaseName(
      'mysql://root:Varshith%40123@localhost:3306/leadscout',
      'other',
    );

    expect(getDatabaseName(swapped)).toBe('other');
    expect(parseMysqlUrl(swapped).password).toBe('Varshith@123');
  });
});

describe('resolveTestDatabaseUrl', () => {
  it('prefers an explicit test URL', () => {
    const resolved = resolveTestDatabaseUrl(
      'mysql://root@localhost/leadscout',
      'mysql://root@localhost/custom_test',
    );

    expect(resolved).toBe('mysql://root@localhost/custom_test');
  });

  it('derives the test database by suffixing the name', () => {
    const resolved = resolveTestDatabaseUrl('mysql://root@localhost:3306/leadscout');

    expect(getDatabaseName(resolved ?? '')).toBe('leadscout_test');
  });

  it('leaves an already-suffixed database untouched', () => {
    const url = 'mysql://root@localhost:3306/leadscout_test';

    expect(resolveTestDatabaseUrl(url)).toBe(url);
  });

  it('returns undefined without a base URL', () => {
    expect(resolveTestDatabaseUrl(undefined)).toBeUndefined();
    expect(resolveTestDatabaseUrl('')).toBeUndefined();
  });
});
