/**
 * Canonical log event names.
 *
 * Every meaningful lifecycle step logs one of these under the `event` field, so
 * logs stay greppable and the `Log` table (Phase 2) can be queried by event
 * type instead of by free-text message.
 */
export const LogEvent = {
  APPLICATION_START: 'application.start',
  APPLICATION_SHUTDOWN: 'application.shutdown',
  CONFIG_LOADED: 'config.loaded',
  CONFIG_UPDATED: 'config.updated',

  DATABASE_CONNECTED: 'database.connected',
  DATABASE_DISCONNECTED: 'database.disconnected',

  JOB_CREATED: 'job.created',
  JOB_STARTED: 'job.started',
  JOB_PAUSED: 'job.paused',
  JOB_RESUMED: 'job.resumed',
  JOB_CANCELLED: 'job.cancelled',
  JOB_COMPLETED: 'job.completed',
  JOB_FAILED: 'job.failed',

  SEARCH_STARTED: 'scrape.search.started',
  SEARCH_COMPLETED: 'scrape.search.completed',
  PAGE_SCROLLED: 'scrape.page.scrolled',
  BUSINESS_PARSED: 'scrape.business.parsed',
  BUSINESS_SAVED: 'scrape.business.saved',
  BUSINESS_SKIPPED: 'scrape.business.skipped',

  VERIFICATION_STARTED: 'verify.started',
  VERIFICATION_COMPLETED: 'verify.completed',
  WEBSITE_FOUND: 'verify.website.found',
  WEBSITE_MISSING: 'verify.website.missing',
  DUPLICATE_MERGED: 'verify.duplicate.merged',

  EXPORT_STARTED: 'export.started',
  EXPORT_FINISHED: 'export.finished',

  RETRY: 'runtime.retry',
  SCREENSHOT_CAPTURED: 'runtime.screenshot',
  RATE_LIMITED: 'runtime.rate_limited',
  ERROR: 'runtime.error',
} as const;

export type LogEvent = (typeof LogEvent)[keyof typeof LogEvent];
