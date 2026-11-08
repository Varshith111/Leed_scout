import type { VerificationConfig } from '../config/config';
import type { IDatabaseService } from '../database/DatabaseService';
import type { ILogger } from '../logger';
import { LogEvent } from '../logger';
import type { UpsertVerifiedBusinessInput } from '../models/dtos';
import type { RawBusinessRow, VerifiedBusinessRow } from '../models/entities';
import { toNumber } from '../models/entities';
import { JobService } from './JobService';
import { WebsiteVerifier } from '../verification';
import { GoogleSearchVerifier } from '../verification/GoogleSearchVerifier';
import { normaliseUrl } from '../verification/DomainValidator';

export interface VerifyOptions {
  /** When set, only verifies businesses belonging to this job. */
  readonly jobId?: number | undefined;
  /** Abort signal for graceful shutdown. */
  readonly signal?: AbortSignal | undefined;
  /** Called after each business is verified. */
  readonly onProgress?: ((processed: number, total: number, hasWebsite: boolean) => void) | undefined;
}

export interface VerificationSummary {
  readonly processed: number;
  readonly withWebsite: number;
  readonly withoutWebsite: number;
  readonly failed: number;
}

export class VerificationService {
  private readonly websiteVerifier: WebsiteVerifier;
  private readonly searchVerifier: GoogleSearchVerifier;
  private readonly jobs: JobService;

  public constructor(
    private readonly database: IDatabaseService,
    private readonly verificationConfig: VerificationConfig,
    private readonly logger: ILogger,
  ) {
    this.websiteVerifier = new WebsiteVerifier(verificationConfig, logger.child('WebsiteVerifier'));
    this.searchVerifier = new GoogleSearchVerifier(verificationConfig, logger.child('GoogleSearchVerifier'));
    this.jobs = new JobService(database, logger);
  }

  /**
   * Verifies all unverified RawBusinesses (optionally scoped to a job).
   *
   * Pipeline per business:
   *   1. If the scraped `website` field is set and passes domain validation →
   *      HTTP-check it. If reachable → hasWebsite = true.
   *   2. If step 1 found nothing → Google Search cross-reference.
   *   3. If both steps find nothing → hasWebsite = false.
   *
   * Runs up to `verificationConfig.concurrency` checks in parallel.
   */
  public async run(options: VerifyOptions = {}): Promise<VerificationSummary> {
    this.logger.event(LogEvent.VERIFICATION_STARTED, 'Verification started', {
      jobId: options.jobId,
    });

    const pending = await this.loadPending(options.jobId);
    const total = pending.length;
    this.logger.info(`Verifying ${String(total)} businesses`, {
      concurrency: this.verificationConfig.concurrency,
    });

    const summary: VerificationSummary = { processed: 0, withWebsite: 0, withoutWebsite: 0, failed: 0 };

    // Process in concurrency-limited batches
    const concurrency = this.verificationConfig.concurrency;
    for (let i = 0; i < pending.length; i += concurrency) {
      if (options.signal?.aborted === true) {
        this.logger.info('Verification aborted by signal', { processed: summary.processed });
        break;
      }

      const batch = pending.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        batch.map((raw) => this.verifyOne(raw)),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const { hasWebsite, jobId } = result.value;
          (summary as { processed: number; withWebsite: number; withoutWebsite: number; failed: number }).processed += 1;
          if (hasWebsite) {
            (summary as { processed: number; withWebsite: number; withoutWebsite: number; failed: number }).withWebsite += 1;
          } else {
            (summary as { processed: number; withoutWebsite: number; withWebsite: number; failed: number }).withoutWebsite += 1;
          }

          // Update job counters if this business belongs to a job
          if (jobId !== undefined) {
            await this.jobs.incrementCounters(jobId, {
              businessesVerified: 1,
              ...(hasWebsite ? {} : { businessesWithoutWebsite: 1 }),
            }).catch(() => undefined);
          }

          options.onProgress?.(summary.processed, total, hasWebsite);
        } else {
          (summary as { processed: number; withWebsite: number; withoutWebsite: number; failed: number }).failed += 1;
          this.logger.error('Verification failed for a business', result.reason);
        }
      }
    }

    this.logger.event(LogEvent.VERIFICATION_COMPLETED, 'Verification completed', {
      ...summary,
    });

    return summary;
  }

  // ── Per-business pipeline ─────────────────────────────────────────────────

  private async verifyOne(raw: RawBusinessRow): Promise<{ hasWebsite: boolean; jobId: number }> {
    let hasWebsite = false;
    let confirmedWebsiteUrl: string | undefined;
    let email = raw.email ?? undefined;

    // Stage 1: check the URL the scraper already found
    if (raw.website !== null && raw.website.trim() !== '') {
      const normalised = normaliseUrl(raw.website);
      if (normalised.isValid && normalised.isOfficialWebsite) {
        const check = await this.websiteVerifier.check(raw.website);
        if (check.reachable) {
          hasWebsite = true;
          confirmedWebsiteUrl = check.finalUrl ?? normalised.href;
          this.logger.event(LogEvent.WEBSITE_FOUND, 'Website confirmed via HTTP check', {
            rawId: raw.id,
            url: confirmedWebsiteUrl,
          });
        }
      }
    }

    // Stage 2: Google Search cross-reference (only when stage 1 found nothing)
    if (!hasWebsite && raw.name !== '') {
      const city = raw.city ?? '';
      const searchResult = await this.searchVerifier.findWebsite(raw.name, city);
      if (searchResult.email && !email) {
        email = searchResult.email;
      }

      if (searchResult.websiteFound && searchResult.websiteUrl !== undefined) {
        // HTTP-verify the URL found by search before trusting it
        const check = await this.websiteVerifier.check(searchResult.websiteUrl);
        if (check.reachable) {
          hasWebsite = true;
          confirmedWebsiteUrl = check.finalUrl ?? searchResult.websiteUrl;
          this.logger.event(LogEvent.WEBSITE_FOUND, 'Website found via Google Search', {
            rawId: raw.id,
            url: confirmedWebsiteUrl,
          });
        }
      }
    }

    // Stage 3: Dedicated email / Gmail search if still missing
    if (!email && raw.name !== '') {
      email = await this.searchVerifier.findEmail(raw.name, raw.city ?? '');
    }

    if (!hasWebsite) {
      this.logger.event(LogEvent.WEBSITE_MISSING, 'No website found', {
        rawId: raw.id,
        name: raw.name,
      });
    }

    await this.upsertVerifiedBusiness({
      rawBusinessId: raw.id,
      name: raw.name,
      address: raw.address ?? '',
      phone: raw.phone ?? '',
      provider: raw.provider,
      category: raw.category ?? undefined,
      email,
      website: confirmedWebsiteUrl,
      city: raw.city ?? undefined,
      state: raw.state ?? undefined,
      country: raw.country ?? undefined,
      rating: toNumber(raw.rating) ?? undefined,
      reviewCount: raw.reviewCount ?? undefined,
      latitude: toNumber(raw.latitude) ?? undefined,
      longitude: toNumber(raw.longitude) ?? undefined,
      googleMapsUrl: raw.googleMapsUrl ?? undefined,
      verified: true,
      hasWebsite,
    });

    return { hasWebsite, jobId: raw.jobId };
  }

  // ── Database helpers ──────────────────────────────────────────────────────

  private async loadPending(jobId?: number): Promise<RawBusinessRow[]> {
    const jobFilter = jobId !== undefined
      ? 'AND rb.`jobId` = ?'
      : '';
    const params: number[] = jobId !== undefined ? [jobId] : [];

    // A RawBusiness is "pending verification" when it has no corresponding
    // VerifiedBusiness row yet.
    return this.database.query<RawBusinessRow>(
      `SELECT rb.*
         FROM \`RawBusinesses\` rb
        WHERE NOT EXISTS (
          SELECT 1 FROM \`VerifiedBusinesses\` vb WHERE vb.\`rawBusinessId\` = rb.\`id\`
        )
        ${jobFilter}
        ORDER BY rb.\`id\` ASC`,
      params,
    );
  }

  private async upsertVerifiedBusiness(input: UpsertVerifiedBusinessInput): Promise<VerifiedBusinessRow> {
    // The composite unique key (name, address, phone) handles deduplication.
    // ON CONFLICT DO UPDATE merges a second sighting into the existing row.
    const result = await this.database.execute(
      `INSERT INTO "VerifiedBusinesses"
         ("rawBusinessId", "name", "address", "phone", "provider",
          "category", "email", "website", "city", "state", "country",
          "rating", "reviewCount", "latitude", "longitude", "googleMapsUrl",
          "verified", "hasWebsite")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT ("name", "address", "phone") DO UPDATE SET
         "email"         = COALESCE(EXCLUDED."email", "VerifiedBusinesses"."email"),
         "website"       = COALESCE(EXCLUDED."website", "VerifiedBusinesses"."website"),
         "verified"      = EXCLUDED."verified",
         "hasWebsite"    = EXCLUDED."hasWebsite",
         "rating"        = COALESCE(EXCLUDED."rating", "VerifiedBusinesses"."rating"),
         "reviewCount"   = COALESCE(EXCLUDED."reviewCount", "VerifiedBusinesses"."reviewCount"),
         "updatedAt"     = CURRENT_TIMESTAMP
       RETURNING "id"`,
      [
        input.rawBusinessId,
        input.name,
        input.address,
        input.phone,
        input.provider,
        input.category ?? null,
        input.email ?? null,
        input.website ?? null,
        input.city ?? null,
        input.state ?? null,
        input.country ?? null,
        input.rating ?? null,
        input.reviewCount ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.googleMapsUrl ?? null,
        Boolean(input.verified),
        Boolean(input.hasWebsite),
      ],
    );

    const id = result.insertId > 0
      ? result.insertId
      : await this.findVerifiedId(input.name, input.address, input.phone);

    const row = await this.database.queryOne<VerifiedBusinessRow>(
      'SELECT * FROM `VerifiedBusinesses` WHERE `id` = ?',
      [id],
    );

    if (row === null) throw new Error('VerifiedBusiness row missing after upsert');

    if (result.insertId === 0) {
      this.logger.event(LogEvent.DUPLICATE_MERGED, 'Duplicate business merged', {
        name: input.name,
        id,
      });
    }

    return row;
  }

  private async findVerifiedId(name: string, address: string, phone: string): Promise<number> {
    const row = await this.database.queryOne<{ id: number }>(
      'SELECT `id` FROM `VerifiedBusinesses` WHERE `name` = ? AND `address` = ? AND `phone` = ?',
      [name, address, phone],
    );
    if (row === null) throw new Error('Cannot locate VerifiedBusiness after ON DUPLICATE KEY UPDATE');
    return row.id;
  }
}
