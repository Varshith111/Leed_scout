import {
  ConfigurationError,
  ProviderError,
  ValidationError,
  isOperationalError,
  serializeError,
  toError,
} from '../../../src/utils/errors';

describe('AppError hierarchy', () => {
  it('carries a stable code, name and context', () => {
    const error = new ProviderError('Listing container not found', { provider: 'google' });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ProviderError');
    expect(error.code).toBe('PROVIDER_ERROR');
    expect(error.context).toEqual({ provider: 'google' });
    expect(error.isOperational).toBe(true);
  });

  it('marks configuration failures as non-operational', () => {
    expect(isOperationalError(new ConfigurationError('bad env'))).toBe(false);
    expect(isOperationalError(new ValidationError('bad input'))).toBe(true);
    expect(isOperationalError(new Error('plain'))).toBe(false);
  });

  it('preserves the underlying cause', () => {
    const cause = new Error('socket hang up');
    const error = new ProviderError('search failed', {}, cause);

    expect(error.cause).toBe(cause);
  });
});

describe('toError', () => {
  it('returns Error instances unchanged', () => {
    const error = new Error('boom');
    expect(toError(error)).toBe(error);
  });

  it('wraps thrown strings', () => {
    expect(toError('boom').message).toBe('boom');
  });

  it('wraps non-error values', () => {
    expect(toError({ status: 500 }).message).toContain('{"status":500}');
  });
});

describe('serializeError', () => {
  it('produces a structured, log-friendly payload', () => {
    const serialized = serializeError(
      new ValidationError('invalid city', { city: '' }, new Error('root cause')),
    );

    expect(serialized.name).toBe('ValidationError');
    expect(serialized.code).toBe('VALIDATION_ERROR');
    expect(serialized.context).toEqual({ city: '' });
    expect(serialized.stack).toBeDefined();
    expect(serialized.cause?.message).toBe('root cause');
  });

  it('omits the context when empty', () => {
    expect(serializeError(new ValidationError('nope')).context).toBeUndefined();
  });

  it('handles non-error values', () => {
    expect(serializeError('plain failure').message).toBe('plain failure');
  });
});
