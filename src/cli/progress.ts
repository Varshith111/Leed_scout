/**
 * Terminal progress bar and live stats renderer.
 *
 * Uses raw ANSI escape codes — no extra dependency. Writes to stderr so
 * piped stdout (e.g. redirected export output) is never polluted.
 * Automatically disabled when stderr is not a TTY or NO_COLOR is set.
 */

const tty = process.stderr.isTTY === true && process.env.NO_COLOR === undefined;

const A = {
  reset:     '\u001b[0m',
  bold:      '\u001b[1m',
  dim:       '\u001b[2m',
  green:     '\u001b[32m',
  cyan:      '\u001b[36m',
  yellow:    '\u001b[33m',
  magenta:   '\u001b[35m',
  clearLine: '\u001b[2K',
  cursorUp:  '\u001b[1A',
  col0:      '\u001b[0G',
} as const;

function c(text: string, code: string): string {
  return tty ? `${code}${text}${A.reset}` : text;
}

export interface ProgressState {
  label: string;
  current: number;
  total: number;
  /** Extra key→value pairs shown to the right of the bar. */
  stats: Record<string, string | number>;
}

const BAR_WIDTH = 28;

export class ProgressBar {
  private rendered = false;
  private state: ProgressState;

  public constructor(initial: ProgressState) {
    this.state = initial;
  }

  public update(patch: Partial<ProgressState>): void {
    this.state = { ...this.state, ...patch };
    this.render();
  }

  public increment(statKey: string, by = 1): void {
    const current = Number(this.state.stats[statKey] ?? 0);
    this.update({ stats: { ...this.state.stats, [statKey]: current + by } });
  }

  public finish(message: string): void {
    if (!tty) return;
    this.clear();
    process.stderr.write(`${c('[OK]', A.green)} ${message}\n`);
    this.rendered = false;
  }

  public clear(): void {
    if (!tty || !this.rendered) return;
    // Erase the two lines we drew (bar line + stats line)
    process.stderr.write(`${A.cursorUp}${A.clearLine}${A.col0}${A.cursorUp}${A.clearLine}${A.col0}`);
    this.rendered = false;
  }

  private render(): void {
    if (!tty) return;
    if (this.rendered) this.clear();

    const { label, current, total, stats } = this.state;
    const pct = total > 0 ? Math.min(1, current / total) : 0;
    const filled = Math.round(pct * BAR_WIDTH);
    const empty = BAR_WIDTH - filled;

    const bar =
      c('[', A.dim) +
      c('█'.repeat(filled), A.green) +
      c('░'.repeat(empty), A.dim) +
      c(']', A.dim);

    const pctStr = `${String(Math.round(pct * 100)).padStart(3)}%`;
    const countStr = c(`${String(current)}/${String(total)}`, A.dim);

    const statsStr = Object.entries(stats)
      .map(([k, v]) => `${c(k, A.cyan)}:${c(String(v), A.yellow)}`)
      .join('  ');

    const line1 = `${c(label, A.bold)}  ${bar}  ${pctStr}  ${countStr}`;
    const line2 = `  ${statsStr}`;

    process.stderr.write(`${line1}\n${line2}\n`);
    this.rendered = true;
  }
}

/**
 * Renders a static summary table to stdout (not stderr).
 * Used by `leadscout stats`.
 */
export function printTable(
  headers: string[],
  rows: (string | number | null)[][],
): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)),
  );

  const divider = widths.map((w) => '─'.repeat(w + 2)).join('┼');
  const fmt = (row: (string | number | null)[]): string =>
    row.map((cell, i) => ` ${String(cell ?? '').padEnd(widths[i] ?? 0)} `).join('│');

  process.stdout.write(`┌${widths.map((w) => '─'.repeat(w + 2)).join('┬')}┐\n`);
  process.stdout.write(`│${fmt(headers)}│\n`);
  process.stdout.write(`├${divider}┤\n`);
  for (const row of rows) {
    process.stdout.write(`│${fmt(row)}│\n`);
  }
  process.stdout.write(`└${widths.map((w) => '─'.repeat(w + 2)).join('┴')}┘\n`);
}
