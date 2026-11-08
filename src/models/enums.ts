/**
 * Domain enumerations shared by every layer of the application.
 *
 * These are declared as `const` objects (instead of TypeScript `enum`s) so the
 * values stay plain strings at runtime — they are persisted verbatim in MySQL
 * and written into CSV/Excel/JSON exports.
 */

/** Supported data sources. New providers are added here and in the registry. */
export const ProviderName = {
  GOOGLE: 'google',
  JUSTDIAL: 'justdial',
  INDIAMART: 'indiamart',
} as const;

export type ProviderName = (typeof ProviderName)[keyof typeof ProviderName];

/** Lifecycle of a scraping job. */
export const JobStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

/** Outcome of the website verification pipeline for a single business. */
export const VerificationStatus = {
  PENDING: 'PENDING',
  HAS_WEBSITE: 'HAS_WEBSITE',
  NO_WEBSITE: 'NO_WEBSITE',
  FAILED: 'FAILED',
} as const;

export type VerificationStatus = (typeof VerificationStatus)[keyof typeof VerificationStatus];

/** Export file formats supported by the export service. */
export const ExportFormat = {
  CSV: 'csv',
  EXCEL: 'excel',
  JSON: 'json',
} as const;

export type ExportFormat = (typeof ExportFormat)[keyof typeof ExportFormat];

/** Playwright browser engines that the scraping engine can drive. */
export const BrowserType = {
  CHROMIUM: 'chromium',
  FIREFOX: 'firefox',
  WEBKIT: 'webkit',
} as const;

export type BrowserType = (typeof BrowserType)[keyof typeof BrowserType];

/** Winston log levels, ordered from most to least severe. */
export const LogLevel = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  HTTP: 'http',
  VERBOSE: 'verbose',
  DEBUG: 'debug',
  SILLY: 'silly',
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/** Application runtime environments. */
export const Environment = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
} as const;

export type Environment = (typeof Environment)[keyof typeof Environment];

/** Returns the values of a `const` enumeration object as a readonly tuple. */
export function enumValues<T extends Record<string, string>>(source: T): readonly T[keyof T][] {
  return Object.values(source) as T[keyof T][];
}
