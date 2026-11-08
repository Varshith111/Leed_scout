import {
  type AppConfig,
  ConfigService,
  loadDotEnv,
  readPackageVersion,
  setConfigService,
} from '../config';
import { DatabaseService, type IDatabaseService } from '../database';
import { type ILogger, LogEvent, closeLogging, getLogger, initializeLogging } from '../logger';
import { ensureDirectorySync } from '../utils/fs';

/**
 * Composition root.
 *
 * Wiring lives here and only here: environment loading, configuration parsing,
 * runtime directory creation and logger construction. Commands receive the
 * resulting {@link AppContext} through their constructors, which keeps them free
 * of hidden global state and trivially unit-testable.
 */
export interface AppContext {
  readonly version: string;
  readonly configService: ConfigService;
  readonly config: AppConfig;
  readonly logger: ILogger;
  readonly database: IDatabaseService;
}

/** Creates the writable runtime directories declared in the configuration. */
export function ensureRuntimeDirectories(config: AppConfig): void {
  ensureDirectorySync(config.paths.output);
  ensureDirectorySync(config.paths.screenshots);
  if (config.logging.toFile) {
    ensureDirectorySync(config.paths.logs);
  }
}

/**
 * Boots the application.
 *
 * @throws {ConfigurationError} when the environment fails validation.
 */
export function bootstrap(): AppContext {
  loadDotEnv();

  const configService = new ConfigService();
  setConfigService(configService);

  const config = configService.get();
  ensureRuntimeDirectories(config);
  initializeLogging(config);

  const logger = getLogger('leadscout');
  logger.event(LogEvent.CONFIG_LOADED, 'Configuration loaded', {
    environment: config.env,
    logLevel: config.logging.level,
  });

  const database = new DatabaseService(config.database, logger);

  return {
    version: readPackageVersion(),
    configService,
    config,
    logger,
    database,
  };
}

/** Flushes logs and releases resources acquired during {@link bootstrap}. */
export async function shutdown(context: AppContext | undefined): Promise<void> {
  context?.logger.event(LogEvent.APPLICATION_SHUTDOWN, 'LeadScout shutting down');
  await context?.database.shutdown();
  await closeLogging();
}
