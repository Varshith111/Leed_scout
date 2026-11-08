import { toBoolean, toDate, toNumber } from '../../../src/models/entities';
import { resolvePagination } from '../../../src/models/dtos';

describe('toBoolean', () => {
  it.each([
    [1, true],
    [0, false],
    [true, true],
    [false, false],
    [null, false],
  ] as const)('converts %s to %s', (value, expected) => {
    expect(toBoolean(value)).toBe(expected);
  });
});

describe('toDate', () => {
  it('parses a MySQL DATETIME string as UTC', () => {
    const parsed = toDate('2026-07-26 10:47:45.983');

    expect(parsed?.toISOString()).toBe('2026-07-26T10:47:45.983Z');
  });

  it('preserves null', () => {
    expect(toDate(null)).toBeNull();
  });
});

describe('toNumber', () => {
  it('parses DECIMAL strings', () => {
    expect(toNumber('4.3')).toBe(4.3);
    expect(toNumber('17.4399000')).toBe(17.4399);
  });

  it('passes numbers through and preserves null', () => {
    expect(toNumber(12)).toBe(12);
    expect(toNumber(null)).toBeNull();
  });

  it('returns null for unparseable values', () => {
    expect(toNumber('not-a-number')).toBeNull();
  });
});

describe('resolvePagination', () => {
  it('applies defaults', () => {
    expect(resolvePagination()).toEqual({ limit: 50, offset: 0 });
  });

  it('clamps the page size and rejects negative offsets', () => {
    expect(resolvePagination({ limit: 100_000, offset: -5 })).toEqual({ limit: 1000, offset: 0 });
    expect(resolvePagination({ limit: 0 })).toEqual({ limit: 1, offset: 0 });
  });

  it('truncates fractional input', () => {
    expect(resolvePagination({ limit: 10.9, offset: 4.7 })).toEqual({ limit: 10, offset: 4 });
  });
});
