import { Writable } from 'node:stream';

import { format, transports } from 'winston';

import { type AppConfig, ConfigService } from '../../../src/config/config';
import { LogEvent } from '../../../src/logger/events';
import {
  addLogTransport,
  closeLogging,
  getLogger,
  initializeLogging,
} from '../../../src/logger/logger';
import { createTestEnv } from '../../helpers/env';

interface CapturedEntry {
  readonly level: string;
  readonly message: string;
  readonly context?: string;
  readonly event?: string;
  readonly error?: { name: string; code?: string; message: string };
  readonly [key: string]: unknown;
}

const captured: CapturedEntry[] = [];

function createCaptureStream(): Writable {
  return new Writable({
    write(chunk: Buffer | string, _encoding, callback): void {
      for (const line of String(chunk).split('\n')) {
        if (line.trim().length > 0) {
          captured.push(JSON.parse(line) as CapturedEntry);
        }
      }
      callback();
    },
  });
}

/** Winston flushes through streams, so give the event loop a couple of turns. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

describe('logger', () => {
  let config: AppConfig;

  beforeEach(() => {
    captured.length = 0;
    config = new ConfigService(createTestEnv({ LOG_LEVEL: 'debug' })).get();
    initializeLogging(config);
    addLogTransport(
      new transports.Stream({
        stream: createCaptureStream(),
        format: format.json(),
        level: 'debug',
      }),
    );
  });

  afterEach(async () => {
    await closeLogging();
  });

  it('does not write log files when file logging is disabled', () => {
    expect(config.logging.toFile).toBe(false);
  });

  it('tags every entry with its context', async () => {
    getLogger('ScrapeService').info('Search started');
    await flush();

    expect(captured).toHaveLength(1);
    expect(captured[0]?.context).toBe('ScrapeService');
    expect(captured[0]?.message).toBe('Search started');
    expect(captured[0]?.level).toBe('info');
  });

  it('nests child contexts', async () => {
    getLogger('ScrapeService').child('worker-2').debug('Scrolled');
    await flush();

    expect(captured[0]?.context).toBe('ScrapeService:worker-2');
    expect(captured[0]?.level).toBe('debug');
  });

  it('records lifecycle events under the event field', async () => {
    getLogger('JobService').event(LogEvent.JOB_CREATED, 'Job created', { jobId: 'job001' });
    await flush();

    expect(captured[0]?.event).toBe(LogEvent.JOB_CREATED);
    expect(captured[0]?.jobId).toBe('job001');
  });

  it('serializes errors into structured metadata', async () => {
    getLogger('ScrapeService').error('Navigation failed', new Error('timeout'), { attempt: 2 });
    await flush();

    expect(captured[0]?.level).toBe('error');
    expect(captured[0]?.error?.message).toBe('timeout');
    expect(captured[0]?.attempt).toBe(2);
  });

  it('honours the configured level threshold', async () => {
    initializeLogging(new ConfigService(createTestEnv({ LOG_LEVEL: 'warn' })).get());
    addLogTransport(
      new transports.Stream({ stream: createCaptureStream(), format: format.json() }),
    );

    const logger = getLogger('Quiet');
    logger.debug('hidden');
    logger.info('hidden');
    logger.warn('shown');
    await flush();

    expect(captured.map((entry) => entry.message)).toEqual(['shown']);
  });
});
