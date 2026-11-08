/**
 * Time helpers shared across the scraping, verification and export pipelines.
 */

const MS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

/** Resolves after the given number of milliseconds. */
export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

/** Formats a duration in milliseconds as `HH:MM:SS`. */
export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / MS_PER_SECOND));
  const hours = Math.floor(totalSeconds / (SECONDS_PER_MINUTE * MINUTES_PER_HOUR));
  const minutes = Math.floor((totalSeconds / SECONDS_PER_MINUTE) % MINUTES_PER_HOUR);
  const seconds = totalSeconds % SECONDS_PER_MINUTE;

  return [hours, minutes, seconds].map((part) => part.toString().padStart(2, '0')).join(':');
}

/** Items processed per second, rounded to one decimal. Returns 0 when no time elapsed. */
export function calculateRate(itemCount: number, elapsedMilliseconds: number): number {
  if (elapsedMilliseconds <= 0) {
    return 0;
  }

  return Math.round((itemCount / (elapsedMilliseconds / MS_PER_SECOND)) * 10) / 10;
}

/** Filesystem-safe UTC timestamp, e.g. `2026-07-26T14-05-33`. Used for export/screenshot names. */
export function fileTimestamp(date: Date = new Date()): string {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, '')
    .replace(/:/g, '-');
}
