import { calculateRate, fileTimestamp, formatDuration, sleep } from '../../../src/utils/time';

describe('formatDuration', () => {
  it.each([
    [0, '00:00:00'],
    [1_000, '00:00:01'],
    [61_000, '00:01:01'],
    [3_661_000, '01:01:01'],
    [36_000_000, '10:00:00'],
  ])('formats %sms as %s', (milliseconds, expected) => {
    expect(formatDuration(milliseconds)).toBe(expected);
  });

  it('clamps negative durations to zero', () => {
    expect(formatDuration(-5_000)).toBe('00:00:00');
  });
});

describe('calculateRate', () => {
  it('returns items per second rounded to one decimal', () => {
    expect(calculateRate(320, 100_000)).toBe(3.2);
  });

  it('returns zero when no time has elapsed', () => {
    expect(calculateRate(10, 0)).toBe(0);
  });
});

describe('fileTimestamp', () => {
  it('produces a filesystem-safe UTC timestamp', () => {
    expect(fileTimestamp(new Date('2026-07-26T14:05:33.123Z'))).toBe('2026-07-26T14-05-33');
  });
});

describe('sleep', () => {
  it('resolves after the requested delay', async () => {
    const startedAt = Date.now();
    await sleep(25);

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(20);
  });

  it('resolves immediately for non-positive delays', async () => {
    await expect(sleep(-100)).resolves.toBeUndefined();
  });
});
