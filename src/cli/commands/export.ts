import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { ExportService } from '../../services/ExportService';
import { ExportFormat, ProviderName, enumValues } from '../../models/enums';
import { printSuccess, printKeyValue, printLine, printError } from '../output';

export function makeExportCommand(context: AppContext): Command {
  return new Command('export')
    .description('Export leads (verified businesses with no website) to a file')
    .argument('<format>', `Output format: ${enumValues(ExportFormat).join(', ')}`)
    .option('--job <jobId>', 'Scope export to a specific job')
    .option('--city <city>', 'Filter by city')
    .option('--state <state>', 'Filter by state')
    .option('--country <country>', 'Filter by country')
    .option('--category <category>', 'Filter by category')
    .option('--provider <provider>', `Filter by provider (${enumValues(ProviderName).join(', ')})`)
    .option('--min-rating <number>', 'Minimum star rating')
    .action(async (formatArg: string, opts: Record<string, string>) => {
      const format = formatArg.toLowerCase() as ExportFormat;

      if (!enumValues(ExportFormat).includes(format)) {
        printError(`Unknown format "${formatArg}". Use: ${enumValues(ExportFormat).join(', ')}`);
        process.exitCode = 1;
        return;
      }

      const jobId = opts['job'] !== undefined ? parseInt(opts['job'], 10) : undefined;
      const minRating = opts['minRating'] !== undefined ? parseFloat(opts['minRating']) : undefined;

      const service = new ExportService(context.database, context.logger);

      try {
        const result = await service.run({
          format,
          outputDir: context.config.paths.output,
          jobId,
          filter: {
            city: opts['city'],
            state: opts['state'],
            country: opts['country'],
            category: opts['category'],
            provider: opts['provider'] as ProviderName | undefined,
            minRating,
          },
        });

        printLine();
        printSuccess(`Export complete`);
        printKeyValue('Format', result.format.toUpperCase());
        printKeyValue('Records', String(result.recordCount));
        printKeyValue('File', result.filePath);
      } catch (error) {
        printError(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      }
    });
}
