import type { AppConfig } from '../config/config';
import type { IDatabaseService } from '../database/DatabaseService';
import type { ILogger } from '../logger';
import { LogEvent } from '../logger';
import type { CreateRawBusinessInput } from '../models/dtos';
import type { RawBusinessRow } from '../models/entities';
import type { ProviderName } from '../models/enums';
import { createProvider } from '../providers';
import type { SearchParams } from '../providers';
import { JobService } from './JobService';

export interface ScrapeOptions {
  readonly jobId: number;
  readonly provider: ProviderName;
  readonly category: string;
  readonly city: string;
  readonly state?: string | undefined;
  readonly country?: string | undefined;
  readonly limit: number;
  /** When set, the scrape stops cleanly as soon as the signal fires. */
  readonly signal?: AbortSignal | undefined;
  /** Called after each business is saved. */
  readonly onProgress?: ((saved: number, name: string) => void) | undefined;
}

export class ScrapeService {
  private readonly jobs: JobService;

  public constructor(
    private readonly database: IDatabaseService,
    private readonly config: AppConfig,
    private readonly logger: ILogger,
  ) {
    this.jobs = new JobService(database, logger);
  }

  /** Starts a brand-new scrape for `options.jobId`. */
  public async run(options: ScrapeOptions): Promise<void> {
    await this.jobs.start(options.jobId);
    await this.scrape(options);
  }

  /**
   * Resumes a PAUSED job from where it left off.
   *
   * Already-collected `providerBusinessId` values are loaded from the database
   * so the provider skips businesses that were saved in the previous run.
   */
  public async resume(options: ScrapeOptions): Promise<void> {
    const job = await this.jobs.getById(options.jobId);
    const alreadyFound = job.businessesFound;

    this.logger.info('Resuming job', {
      jobId: options.jobId,
      alreadyFound,
      remaining: options.limit - alreadyFound,
    });

    await this.jobs.resume(options.jobId);
    await this.scrape({ ...options, limit: options.limit - alreadyFound });
  }

  // ── Core scrape loop ──────────────────────────────────────────────────────

  private async scrape(options: ScrapeOptions): Promise<void> {
    const provider = createProvider(
      options.provider,
      this.config,
      this.logger.child(options.provider),
    );

    // Load already-seen providerBusinessIds for this job so the provider can
    // skip them. This is the resume dedup mechanism.
    const seenIds = await this.loadSeenProviderIds(options.jobId);

    try {
      const params: SearchParams = {
        category: options.category,
        city: options.city,
        state: options.state,
        country: options.country,
        limit: options.limit,
      };

      let count = 0;

      for await (const business of provider.search(params)) {
        // Honour abort signal — pause the job and exit cleanly
        if (options.signal?.aborted === true) {
          this.logger.info('Scrape aborted by signal', { jobId: options.jobId, count });
          await this.jobs.pause(options.jobId).catch(() => undefined);
          return;
        }

        // Skip businesses already saved in a previous run of this job
        if (
          business.providerBusinessId !== undefined &&
          seenIds.has(business.providerBusinessId)
        ) {
          this.logger.event(LogEvent.BUSINESS_SKIPPED, 'Business already saved, skipping', {
            providerBusinessId: business.providerBusinessId,
          });
          continue;
        }

        await this.saveRawBusiness({
          jobId: options.jobId,
          provider: options.provider,
          ...business,
        });

        if (business.providerBusinessId !== undefined) {
          seenIds.add(business.providerBusinessId);
        }

        count += 1;
        await this.jobs.incrementCounters(options.jobId, { businessesFound: 1 });

        const totalSoFar = (await this.jobs.getById(options.jobId)).businessesFound;
        const progress = Math.min(99, Math.round((totalSoFar / options.limit) * 100));
        await this.jobs.setProgress(options.jobId, progress);

        this.logger.event(LogEvent.BUSINESS_SAVED, 'Raw business saved', {
          jobId: options.jobId,
          name: business.name,
          count,
        });

        options.onProgress?.(count, business.name);
      }

      await this.jobs.complete(options.jobId);
    } catch (error) {
      this.logger.error('Scrape failed', error, { jobId: options.jobId });
      await this.jobs.fail(options.jobId).catch(() => undefined);
      throw error;
    } finally {
      await provider.close();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Loads all providerBusinessIds already saved for this job. */
  private async loadSeenProviderIds(jobId: number): Promise<Set<string>> {
    const rows = await this.database.query<{ providerBusinessId: string }>(
      'SELECT `providerBusinessId` FROM `RawBusinesses` WHERE `jobId` = ? AND `providerBusinessId` IS NOT NULL',
      [jobId],
    );
    return new Set(rows.map((r) => r.providerBusinessId));
  }

  private async saveRawBusiness(input: CreateRawBusinessInput): Promise<RawBusinessRow> {
    const result = await this.database.execute(
      `INSERT INTO \`RawBusinesses\`
         (\`jobId\`, \`provider\`, \`providerBusinessId\`, \`name\`, \`category\`,
          \`phone\`, \`website\`, \`address\`, \`city\`, \`state\`, \`country\`,
          \`rating\`, \`reviewCount\`, \`latitude\`, \`longitude\`, \`googleMapsUrl\`, \`rawData\`)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.jobId,
        input.provider,
        input.providerBusinessId ?? null,
        input.name,
        input.category ?? null,
        input.phone ?? null,
        input.website ?? null,
        input.address ?? null,
        input.city ?? null,
        input.state ?? null,
        input.country ?? null,
        input.rating ?? null,
        input.reviewCount ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.googleMapsUrl ?? null,
        input.rawData !== undefined ? JSON.stringify(input.rawData) : null,
      ],
    );

    const row = await this.database.queryOne<RawBusinessRow>(
      'SELECT * FROM `RawBusinesses` WHERE `id` = ?',
      [result.insertId],
    );

    if (row === null) throw new Error('RawBusiness row missing after insert');
    return row;
  }
}
