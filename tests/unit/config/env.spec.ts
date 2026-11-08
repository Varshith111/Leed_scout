import { parseEnv } from '../../../src/config/env';
import { ConfigurationError } from '../../../src/utils/errors';
import { createTestEnv } from '../../helpers/env';

describe('parseEnv', () => {
  it('applies documented defaults when optional variables are absent', () => {
    const env = parseEnv(createTestEnv());

    expect(env.NODE_ENV).toBe('test');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.SCRAPER_WORKERS).toBe(4);
    expect(env.SCRAPER_HEADLESS).toBe(true);
    expect(env.SCRAPER_BROWSER_TYPE).toBe('chromium');
    expect(env.SCRAPER_TIMEOUT_MS).toBe(30_000);
    expect(env.PROXY_ENABLED).toBe(false);
    expect(env.PROXY_URLS).toEqual([]);
    expect(env.VERIFICATION_CONCURRENCY).toBe(5);
  });

  it('treats empty strings as absent values', () => {
    const env = parseEnv(createTestEnv({ SCRAPER_WORKERS: '', LOG_LEVEL: '   ' }));

    expect(env.SCRAPER_WORKERS).toBe(4);
    expect(env.LOG_LEVEL).toBe('info');
  });

  it.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    ['false', false],
    ['0', false],
    ['no', false],
    ['off', false],
  ])('parses SCRAPER_HEADLESS=%s as %s', (raw, expected) => {
    expect(parseEnv(createTestEnv({ SCRAPER_HEADLESS: raw })).SCRAPER_HEADLESS).toBe(expected);
  });

  it('parses a comma separated proxy list and trims entries', () => {
    const env = parseEnv(
      createTestEnv({
        PROXY_ENABLED: 'true',
        PROXY_URLS: ' http://a:1 , http://b:2 ,, ',
      }),
    );

    expect(env.PROXY_URLS).toEqual(['http://a:1', 'http://b:2']);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseEnv(createTestEnv({ DATABASE_URL: undefined }))).toThrow(ConfigurationError);
  });

  it('rejects a non-MySQL DATABASE_URL', () => {
    const act = (): unknown =>
      parseEnv(createTestEnv({ DATABASE_URL: 'postgres://localhost:5432/leadscout' }));

    expect(act).toThrow(/mysql:\/\//);
  });

  it('rejects a non-boolean flag', () => {
    expect(() => parseEnv(createTestEnv({ SCRAPER_HEADLESS: 'maybe' }))).toThrow(
      /expected a boolean/,
    );
  });

  it('rejects a non-integer numeric value', () => {
    expect(() => parseEnv(createTestEnv({ SCRAPER_WORKERS: '2.5' }))).toThrow(
      /expected an integer/,
    );
  });

  it('rejects a numeric value outside the allowed range', () => {
    expect(() => parseEnv(createTestEnv({ SCRAPER_WORKERS: '99' }))).toThrow(/between 1 and 32/);
  });

  it('rejects an unsupported browser type', () => {
    expect(() => parseEnv(createTestEnv({ SCRAPER_BROWSER_TYPE: 'internet-explorer' }))).toThrow(
      /chromium, firefox, webkit/,
    );
  });

  it('requires at least one proxy URL when the proxy is enabled', () => {
    expect(() => parseEnv(createTestEnv({ PROXY_ENABLED: 'true' }))).toThrow(
      /at least one proxy URL/,
    );
  });

  it('reports every validation failure in a single error', () => {
    let message = '';
    try {
      parseEnv(createTestEnv({ SCRAPER_WORKERS: '0', SCRAPER_HEADLESS: 'nope' }));
    } catch (error) {
      message = (error as ConfigurationError).message;
    }

    expect(message).toContain('SCRAPER_WORKERS');
    expect(message).toContain('SCRAPER_HEADLESS');
  });
});
