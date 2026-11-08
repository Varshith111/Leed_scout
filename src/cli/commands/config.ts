import { Command } from 'commander';
import type { AppContext } from '../bootstrap';
import { printConfigSummary } from '../output';

export function makeConfigCommand(context: AppContext): Command {
  return new Command('config')
    .description('Show the resolved configuration (secrets redacted)')
    .action(() => {
      printConfigSummary(context.configService.describe());
    });
}
