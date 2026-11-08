import type { AppConfig } from '../config/config';
import type { ILogger } from '../logger';
import { ProviderName } from '../models/enums';
import { GoogleMapsProvider } from './google/GoogleMapsProvider';
import { JustDialProvider } from './justdial/JustDialProvider';
import { IndiaMartProvider } from './indiamart/IndiaMartProvider';
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
      return new JustDialProvider(
        config.scraper,
        config.proxy,
        config.paths,
        logger.child('JustDialProvider'),
      );

    case ProviderName.INDIAMART:
      return new IndiaMartProvider(
        config.scraper,
        config.proxy,
        config.paths,
        logger.child('IndiaMartProvider'),
      );
  }
}
