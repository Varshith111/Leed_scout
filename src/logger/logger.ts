import { join } from 'node:path';

import { createLogger, format, transports, type Logger as WinstonLogger } from 'winston';

import type { AppConfig } from '../config/config';
import { LogLevel } from '../models/enums';
import { serializeError } from '../utils/errors';
import { ensureDirectorySync } from '../utils/fs';
import type { LogEvent } from './events';

/**
 * Logging infrastructure.
 *
 * Business code depends on the {@link ILogger} interface only — Winston never
 * leaks past this module, so transports (console, rotating files, and the MySQL
 * `Log` table added in Phase 2) can change without touching a single service.
 */

export type LogMetadata = Record<string, unknown>;

export interface ILogger {
  debug(message: string, meta?: LogMetadata): void;
  info(message: string, meta?: LogMetadata): void;
  warn(message: string, meta?: LogMetadata): void;
  /** Logs at `error` level, serializing `error` into structured metadata. */
  error(message: string, error?: unknown, meta?: LogMetadata): void;
  /** Logs a lifecycle event at `info` level under the `event` field. */
  event(event: LogEvent, message: string, meta?: LogMetadata): void;
  /** Derives a logger with a nested context, e.g. `ScrapeService:worker-2`. */
  child(context: string): ILogger;
}

/** Any Winston transport instance, typed without importing `winston-transport`. */
export type LogTransport = Parameters<WinstonLogger['add']>[0];

const MAX_LOG_FILE_BYTES = 10 * 1024 * 1024;
const MAX_LOG_FILES = 10;

/** Fields the console formatter renders itself instead of dumping as metadata. */
const RESERVED_FIELDS = new Set(['level', 'message', 'timestamp', 'context', 'event', 'stack']);

const consoleFormat = format.combine(
  format.timestamp({ format: 'HH:mm:ss.SSS' }),
  format.colorize({ level: true }),
  format.printf((info) => {
    const timestamp = typeof info.timestamp === 'string' ? info.timestamp : '';
    const context = typeof info.context === 'string' ? info.context : 'app';
    const event = typeof info.event === 'string' ? ` (${info.event})` : '';
    const message = typeof info.message === 'string' ? info.message : JSON.stringify(info.message);

    const extras = Object.entries(info)
      .filter(([key]) => !RESERVED_FIELDS.has(key))
      .map(([key, value]) => `${key}=${formatValue(value)}`);
    const suffix = extras.length > 0 ? ` ${extras.join(' ')}` : '';

    return `${timestamp} ${info.level} [${context}]${event} ${message}${suffix}`;
  }),
);

const fileFormat = format.combine(format.timestamp(), format.json());

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }

  try {
    return JSON.stringify(value) ?? '[unserializable]';
  } catch {
    return '[unserializable]';
  }
}

/** Adapts a Winston logger to {@link ILogger}, pinning a context label. */
class WinstonContextLogger implements ILogger {
  public constructor(
    private readonly winston: WinstonLogger,
    private readonly context: string,
  ) {}

  public debug(message: string, meta: LogMetadata = {}): void {
    this.winston.debug(message, this.withContext(meta));
  }

  public info(message: string, meta: LogMetadata = {}): void {
    this.winston.info(message, this.withContext(meta));
  }

  public warn(message: string, meta: LogMetadata = {}): void {
    this.winston.warn(message, this.withContext(meta));
  }

  public error(message: string, error?: unknown, meta: LogMetadata = {}): void {
    const payload = this.withContext(meta);
    if (error !== undefined) {
      payload.error = serializeError(error);
    }
    this.winston.error(message, payload);
  }

  public event(event: LogEvent, message: string, meta: LogMetadata = {}): void {
    this.winston.info(message, { ...this.withContext(meta), event });
  }

  public child(context: string): ILogger {
    return new WinstonContextLogger(this.winston, `${this.context}:${context}`);
  }

  private withContext(meta: LogMetadata): LogMetadata {
    return { ...meta, context: this.context };
  }
}

let rootLogger: WinstonLogger | undefined;

/**
 * Builds the root Winston logger from configuration.
 *
 * Safe to call more than once: the previous logger is closed and replaced,
 * which is what happens when the CLI boots after a lazily created default.
 */
export function initializeLogging(config: AppConfig): void {
  const logTransports: LogTransport[] = [
    new transports.Console({
      level: config.logging.level,
      format: consoleFormat,
      silent: config.isTest,
      handleExceptions: false,
    }),
  ];

  if (config.logging.toFile) {
    const directory = ensureDirectorySync(config.logging.directory);
    const fileOptions = {
      format: fileFormat,
      maxsize: MAX_LOG_FILE_BYTES,
      maxFiles: MAX_LOG_FILES,
      tailable: true,
    };

    logTransports.push(
      new transports.File({
        ...fileOptions,
        filename: join(directory, 'leadscout.log'),
        level: config.logging.level,
      }),
      new transports.File({
        ...fileOptions,
        filename: join(directory, 'error.log'),
        level: LogLevel.ERROR,
      }),
    );
  }

  rootLogger?.close();
  rootLogger = createLogger({
    level: config.logging.level,
    levels: {
      error: 0,
      warn: 1,
      info: 2,
      http: 3,
      verbose: 4,
      debug: 5,
      silly: 6,
    },
    transports: logTransports,
    exitOnError: false,
  });
}

function getRootLogger(): WinstonLogger {
  rootLogger ??= createLogger({
    level: LogLevel.INFO,
    transports: [
      new transports.Console({
        format: consoleFormat,
        silent: process.env.NODE_ENV === 'test',
      }),
    ],
    exitOnError: false,
  });

  return rootLogger;
}

/** Returns a logger bound to a context label, e.g. `getLogger('ScrapeService')`. */
export function getLogger(context: string): ILogger {
  return new WinstonContextLogger(getRootLogger(), context);
}

/** Registers an extra transport, e.g. the MySQL `Log` table writer. */
export function addLogTransport(transport: LogTransport): void {
  getRootLogger().add(transport);
}

/** Flushes and closes every transport. Called during CLI shutdown. */
export function closeLogging(): Promise<void> {
  const logger = rootLogger;
  if (logger === undefined) {
    return Promise.resolve();
  }

  rootLogger = undefined;

  return new Promise<void>((resolve) => {
    logger.on('finish', () => {
      resolve();
    });
    logger.end();
  });
}
