import type { AppConfig } from '../config/config';
import type { ILogger } from '../logger';
import { ProviderName } from '../models/enums';
import { ValidationError } from '../utils/errors';
import { GoogleMapsProvider } from './google/GoogleMapsProvider';
import type { IProvider } from './base/IProvider';

export type { IProvider, BusinessData, SearchParams } from './base/IProvider';

/** Creates the provider for the given name, injecting shared config. */
export function createProvider(
  providerName: ProviderName,
  config: AppConfig,
  logger: ILogger,
): IProvider {
  switch (providerName) {
    case ProviderName.GOOGLE:
      return new GoogleMapsProvider(
        config.scraper,
        config.proxy,
        config.paths,
        logger.child('GoogleMapsProvider'),
      );

    case ProviderName.JUSTDIAL:
    case ProviderName.INDIAMART:
      throw new ValidationError(
        `Provider "${providerName}" is not yet implemented. Available: google`,
        { provider: providerName },
      );
  }
}
