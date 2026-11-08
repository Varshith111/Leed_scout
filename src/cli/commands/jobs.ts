import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { JobService } from '../../services/JobService';
import { JobStatus, ProviderName, enumValues } from '../../models/enums';
import { printLine, printKeyValue, printHeading } from '../output';

export function makeJobsCommand(context: AppContext): Command {
  return new Command('jobs')
    .description('List scraping jobs')
    .option('-s, --status <status>', `Filter by status (${enumValues(JobStatus).join(', ')})`)
    .option(
      '-p, --provider <provider>',
      `Filter by provider (${enumValues(ProviderName).join(', ')})`,
    )
    .option('--limit <number>', 'Maximum rows to show', '20')
    .action(async (opts: Record<string, string>) => {
      const jobs = new JobService(context.database, context.logger);

      const rows = await jobs.list(
        {
          status: opts['status'] as (typeof JobStatus)[keyof typeof JobStatus] | undefined,
          provider: opts['provider'] as (typeof ProviderName)[keyof typeof ProviderName] | undefined,
        },
        { limit: Number(opts['limit'] ?? 20) },
      );

      if (rows.length === 0) {
        printLine('No jobs found.');
        return;
      }

      for (const job of rows) {
        printHeading(`Job #${String(job.id)}`);
        printKeyValue('Provider', job.provider);
        printKeyValue('Category', job.category);
        printKeyValue('City', job.city);
        printKeyValue('Status', job.status);
        printKeyValue('Progress', `${String(job.progress)}%`);
        printKeyValue('Found', String(job.businessesFound));
        printKeyValue('Verified', String(job.businessesVerified));
        printKeyValue('No website', String(job.businessesWithoutWebsite));
        printKeyValue('Created', job.createdAt);
      }
    });
}
