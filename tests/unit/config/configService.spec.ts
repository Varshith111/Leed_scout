import { isAbsolute } from 'node:path';

import { ConfigService, redactUrlCredentials } from '../../../src/config/config';
import { createTestEnv } from '../../helpers/env';

describe('ConfigService', () => {
  it('builds an immutable, fully resolved configuration tree', () => {
    const config = new ConfigService(createTestEnv({ SCRAPER_WORKERS: '8' })).get();

    expect(config.env).toBe('test');
    expect(config.isTest).toBe(true);
    expect(config.isProduction).toBe(false);
    expect(config.scraper.workers).toBe(8);
    expect(isAbsolute(config.paths.output)).toBe(true);
    expect(isAbsolute(config.paths.screenshots)).toBe(true);
  });

  it('resolves absolute directory overrides as-is', () => {
    const absolute = process.platform === 'win32' ? 'C:\\leadscout-out' : '/var/leadscout-out';
    const config = new ConfigService(createTestEnv({ OUTPUT_DIR: absolute })).get();

    expect(config.paths.output).toBe(absolute);
  });

  it('exposes the runtime-overridable subset', () => {
    const service = new ConfigService(createTestEnv({ SCRAPER_RETRY_COUNT: '5' }));

    expect(service.getRuntimeSettings()).toEqual({
      workers: 4,
      headless: true,
      browserType: 'chromium',
      retryCount: 5,
      timeoutMs: 30_000,
      rateLimitPerMinute: 60,
      proxyEnabled: false,
      screenshotsEnabled: true,
    });
  });

  it('applies sparse runtime overrides without touching other values', () => {
    const service = new ConfigService(createTestEnv());

    const updated = service.applyRuntimeSettings({ workers: 12, headless: false });

    expect(updated.scraper.workers).toBe(12);
    expect(updated.scraper.headless).toBe(false);
    expect(updated.scraper.retryCount).toBe(3);
    expect(updated.proxy.enabled).toBe(false);
    expect(service.get()).toBe(updated);
  });

  it('ignores undefined properties in an override patch', () => {
    const service = new ConfigService(createTestEnv({ SCRAPER_WORKERS: '6' }));

    service.applyRuntimeSettings({ workers: undefined, proxyEnabled: true });

    expect(service.get().scraper.workers).toBe(6);
    expect(service.get().proxy.enabled).toBe(true);
  });

  it('never exposes secrets in the printable summary', () => {
    const service = new ConfigService(
      createTestEnv({
        DATABASE_URL: 'mysql://admin:sup3rs3cret@db.internal:3306/leadscout',
        PROXY_ENABLED: 'true',
        PROXY_URLS: 'http://user:pass@proxy.internal:8080',
        PROXY_PASSWORD: 'proxy-secret',
      }),
    );

    const summary = JSON.stringify(service.describe());

    expect(summary).not.toContain('sup3rs3cret');
    expect(summary).not.toContain('proxy-secret');
    expect(summary).not.toContain('pass@');
    expect(summary).toContain('mysql://admin:********@db.internal:3306/leadscout');
  });
});

describe('redactUrlCredentials', () => {
  it('masks the password of a credentialed URL', () => {
    expect(redactUrlCredentials('mysql://root:pw@localhost:3306/db')).toBe(
      'mysql://root:********@localhost:3306/db',
    );
  });

  it('leaves URLs without credentials untouched', () => {
    expect(redactUrlCredentials('http://proxy.internal:8080')).toBe('http://proxy.internal:8080');
  });
});
