import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { JobService } from '../../services/JobService';
import { ScrapeService } from '../../services/ScrapeService';
import { ProviderName, enumValues } from '../../models/enums';
import { printSuccess, printKeyValue, printLine, printWarning } from '../output';
import { ProgressBar } from '../progress';

export function makeScrapeCommand(context: AppContext): Command {
  return new Command('scrape')
    .description('Scrape businesses from a provider and save them to the database')
    .requiredOption(
      '-p, --provider <provider>',
      `Data source (${enumValues(ProviderName).join(', ')})`,
    )
    .requiredOption('-c, --category <category>', 'Business category, e.g. Restaurants')
    .requiredOption('--city <city>', 'Target city')
    .option('--state <state>', 'Target state / province')
    .option('--country <country>', 'Target country')
    .option('--limit <number>', 'Maximum businesses to collect', '1000')
    .action(async (opts: Record<string, string>) => {
      const provider = opts['provider'] as string;

      if (!enumValues(ProviderName).includes(provider as never)) {
        context.logger.error(`Unknown provider "${provider}"`);
        process.exitCode = 1;
        return;
      }

      const limit = Math.max(1, parseInt(opts['limit'] ?? '1000', 10));
      const jobs = new JobService(context.database, context.logger);

      const job = await jobs.create({
        provider: provider as ProviderName,
        category: opts['category'] as string,
        city: opts['city'] as string,
        state: opts['state'],
        country: opts['country'],
      });

      printSuccess(`Job #${String(job.id)} created`);
      printLine();
      printKeyValue('Provider', job.provider);
      printKeyValue('Category', job.category);
      printKeyValue('City', job.city);
      if (job.state !== null) printKeyValue('State', job.state);
      if (job.country !== null) printKeyValue('Country', job.country);
      printKeyValue('Limit', String(limit));
      printLine();

      const controller = new AbortController();
      process.once('SIGINT', () => {
        printLine();
        printWarning('Interrupt received — pausing job after current business...');
        controller.abort();
      });

      const scraper = new ScrapeService(context.database, context.config, context.logger);

      const bar = new ProgressBar({
        label: 'Scraping',
        current: 0,
        total: limit,
        stats: { found: 0, job: job.id },
      });

      try {
        printWarning('Scraping started — this may take several minutes...');
        printLine();

        await scraper.run({
          jobId: job.id,
          provider: job.provider,
          category: job.category,
          city: job.city,
          state: job.state ?? undefined,
          country: job.country ?? undefined,
          limit,
          signal: controller.signal,
          onProgress: (saved, name) => {
            bar.update({ current: saved, stats: { found: saved, last: name.slice(0, 30), job: job.id } });
          },
        });

        const completed = await jobs.getById(job.id);
        bar.finish(`Scrape complete — ${String(completed.businessesFound)} businesses found`);
        printLine();
        if (completed.status === 'PAUSED') {
          printWarning('Job paused — run `leadscout resume` to continue');
        } else {
          printSuccess('Scrape complete');
        }
        printKeyValue('Businesses found', String(completed.businessesFound));
        printKeyValue('Job status', completed.status);
      } catch (error) {
        bar.clear();
        printLine();
        context.logger.error('Scrape failed', error);
        process.exitCode = 1;
      }
    });
}
