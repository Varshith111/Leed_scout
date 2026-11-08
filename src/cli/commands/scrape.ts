import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { JobService } from '../../services/JobService';
import { ScrapeService } from '../../services/ScrapeService';
import { VerificationService } from '../../services/VerificationService';
import { ExportService } from '../../services/ExportService';
import { ExportFormat, ProviderName, enumValues } from '../../models/enums';
import { printSuccess, printKeyValue, printLine, printWarning } from '../output';
import { ProgressBar } from '../progress';

interface ScrapeCommandOptions {
  provider: string;
  category: string;
  city: string;
  state?: string;
  country?: string;
  limit?: string;
  verify?: boolean;
  export?: boolean;
}

export function makeScrapeCommand(context: AppContext): Command {
  return new Command('scrape')
    .description('Scrape businesses from a provider, verify websites, and auto-export qualified leads')
    .requiredOption(
      '-p, --provider <provider>',
      `Data source (${enumValues(ProviderName).join(', ')})`,
    )
    .requiredOption('-c, --category <category>', 'Business category, e.g. Restaurants')
    .requiredOption('--city <city>', 'Target city')
    .option('--state <state>', 'Target state / province')
    .option('--country <country>', 'Target country')
    .option('--limit <number>', 'Maximum businesses to collect', '1000')
    .option('--no-verify', 'Skip automatic website verification after scraping')
    .option('--no-export', 'Skip automatic file export after verification')
    .action(async (opts: ScrapeCommandOptions) => {
      const provider = opts.provider;

      if (!enumValues(ProviderName).includes(provider as never)) {
        context.logger.error(`Unknown provider "${provider}"`);
        process.exitCode = 1;
        return;
      }

      const limit = Math.max(1, parseInt(opts.limit ?? '1000', 10));
      const jobs = new JobService(context.database, context.logger);

      const job = await jobs.create({
        provider: provider as ProviderName,
        category: opts.category,
        city: opts.city,
        state: opts.state,
        country: opts.country,
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
        printWarning('Step 1/3: Scraping businesses from ' + job.provider + '...');
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
          return;
        }

        printSuccess('Scrape complete');
        printKeyValue('Businesses found', String(completed.businessesFound));
        printKeyValue('Job status', completed.status);

        // Step 2 & 3: Automatic Verification & Export
        if (opts.verify !== false && completed.businessesFound > 0) {
          printLine();
          printWarning('Step 2/3: Verifying websites & extracting direct emails/Gmails...');
          printLine();

          const verifier = new VerificationService(
            context.database,
            context.config.verification,
            context.logger,
          );

          const verifyBar = new ProgressBar({
            label: 'Verifying',
            current: 0,
            total: completed.businessesFound,
            stats: { checked: 0, 'no-website': 0 },
          });

          let noWebsiteCount = 0;
          const verifySummary = await verifier.run({
            jobId: job.id,
            signal: controller.signal,
            onProgress: (processed, total, hasWebsite) => {
              if (!hasWebsite) noWebsiteCount += 1;
              verifyBar.update({
                current: processed,
                total,
                stats: { checked: processed, 'no-website': noWebsiteCount },
              });
            },
          });

          verifyBar.finish(`Verification complete — ${String(verifySummary.withoutWebsite)} qualified leads found`);
          printLine();
          printSuccess('Verification finished');
          printKeyValue('Businesses checked', String(verifySummary.processed));
          printKeyValue('Has official website', String(verifySummary.withWebsite));
          printKeyValue('NO website (Qualified Leads)', String(verifySummary.withoutWebsite));

          if (opts.export !== false && verifySummary.withoutWebsite > 0) {
            printLine();
            printWarning('Step 3/3: Exporting leads to Excel, CSV, and JSON...');

            const exporter = new ExportService(context.database, context.logger);

            const excelResult = await exporter.run({
              format: ExportFormat.EXCEL,
              outputDir: context.config.paths.output,
              jobId: job.id,
            });
            const csvResult = await exporter.run({
              format: ExportFormat.CSV,
              outputDir: context.config.paths.output,
              jobId: job.id,
            });
            const jsonResult = await exporter.run({
              format: ExportFormat.JSON,
              outputDir: context.config.paths.output,
              jobId: job.id,
            });

            printLine();
            printSuccess(`Pipeline complete! Successfully extracted & saved ${String(verifySummary.withoutWebsite)} leads:`);
            printKeyValue('Excel File (.xlsx)', excelResult.filePath);
            printKeyValue('CSV File (.csv)', csvResult.filePath);
            printKeyValue('JSON File (.json)', jsonResult.filePath);
          }
        }
      } catch (error) {
        bar.clear();
        printLine();
        context.logger.error('Scrape failed', error);
        process.exitCode = 1;
      }
    });
}
