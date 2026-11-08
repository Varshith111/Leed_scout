import type { JsonObject } from './entities';
import type { BrowserType, ExportFormat, JobStatus, LogLevel, ProviderName } from './enums';

/**
 * Service inputs and filters.
 *
 * Optional members are declared `?: T | undefined` because the project compiles
 * with `exactOptionalPropertyTypes`, which lets callers forward optional CLI
 * flags straight through without pre-filtering them.
 */

// --- Jobs -------------------------------------------------------------------

export interface CreateJobInput {
  readonly provider: ProviderName;
  readonly category: string;
  readonly city: string;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
}

export interface JobCounterDelta {
  readonly businessesFound?: number | undefined;
  readonly businessesVerified?: number | undefined;
  readonly businessesWithoutWebsite?: number | undefined;
}

export interface JobFilter {
  readonly status?: JobStatus | undefined;
  readonly provider?: ProviderName | undefined;
}

// --- Raw businesses ---------------------------------------------------------

export interface CreateRawBusinessInput {
  readonly jobId: number;
  readonly provider: ProviderName;
  readonly providerBusinessId?: string | undefined;
  readonly name: string;
  readonly category?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly website?: string | undefined;
  readonly address?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
  readonly rating?: number | undefined;
  readonly reviewCount?: number | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly googleMapsUrl?: string | undefined;
  readonly rawData?: JsonObject | undefined;
}

export interface RawBusinessFilter {
  readonly jobId?: number | undefined;
  readonly provider?: ProviderName | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly category?: string | undefined;
}

// --- Verified businesses ----------------------------------------------------

export interface UpsertVerifiedBusinessInput {
  readonly rawBusinessId: number;
  readonly name: string;
  readonly address: string;
  readonly phone: string;
  readonly provider: ProviderName;
  readonly category?: string | undefined;
  readonly email?: string | undefined;
  readonly website?: string | undefined;
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
  readonly rating?: number | undefined;
  readonly reviewCount?: number | undefined;
  readonly latitude?: number | undefined;
  readonly longitude?: number | undefined;
  readonly googleMapsUrl?: string | undefined;
  readonly verified: boolean;
  readonly hasWebsite: boolean;
}

export interface VerifiedBusinessFilter {
  readonly city?: string | undefined;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
  readonly category?: string | undefined;
  readonly provider?: ProviderName | undefined;
  readonly verified?: boolean | undefined;
  readonly hasWebsite?: boolean | undefined;
  readonly minRating?: number | undefined;
  readonly jobId?: number | undefined;
}

export interface VerifiedBusinessStatistics {
  readonly total: number;
  readonly verified: number;
  readonly withWebsite: number;
  readonly withoutWebsite: number;
}

// --- Exports ----------------------------------------------------------------

export interface CreateExportInput {
  readonly jobId?: number | undefined;
  readonly format: ExportFormat;
  readonly filePath: string;
  readonly recordCount: number;
}

// --- Logs -------------------------------------------------------------------

export interface CreateLogInput {
  readonly level: LogLevel;
  readonly event?: string | undefined;
  readonly context?: string | undefined;
  readonly message: string;
  readonly metadata?: JsonObject | undefined;
}

// --- Settings ---------------------------------------------------------------

export interface UpdateSettingsInput {
  readonly workers?: number | undefined;
  readonly headless?: boolean | undefined;
  readonly retryCount?: number | undefined;
  readonly timeout?: number | undefined;
  readonly proxyEnabled?: boolean | undefined;
  readonly rateLimit?: number | undefined;
  readonly browserType?: BrowserType | undefined;
}

// --- Pagination -------------------------------------------------------------

export interface Pagination {
  readonly offset?: number | undefined;
  readonly limit?: number | undefined;
}

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 1_000;

/** Normalises pagination input into safe `LIMIT` / `OFFSET` values. */
export function resolvePagination(pagination: Pagination = {}): {
  limit: number;
  offset: number;
} {
  const offset = Math.max(0, Math.trunc(pagination.offset ?? 0));
  const requested = Math.trunc(pagination.limit ?? DEFAULT_PAGE_SIZE);
  const limit = Math.min(Math.max(1, requested), MAX_PAGE_SIZE);

  return { limit, offset };
}
