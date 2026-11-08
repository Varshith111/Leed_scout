#!/usr/bin/env node
import { Command } from 'commander';
import { LogEvent, getLogger } from '../logger';
import { AppError, serializeError } from '../utils/errors';
import { type AppContext, bootstrap, shutdown } from './bootstrap';
import { printBanner, printError, printLine, printWarning } from './output';
import { makeScrapeCommand } from './commands/scrape';
import { makeJobsCommand } from './commands/jobs';
import { makeConfigCommand } from './commands/config';
import { makeResumeCommand } from './commands/resume';
import { makeCancelCommand } from './commands/cancel';
import { makeVerifyCommand } from './commands/verify';
import { makeExportCommand } from './commands/export';
import { makeStatsCommand } from './commands/stats';

const EXIT_SUCCESS = 0;
const EXIT_FAILURE = 1;

async function main(): Promise<number> {
  let context: AppContext | undefined;

  try {
    context = bootstrap();
    context.logger.event(LogEvent.APPLICATION_START, 'LeadScout started', {
      version: context.version,
      node: process.version,
      platform: process.platform,
      pid: process.pid,
    });

    const program = new Command('leadscout')
      .version(context.version)
      .description('Finds businesses that do not have an official website.')
      .hook('preAction', async (_thisCommand, actionCommand) => {
        // Initialize database only when executing an actual action command
        if (actionCommand.name() !== 'config') {
          await context?.database.initialize();
        }
      })
      .addCommand(makeScrapeCommand(context))
      .addCommand(makeJobsCommand(context))
      .addCommand(makeConfigCommand(context))
      .addCommand(makeResumeCommand(context))
      .addCommand(makeCancelCommand(context))
      .addCommand(makeVerifyCommand(context))
      .addCommand(makeExportCommand(context))
      .addCommand(makeStatsCommand(context));

    printBanner(context.version);
    printLine();

    await program.parseAsync(process.argv);

    return EXIT_SUCCESS;
  } catch (error) {
    reportFatalError(error);
    return EXIT_FAILURE;
  } finally {
    await shutdown(context);
  }
}

function reportFatalError(error: unknown): void {
  const serialized = serializeError(error);

  printError(serialized.message);
  if (error instanceof AppError && !error.isOperational) {
    printLine();
    printLine('  Fix the issue above and run the command again.');
    printLine('  See .env.example for the full list of supported environment variables.');
  }

  try {
    getLogger('leadscout').error('Fatal error', error);
  } catch {
    // Logging unavailable — message was printed above.
  }
}

process.on('unhandledRejection', (reason: unknown) => {
  reportFatalError(reason);
  process.exitCode = EXIT_FAILURE;
});

process.on('uncaughtException', (error: Error) => {
  reportFatalError(error);
  process.exit(EXIT_FAILURE);
});

// SIGINT (Ctrl+C) during a scrape is handled inside the scrape/resume commands
// via AbortController. This handler prevents Node from printing a raw ^C and
// exiting immediately — the command's own handler fires first.
process.on('SIGINT', () => {
  printLine();
  printWarning('Interrupt received — finishing current operation...');
});

void main().then((exitCode) => {
  process.exitCode = exitCode;
});
