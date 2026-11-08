import { config as loadDotEnvFile } from 'dotenv';
import { z } from 'zod';

import { BrowserType, Environment, LogLevel, enumValues } from '../models/enums';
import { ConfigurationError } from '../utils/errors';
import { PROJECT_ROOT } from './paths';

/**
 * Environment contract.
 *
 * `process.env` is the only untrusted input the application receives at
 * startup, so it is parsed and validated exactly once, here, with Zod. Every
 * other module consumes the strongly typed {@link AppConfig} built from the
 * result and never touches `process.env` directly.
 */

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

/** Treats missing and empty-string environment variables identically. */
function optionalString(): z.ZodType<string | undefined, string | undefined> {
  return z
    .string()
    .optional()
    .transform((value) => {
      const trimmed = value?.trim();
      return trimmed === undefined || trimmed === '' ? undefined : trimmed;
    });
}

function stringEnv(defaultValue: string): z.ZodType<string, string | undefined> {
  return optionalString().transform((value) => value ?? defaultValue);
}

function booleanEnv(defaultValue: boolean): z.ZodType<boolean, string | undefined> {
  return optionalString().transform((value, ctx) => {
    if (value === undefined) {
      return defaultValue;
    }

    const normalized = value.toLowerCase();
    if (TRUE_VALUES.has(normalized)) {
      return true;
    }
    if (FALSE_VALUES.has(normalized)) {
      return false;
    }

    ctx.addIssue({
      code: 'custom',
      message: `expected a boolean (true/false), received "${value}"`,
    });
    return z.NEVER;
  });
}

function integerEnv(
  defaultValue: number,
  minimum: number,
  maximum: number,
): z.ZodType<number, string | undefined> {
  return optionalString().transform((value, ctx) => {
    if (value === undefined) {
      return defaultValue;
    }

    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      ctx.addIssue({ code: 'custom', message: `expected an integer, received "${value}"` });
      return z.NEVER;
    }
    if (parsed < minimum || parsed > maximum) {
      ctx.addIssue({
        code: 'custom',
        message: `expected an integer between ${minimum} and ${maximum}, received ${parsed}`,
      });
      return z.NEVER;
    }

    return parsed;
  });
}

function enumEnv<T extends string>(
  allowed: readonly T[],
  defaultValue: T,
): z.ZodType<T, string | undefined> {
  return optionalString().transform((value, ctx) => {
    if (value === undefined) {
      return defaultValue;
    }

    const normalized = value.toLowerCase() as T;
    if (!allowed.includes(normalized)) {
      ctx.addIssue({
        code: 'custom',
        message: `expected one of [${allowed.join(', ')}], received "${value}"`,
      });
      return z.NEVER;
    }

    return normalized;
  });
}

/** Parses a comma-separated list, dropping blank entries. */
function stringListEnv(): z.ZodType<readonly string[], string | undefined> {
  return optionalString().transform((value) =>
    value === undefined
      ? []
      : value
          .split(',')
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
  );
}

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const envSchema = z
  .object({
    NODE_ENV: enumEnv(enumValues(Environment), Environment.DEVELOPMENT),

    DATABASE_URL: z
      .string({ error: 'DATABASE_URL is required' })
      .min(1, 'DATABASE_URL is required')
      .refine(
        (value) => value.startsWith('mysql://'),
        'must be a MySQL connection string starting with "mysql://"',
      ),

    DATABASE_CONNECTION_LIMIT: integerEnv(10, 1, 100),
    DATABASE_QUEUE_LIMIT: integerEnv(0, 0, 10_000),
    DATABASE_CONNECT_TIMEOUT_MS: integerEnv(10_000, 1_000, 120_000),
    DATABASE_IDLE_TIMEOUT_MS: integerEnv(60_000, 1_000, 3_600_000),
    DATABASE_RETRY_ATTEMPTS: integerEnv(2, 0, 10),
    DATABASE_RETRY_DELAY_MS: integerEnv(500, 0, 30_000),
    DATABASE_SLOW_QUERY_MS: integerEnv(500, 1, 60_000),
    DATABASE_LOG_QUERIES: booleanEnv(false),

    LOG_LEVEL: enumEnv(enumValues(LogLevel), LogLevel.INFO),
    LOG_TO_FILE: booleanEnv(true),
    LOG_DIR: stringEnv('logs'),

    OUTPUT_DIR: stringEnv('output'),
    SCREENSHOT_DIR: stringEnv('screenshots'),

    SCRAPER_WORKERS: integerEnv(4, 1, 32),
    SCRAPER_HEADLESS: booleanEnv(true),
    SCRAPER_BROWSER_TYPE: enumEnv(enumValues(BrowserType), BrowserType.CHROMIUM),
    SCRAPER_RETRY_COUNT: integerEnv(3, 0, 10),
    SCRAPER_TIMEOUT_MS: integerEnv(30_000, 1_000, 600_000),
    SCRAPER_NAVIGATION_TIMEOUT_MS: integerEnv(45_000, 1_000, 600_000),
    SCRAPER_RATE_LIMIT_PER_MINUTE: integerEnv(60, 1, 6_000),
    SCRAPER_SCROLL_DELAY_MS: integerEnv(1_200, 0, 60_000),
    SCRAPER_MAX_SCROLLS: integerEnv(250, 1, 10_000),
    SCREENSHOTS_ENABLED: booleanEnv(true),

    PROXY_ENABLED: booleanEnv(false),
    PROXY_URLS: stringListEnv(),
    PROXY_USERNAME: optionalString(),
    PROXY_PASSWORD: optionalString(),

    VERIFICATION_CONCURRENCY: integerEnv(5, 1, 32),
    VERIFICATION_TIMEOUT_MS: integerEnv(15_000, 1_000, 120_000),
    VERIFICATION_MAX_SEARCH_RESULTS: integerEnv(10, 1, 50),
    VERIFICATION_USER_AGENT: stringEnv(DEFAULT_USER_AGENT),
  })
  .superRefine((env, ctx) => {
    if (env.PROXY_ENABLED && env.PROXY_URLS.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['PROXY_URLS'],
        message: 'at least one proxy URL is required when PROXY_ENABLED is true',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/**
 * Loads `.env` into `process.env`.
 *
 * Real environment variables always win over the file, which is what CI and
 * container deployments expect. Called once from the CLI composition root.
 */
export function loadDotEnv(envFilePath?: string): void {
  loadDotEnvFile({
    path: envFilePath ?? `${PROJECT_ROOT}/.env`,
    override: false,
    quiet: true,
  });
}

/**
 * Validates raw environment variables.
 *
 * @throws {ConfigurationError} with every validation failure listed at once.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = result.error.issues.map((issue) => {
      const key = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${key}: ${issue.message}`;
    });

    throw new ConfigurationError(
      `Invalid environment configuration:\n${details.join('\n')}`,
      { issueCount: result.error.issues.length },
      result.error,
    );
  }

  return result.data;
}
