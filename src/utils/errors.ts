/**
 * Application error hierarchy.
 *
 * Every error thrown by LeadScout code extends {@link AppError}, which carries a
 * stable machine-readable `code`, an `isOperational` flag (expected failure vs.
 * programmer bug) and a structured `context` bag that is written to the logs.
 */

export type ErrorContext = Record<string, unknown>;

export interface AppErrorOptions {
  /** Stable, machine-readable identifier, e.g. `CONFIGURATION_ERROR`. */
  readonly code: string;
  /** `true` for expected runtime failures the application can recover from. */
  readonly isOperational?: boolean | undefined;
  /** Structured details attached to log entries. Must not contain secrets. */
  readonly context?: ErrorContext | undefined;
  /** Underlying error, preserved for stack-trace chaining. */
  readonly cause?: unknown;
}

export abstract class AppError extends Error {
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly context: ErrorContext;

  protected constructor(message: string, options: AppErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.isOperational = options.isOperational ?? true;
    this.context = options.context ?? {};
    Error.captureStackTrace(this, new.target);
  }
}

/** Invalid or missing configuration / environment variables. */
export class ConfigurationError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'CONFIGURATION_ERROR', isOperational: false, context, cause });
  }
}

/** Input failed schema validation. */
export class ValidationError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'VALIDATION_ERROR', context, cause });
  }
}

/** A persistence operation failed. */
export class DatabaseError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'DATABASE_ERROR', context, cause });
  }
}

/** A requested record does not exist. */
export class NotFoundError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'NOT_FOUND', context, cause });
  }
}

/** A provider (Google Maps, JustDial, …) failed or changed its layout. */
export class ProviderError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'PROVIDER_ERROR', context, cause });
  }
}

/** Browser automation failure: crash, navigation error, timeout, captcha. */
export class ScraperError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'SCRAPER_ERROR', context, cause });
  }
}

/** Website verification failure. */
export class VerificationError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'VERIFICATION_ERROR', context, cause });
  }
}

/** Export generation failure. */
export class ExportError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'EXPORT_ERROR', context, cause });
  }
}

/** Illegal job state transition or job execution failure. */
export class JobError extends AppError {
  public constructor(message: string, context?: ErrorContext, cause?: unknown) {
    super(message, { code: 'JOB_ERROR', context, cause });
  }
}

/** Narrows an unknown thrown value to an `Error` instance. */
export function toError(value: unknown): Error {
  if (value instanceof Error) {
    return value;
  }

  if (typeof value === 'string') {
    return new Error(value);
  }

  return new Error(`Non-error value thrown: ${safeStringify(value)}`);
}

export interface SerializedError {
  readonly name: string;
  readonly message: string;
  readonly code?: string;
  readonly stack?: string;
  readonly context?: ErrorContext;
  readonly cause?: SerializedError;
}

/** Converts any thrown value into a plain object suitable for structured logs. */
export function serializeError(value: unknown): SerializedError {
  const error = toError(value);

  const serialized: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
    context?: ErrorContext;
    cause?: SerializedError;
  } = {
    name: error.name,
    message: error.message,
  };

  if (error.stack !== undefined) {
    serialized.stack = error.stack;
  }

  if (error instanceof AppError) {
    serialized.code = error.code;
    if (Object.keys(error.context).length > 0) {
      serialized.context = error.context;
    }
  }

  if (error.cause !== undefined && error.cause !== null) {
    serialized.cause = serializeError(error.cause);
  }

  return serialized;
}

/** `true` when the error is an expected, recoverable runtime failure. */
export function isOperationalError(value: unknown): boolean {
  return value instanceof AppError && value.isOperational;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
