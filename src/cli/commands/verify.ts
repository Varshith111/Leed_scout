import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { VerificationService } from '../../services/VerificationService';
import { printSuccess, printKeyValue, printLine, printWarning } from '../output';
import { ProgressBar } from '../progress';

export function makeVerifyCommand(context: AppContext): Command {
  return new Command('verify')
    .description('Verify whether scraped businesses have an official website')
    .option('--job <jobId>', 'Only verify businesses from this job')
    .action(async (opts: Record<string, string>) => {
      const jobId = opts['job'] !== undefined ? parseInt(opts['job'], 10) : undefined;

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
      } catch (error) {
        bar.clear();
        context.logger.error('Verification failed', error);
        process.exitCode = 1;
      }
    });
}
