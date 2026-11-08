import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { VerificationService } from '../../services/VerificationService';
import { ExportService } from '../../services/ExportService';
import { ExportFormat } from '../../models/enums';
import { printSuccess, printKeyValue, printLine, printWarning } from '../output';
import { ProgressBar } from '../progress';

interface VerifyCommandOptions {
  job?: string;
  export?: boolean;
}

export function makeVerifyCommand(context: AppContext): Command {
  return new Command('verify')
    .description('Verify whether scraped businesses have an official website and auto-export qualified leads')
    .option('--job <jobId>', 'Only verify businesses from this job')
    .option('--no-export', 'Skip automatic file export after verification')
    .action(async (opts: VerifyCommandOptions) => {
      const jobId = opts.job !== undefined ? parseInt(opts.job, 10) : undefined;

      const controller = new AbortController();
      process.once('SIGINT', () => {
        printLine();
        printWarning('Interrupt received — stopping after current batch...');
        controller.abort();
      });

      const service = new VerificationService(
        context.database,
        context.config.verification,
        context.logger,
      );

      printWarning('Verification started...');
      printLine();

      const bar = new ProgressBar({
        label: 'Verifying',
        current: 0,
        total: 0,
        stats: { checked: 0, 'no-website': 0 },
      });

      let noWebsiteCount = 0;

      try {
        const summary = await service.run({
          jobId,
          signal: controller.signal,
          onProgress: (processed, total, hasWebsite) => {
            if (!hasWebsite) noWebsiteCount += 1;
            bar.update({
              current: processed,
              total,
              stats: { checked: processed, 'no-website': noWebsiteCount },
            });
          },
        });

        bar.finish(`Verification complete — ${String(summary.withoutWebsite)} leads found`);
        printLine();
        printSuccess('Verification complete');
        printKeyValue('Processed', String(summary.processed));
        printKeyValue('Has website', String(summary.withWebsite));
        printKeyValue('No website', String(summary.withoutWebsite));
        if (summary.failed > 0) {
          printKeyValue('Failed', String(summary.failed));
        }

        if (opts.export !== false && summary.withoutWebsite > 0) {
          printLine();
          printWarning('Exporting qualified leads (businesses with no website)...');
          const exporter = new ExportService(context.database, context.logger);

          const excelResult = await exporter.run({
            format: ExportFormat.EXCEL,
            outputDir: context.config.paths.output,
            jobId,
          });
          const csvResult = await exporter.run({
            format: ExportFormat.CSV,
            outputDir: context.config.paths.output,
            jobId,
          });
          const jsonResult = await exporter.run({
            format: ExportFormat.JSON,
            outputDir: context.config.paths.output,
            jobId,
          });

          printLine();
          printSuccess(`Export complete! Saved ${String(summary.withoutWebsite)} leads:`);
          printKeyValue('Excel File (.xlsx)', excelResult.filePath);
          printKeyValue('CSV File (.csv)', csvResult.filePath);
          printKeyValue('JSON File (.json)', jsonResult.filePath);
        }
      } catch (error) {
        bar.clear();
        context.logger.error('Verification failed', error);
        process.exitCode = 1;
      }
    });
}
