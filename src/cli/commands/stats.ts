import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { StatsService } from '../../services/StatsService';
import { printHeading, printKeyValue, printLine } from '../output';
import { printTable } from '../progress';

export function makeStatsCommand(context: AppContext): Command {
  return new Command('stats')
    .description('Show aggregate statistics for all jobs and businesses')
    .action(async () => {
      const service = new StatsService(context.database, context.logger);
      const stats = await service.get();

      // ── Jobs ──────────────────────────────────────────────────────────────
      printHeading('Jobs');
      printKeyValue('Total', String(stats.jobs.total));
      printKeyValue('Completed', String(stats.jobs.completed));
      printKeyValue('Running', String(stats.jobs.running));
      printKeyValue('Paused', String(stats.jobs.paused));
      printKeyValue('Failed', String(stats.jobs.failed));
      printKeyValue('Cancelled', String(stats.jobs.cancelled));

      // ── Businesses ────────────────────────────────────────────────────────
      printHeading('Businesses');
      printKeyValue('Scraped (raw)', String(stats.businesses.totalRaw));
      printKeyValue('Verified', String(stats.businesses.totalVerified));
      printKeyValue('Has website', String(stats.businesses.withWebsite));
      printKeyValue('No website (leads)', String(stats.businesses.withoutWebsite));
      printKeyValue('Lead conversion', `${String(stats.businesses.conversionRate)}%`);

      // ── Top cities ────────────────────────────────────────────────────────
      if (stats.topCities.length > 0) {
        printHeading('Top cities (no-website leads)');
        printLine();
        printTable(
          ['City', 'Leads'],
          stats.topCities.map((c) => [c.city, c.count]),
        );
      }

      // ── Recent exports ────────────────────────────────────────────────────
      if (stats.recentExports.length > 0) {
        printHeading('Recent exports');
        printLine();
        printTable(
          ['ID', 'Format', 'Records', 'Created', 'File'],
          stats.recentExports.map((e) => [
            e.id,
            e.format.toUpperCase(),
            e.recordCount,
            e.createdAt,
            e.filePath,
          ]),
        );
      }

      printLine();
    });
}
