import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { JobService } from '../../services/JobService';
import { printSuccess, printKeyValue, printLine, printError } from '../output';

export function makeCancelCommand(context: AppContext): Command {
  return new Command('cancel')
    .description('Cancel a pending, running or paused job')
    .argument('<jobId>', 'ID of the job to cancel')
    .action(async (jobIdArg: string) => {
      const jobId = parseInt(jobIdArg, 10);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        printError('jobId must be a positive integer');
        process.exitCode = 1;
        return;
      }

      const jobs = new JobService(context.database, context.logger);

      try {
        const job = await jobs.cancel(jobId);
        printSuccess(`Job #${String(jobId)} cancelled`);
        printLine();
        printKeyValue('Provider', job.provider);
        printKeyValue('Category', job.category);
        printKeyValue('City', job.city);
        printKeyValue('Businesses found', String(job.businessesFound));
        printKeyValue('Status', job.status);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
