import type { ConfigSummary } from '../config';

/**
 * Terminal presentation helpers.
 *
 * The CLI layer is the only layer allowed to write to stdout; services return
 * data and never print. Colours use raw ANSI codes so no extra dependency is
 * required, and are disabled automatically when stdout is not a TTY or when
 * `NO_COLOR` is set (https://no-color.org).
 */

const colorEnabled = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;

const CODES = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
} as const;

type ColorName = Exclude<keyof typeof CODES, 'reset'>;

/** Wraps text in an ANSI colour, or returns it unchanged when colour is off. */
export function colorize(text: string, color: ColorName): string {
  return colorEnabled ? `${CODES[color]}${text}${CODES.reset}` : text;
}

export function printLine(text = ''): void {
  console.log(text);
}

export function printHeading(text: string): void {
  printLine();
  printLine(colorize(text.toUpperCase(), 'bold'));
  printLine(colorize('-'.repeat(text.length), 'dim'));
}

export function printKeyValue(key: string, value: string, keyWidth = 22): void {
  printLine(`  ${colorize(key.padEnd(keyWidth), 'cyan')} ${value}`);
}

export function printSuccess(text: string): void {
  printLine(colorize(`[OK] ${text}`, 'green'));
}

export function printWarning(text: string): void {
  printLine(colorize(`[!] ${text}`, 'yellow'));
}

export function printError(text: string): void {
  console.error(colorize(`[ERROR] ${text}`, 'red'));
}

/** Renders the banner shown on every invocation. */
export function printBanner(version: string): void {
  printLine(colorize(`LeadScout v${version}`, 'bold'));
  printLine(colorize('Finds businesses that do not have an official website.', 'dim'));
}

/** Renders a grouped configuration summary produced by `ConfigService.describe()`. */
export function printConfigSummary(summary: ConfigSummary): void {
  for (const [section, entries] of Object.entries(summary)) {
    printHeading(section);
    for (const [key, value] of Object.entries(entries)) {
      printKeyValue(key, value);
    }
  }
}
