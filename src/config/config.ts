import { type BrowserType, Environment, type LogLevel } from '../models/enums';
import { type Env, parseEnv } from './env';
import { resolveFromRoot } from './paths';

/**
 * Typed application configuration.
 *
 * Configuration is layered, lowest precedence first:
 *
 *   1. schema defaults (src/config/env.ts)
 *   2. environment variables / `.env`
 *   3. persisted settings from the `Settings` table (Phase 2)
 *   4. per-invocation CLI flags (Phase 3)
 *
 * Layers 3 and 4 are applied through {@link ConfigService.applyRuntimeSettings},
 * which is the single mutation point of the whole configuration system.
 */

export interface DatabaseConfig {
  readonly url: string;
  /** Maximum simultaneous MySQL connections held by the pool. */
  readonly connectionLimit: number;
  /** Queued acquisition requests allowed; `0` means unlimited. */
  readonly queueLimit: number;
  /** TCP connect timeout in milliseconds. */
  readonly connectTimeoutMs: number;
  /** Idle connections are released after this many milliseconds. */
  readonly idleTimeoutMs: number;
  /** Retries for transient connection failures (lost connection, reset). */
  readonly retryAttempts: number;
  /** Base delay between retries in milliseconds. */
  readonly retryDelayMs: number;
  /** Statements slower than this are logged at warn level. */
  readonly slowQueryMs: number;
  /** Emit every SQL statement at debug level. */
  readonly logQueries: boolean;
}

export interface LoggingConfig {
  readonly level: LogLevel;
  readonly toFile: boolean;
  readonly directory: string;
}

export interface PathsConfig {
  readonly root: string;
  readonly output: string;
  readonly logs: string;
  readonly screenshots: string;
}

export interface ScraperConfig {
  readonly workers: number;
  readonly headless: boolean;
  readonly browserType: BrowserType;
  readonly retryCount: number;
  readonly timeoutMs: number;
  readonly navigationTimeoutMs: number;
  readonly rateLimitPerMinute: number;
  readonly scrollDelayMs: number;
  readonly maxScrolls: number;
  readonly screenshotsEnabled: boolean;
}

export interface ProxyConfig {
  readonly enabled: boolean;
  readonly urls: readonly string[];
  readonly username: string | undefined;
  readonly password: string | undefined;
}

export interface VerificationConfig {
  readonly concurrency: number;
  readonly timeoutMs: number;
  readonly maxSearchResults: number;
  readonly userAgent: string;
}

export interface AppConfig {
  readonly env: Environment;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly database: DatabaseConfig;
  readonly logging: LoggingConfig;
  readonly paths: PathsConfig;
  readonly scraper: ScraperConfig;
  readonly proxy: ProxyConfig;
  readonly verification: VerificationConfig;
}

/**
 * The subset of configuration that can be overridden at runtime.
 *
 * Mirrors the columns of the `Settings` table and the flags accepted by
 * `leadscout config`.
 */
export interface RuntimeSettings {
  readonly workers: number;
  readonly headless: boolean;
  readonly browserType: BrowserType;
  readonly retryCount: number;
  readonly timeoutMs: number;
  readonly rateLimitPerMinute: number;
  readonly proxyEnabled: boolean;
  readonly screenshotsEnabled: boolean;
}

/**
 * A sparse patch of {@link RuntimeSettings}. Explicit `| undefined` members let
 * callers pass optional CLI flags straight through without pre-filtering them.
 */
export type RuntimeSettingsPatch = {
  readonly [K in keyof RuntimeSettings]?: RuntimeSettings[K] | undefined;
};

/** Section → key → display value. Consumed by the `config` CLI command. */
export type ConfigSummary = Readonly<Record<string, Readonly<Record<string, string>>>>;

/** Builds the immutable configuration tree from validated environment values. */
export function buildConfig(env: Env): AppConfig {
  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === Environment.PRODUCTION,
    isTest: env.NODE_ENV === Environment.TEST,
    database: {
      url: env.DATABASE_URL,
      connectionLimit: env.DATABASE_CONNECTION_LIMIT,
      queueLimit: env.DATABASE_QUEUE_LIMIT,
      connectTimeoutMs: env.DATABASE_CONNECT_TIMEOUT_MS,
      idleTimeoutMs: env.DATABASE_IDLE_TIMEOUT_MS,
      retryAttempts: env.DATABASE_RETRY_ATTEMPTS,
      retryDelayMs: env.DATABASE_RETRY_DELAY_MS,
      slowQueryMs: env.DATABASE_SLOW_QUERY_MS,
      logQueries: env.DATABASE_LOG_QUERIES,
    },
    logging: {
      level: env.LOG_LEVEL,
      toFile: env.LOG_TO_FILE,
      directory: resolveFromRoot(env.LOG_DIR),
    },
    paths: {
      root: resolveFromRoot('.'),
      output: resolveFromRoot(env.OUTPUT_DIR),
      logs: resolveFromRoot(env.LOG_DIR),
      screenshots: resolveFromRoot(env.SCREENSHOT_DIR),
    },
    scraper: {
      workers: env.SCRAPER_WORKERS,
      headless: env.SCRAPER_HEADLESS,
      browserType: env.SCRAPER_BROWSER_TYPE,
      retryCount: env.SCRAPER_RETRY_COUNT,
      timeoutMs: env.SCRAPER_TIMEOUT_MS,
      navigationTimeoutMs: env.SCRAPER_NAVIGATION_TIMEOUT_MS,
      rateLimitPerMinute: env.SCRAPER_RATE_LIMIT_PER_MINUTE,
      scrollDelayMs: env.SCRAPER_SCROLL_DELAY_MS,
      maxScrolls: env.SCRAPER_MAX_SCROLLS,
      screenshotsEnabled: env.SCREENSHOTS_ENABLED,
    },
    proxy: {
      enabled: env.PROXY_ENABLED,
      urls: env.PROXY_URLS,
      username: env.PROXY_USERNAME,
      password: env.PROXY_PASSWORD,
    },
    verification: {
      concurrency: env.VERIFICATION_CONCURRENCY,
      timeoutMs: env.VERIFICATION_TIMEOUT_MS,
      maxSearchResults: env.VERIFICATION_MAX_SEARCH_RESULTS,
      userAgent: env.VERIFICATION_USER_AGENT,
    },
  };
}

/**
 * Owns the application configuration.
 *
 * Injected into services and repositories; never imported as a global by
 * business logic, which keeps every consumer trivially testable.
 */
export class ConfigService {
  private current: AppConfig;

  public constructor(source: NodeJS.ProcessEnv = process.env) {
    this.current = buildConfig(parseEnv(source));
  }

  /** The current, fully resolved configuration. */
  public get(): AppConfig {
    return this.current;
  }

  /** The runtime-overridable subset, as currently resolved. */
  public getRuntimeSettings(): RuntimeSettings {
    const { scraper, proxy } = this.current;

    return {
      workers: scraper.workers,
      headless: scraper.headless,
      browserType: scraper.browserType,
      retryCount: scraper.retryCount,
      timeoutMs: scraper.timeoutMs,
      rateLimitPerMinute: scraper.rateLimitPerMinute,
      proxyEnabled: proxy.enabled,
      screenshotsEnabled: scraper.screenshotsEnabled,
    };
  }

  /**
   * Applies persisted settings or CLI flags on top of the environment layer.
   * Undefined properties are ignored, so callers can pass sparse patches.
   */
  public applyRuntimeSettings(overrides: RuntimeSettingsPatch): AppConfig {
    const { scraper, proxy } = this.current;

    this.current = {
      ...this.current,
      scraper: {
        ...scraper,
        workers: overrides.workers ?? scraper.workers,
        headless: overrides.headless ?? scraper.headless,
        browserType: overrides.browserType ?? scraper.browserType,
        retryCount: overrides.retryCount ?? scraper.retryCount,
        timeoutMs: overrides.timeoutMs ?? scraper.timeoutMs,
        rateLimitPerMinute: overrides.rateLimitPerMinute ?? scraper.rateLimitPerMinute,
        screenshotsEnabled: overrides.screenshotsEnabled ?? scraper.screenshotsEnabled,
      },
      proxy: {
        ...proxy,
        enabled: overrides.proxyEnabled ?? proxy.enabled,
      },
    };

    return this.current;
  }

  /** Human-readable, secret-free view of the configuration. */
  public describe(): ConfigSummary {
    const { logging, paths, scraper, proxy, verification } = this.current;

    return {
      Application: {
        environment: this.current.env,
      },
      Database: {
        url: redactUrlCredentials(this.current.database.url),
        connectionLimit: String(this.current.database.connectionLimit),
        queueLimit: String(this.current.database.queueLimit),
        connectTimeoutMs: String(this.current.database.connectTimeoutMs),
        idleTimeoutMs: String(this.current.database.idleTimeoutMs),
        retryAttempts: String(this.current.database.retryAttempts),
        retryDelayMs: String(this.current.database.retryDelayMs),
        slowQueryMs: String(this.current.database.slowQueryMs),
        logQueries: String(this.current.database.logQueries),
      },
      Logging: {
        level: logging.level,
        toFile: String(logging.toFile),
        directory: logging.directory,
      },
      Paths: {
        root: paths.root,
        output: paths.output,
        logs: paths.logs,
        screenshots: paths.screenshots,
      },
      Scraper: {
        workers: String(scraper.workers),
        headless: String(scraper.headless),
        browserType: scraper.browserType,
        retryCount: String(scraper.retryCount),
        timeoutMs: String(scraper.timeoutMs),
        navigationTimeoutMs: String(scraper.navigationTimeoutMs),
        rateLimitPerMinute: String(scraper.rateLimitPerMinute),
        scrollDelayMs: String(scraper.scrollDelayMs),
        maxScrolls: String(scraper.maxScrolls),
        screenshotsEnabled: String(scraper.screenshotsEnabled),
      },
      Proxy: {
        enabled: String(proxy.enabled),
        urls: proxy.urls.length > 0 ? proxy.urls.map(redactUrlCredentials).join(', ') : '(none)',
        username: proxy.username ?? '(none)',
        password: proxy.password === undefined ? '(none)' : '********',
      },
      Verification: {
        concurrency: String(verification.concurrency),
        timeoutMs: String(verification.timeoutMs),
        maxSearchResults: String(verification.maxSearchResults),
        userAgent: verification.userAgent,
      },
    };
  }
}

/** Replaces the password of a URL with asterisks, tolerating malformed input. */
export function redactUrlCredentials(url: string): string {
  return url.replace(/^([a-zA-Z][\w+.-]*:\/\/)([^:/@\s]+):([^@\s]*)@/, '$1$2:********@');
}

let configService: ConfigService | undefined;

/** Returns the process-wide ConfigService, creating it on first use. */
export function getConfigService(): ConfigService {
  configService ??= new ConfigService();
  return configService;
}

/** Convenience accessor for the resolved configuration. */
export function getConfig(): AppConfig {
  return getConfigService().get();
}

/** Replaces the process-wide instance. Intended for the CLI root and tests. */
export function setConfigService(instance: ConfigService | undefined): void {
  configService = instance;
}
