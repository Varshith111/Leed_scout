import type { BrowserType, ExportFormat, JobStatus, LogLevel, ProviderName } from './enums';

/**
 * Database row shapes.
 *
 * One interface per table, matching the column names in
 * `src/database/migrations` exactly, so a `SELECT` maps onto a typed object
 * without a translation layer.
 *
 * Driver notes:
 *   * `DATETIME` columns arrive as strings (`dateStrings: true`), which keeps
 *     values independent of the process timezone; `toDate()` converts them.
 *   * `BOOLEAN` is `TINYINT(1)`, so MySQL returns `0` / `1`; `toBoolean()`
 *     converts them.
 *   * `DECIMAL` columns arrive as strings to preserve precision; `toNumber()`
 *     converts them.
 */

/** A decoded JSON column value. */
export type JsonObject = Record<string, unknown>;

/** MySQL `TINYINT(1)` representation of a boolean. */
export type MysqlBoolean = 0 | 1;

export interface JobRow {
  readonly id: number;
  readonly provider: ProviderName;
  readonly category: string;
  readonly city: string;
  readonly state: string | null;
  readonly country: string | null;
  readonly status: JobStatus;
  readonly progress: number;
  readonly businessesFound: number;
  readonly businessesVerified: number;
  readonly businessesWithoutWebsite: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RawBusinessRow {
  readonly id: number;
  readonly jobId: number;
  readonly provider: ProviderName;
  readonly providerBusinessId: string | null;
  readonly name: string;
  readonly category: string | null;
  readonly phone: string | null;
  readonly website: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly rating: string | null;
  readonly reviewCount: number | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly googleMapsUrl: string | null;
  readonly rawData: JsonObject | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VerifiedBusinessRow {
  readonly id: number;
  readonly rawBusinessId: number;
  readonly name: string;
  readonly category: string | null;
  readonly phone: string;
  readonly website: string | null;
  readonly address: string;
  readonly city: string | null;
  readonly state: string | null;
  readonly country: string | null;
  readonly rating: string | null;
  readonly reviewCount: number | null;
  readonly latitude: string | null;
  readonly longitude: string | null;
  readonly googleMapsUrl: string | null;
  readonly provider: ProviderName;
  readonly verified: MysqlBoolean;
  readonly hasWebsite: MysqlBoolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ExportRow {
  readonly id: number;
  readonly jobId: number | null;
  readonly format: ExportFormat;
  readonly filePath: string;
  readonly recordCount: number;
  readonly createdAt: string;
}

export interface LogRow {
  readonly id: number;
  readonly level: LogLevel;
  readonly event: string | null;
  readonly context: string | null;
  readonly message: string;
  readonly metadata: JsonObject | null;
  readonly createdAt: string;
}

export interface SettingsRow {
  readonly id: number;
  readonly workers: number;
  readonly headless: MysqlBoolean;
  readonly retryCount: number;
  readonly timeout: number;
  readonly proxyEnabled: MysqlBoolean;
  readonly rateLimit: number;
  readonly browserType: BrowserType;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The natural key that identifies a business across providers and scrapes. */
export interface BusinessIdentity {
  readonly name: string;
  readonly address: string;
  readonly phone: string;
}

// --- Column converters ------------------------------------------------------

/** Converts MySQL's `TINYINT(1)` into a boolean. */
export function toBoolean(value: MysqlBoolean | boolean | null): boolean {
  return value === 1 || value === true;
}

/** Converts a `DATETIME` string into a `Date`, preserving `null`. */
export function toDate(value: string | null): Date | null {
  return value === null ? null : new Date(`${value.replace(' ', 'T')}Z`);
}

/** Converts a `DECIMAL` string into a number, preserving `null`. */
export function toNumber(value: string | number | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
