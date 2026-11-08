import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { JobService } from '../../services/JobService';
import { ScrapeService } from '../../services/ScrapeService';
import { JobStatus } from '../../models/enums';
import { printSuccess, printKeyValue, printLine, printWarning, printError } from '../output';

export function makeResumeCommand(context: AppContext): Command {
  return new Command('resume')
    .description('Resume a paused scraping job')
    .argument('<jobId>', 'ID of the job to resume')
    .option('--limit <number>', 'Override the original collection limit')
    .action(async (jobIdArg: string, opts: Record<string, string>) => {
      const jobId = parseInt(jobIdArg, 10);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        printError('jobId must be a positive integer');
        process.exitCode = 1;
        return;
      }

      const jobs = new JobService(context.database, context.logger);
      const job = await jobs.getById(jobId).catch(() => null);

      if (job === null) {
        printError(`Job #${String(jobId)} not found`);
        process.exitCode = 1;
        return;
      }

      if (job.status !== JobStatus.PAUSED) {
        printError(
          `Job #${String(jobId)} is ${job.status} — only PAUSED jobs can be resumed`,
        );
        process.exitCode = 1;
        return;
      }

      const originalLimit = job.businessesFound + 500; // sensible default if not overridden
      const limit = opts.limit !== undefined
        ? Math.max(1, parseInt(opts.limit, 10))
        : originalLimit;

      printSuccess(`Resuming job #${String(jobId)}`);
      printLine();
      printKeyValue('Provider', job.provider);
      printKeyValue('Category', job.category);
      printKeyValue('City', job.city);
      printKeyValue('Already found', String(job.businessesFound));
      printKeyValue('Limit', String(limit));
      printLine();

      const controller = new AbortController();
      process.once('SIGINT', () => {
        printLine();
        printWarning('Interrupt received — pausing job after current business...');
        controller.abort();
      });

      const scraper = new ScrapeService(context.database, context.config, context.logger);

      try {
        printWarning('Resuming scrape — this may take several minutes...');
        printLine();

        await scraper.resume({
          jobId: job.id,
          provider: job.provider,
          category: job.category,
          city: job.city,
          state: job.state ?? undefined,
          country: job.country ?? undefined,
          limit,
          signal: controller.signal,
        });

        const updated = await jobs.getById(jobId);
        printLine();
        if (updated.status === JobStatus.PAUSED) {
          printWarning('Job paused — run resume again to continue');
        } else {
          printSuccess('Scrape complete');
        }
        printKeyValue('Businesses found', String(updated.businessesFound));
        printKeyValue('Job status', updated.status);
      } catch (error) {
        printLine();
        context.logger.error('Resume failed', error);
        process.exitCode = 1;
      }
    });
}
