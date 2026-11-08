import type { Page } from 'playwright';

import type { ScraperConfig, ProxyConfig, PathsConfig } from '../../config/config';
import type { ILogger } from '../../logger';
import { LogEvent } from '../../logger';
import { ProviderName } from '../../models/enums';
import { sleep } from '../../utils/time';
import { BaseProvider } from '../base/BaseProvider';
import type { BusinessData, SearchParams } from '../base/IProvider';

interface IndiaMartCard {
  readonly name: string;
  readonly rating?: number | undefined;
  readonly address?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly website?: string | undefined;
}

export class IndiaMartProvider extends BaseProvider {
  public readonly name = ProviderName.INDIAMART;

  public constructor(
    scraperConfig: ScraperConfig,
    proxyConfig: ProxyConfig,
    pathsConfig: PathsConfig,
    logger: ILogger,
  ) {
    super(scraperConfig, proxyConfig, pathsConfig, logger);
  }

  public async *search(params: SearchParams): AsyncGenerator<BusinessData> {
    const page = await this.getPage();

    try {
      const url = this.buildSearchUrl(params);
      this.logger.event(LogEvent.SEARCH_STARTED, 'IndiaMART search started', {
        category: params.category,
        city: params.city,
        url,
      });

      await this.withRetry('navigate to IndiaMART', () => this.navigate(page, url));
      await this.dismissPopups(page);

      let collected = 0;
      let scrolls = 0;
      const seen = new Set<string>();

      while (collected < params.limit && scrolls < this.scraperConfig.maxScrolls) {
        await this.throttle();

        const cards = await this.extractCardsFromPage(page);
        let newFound = 0;

        for (const card of cards) {
          if (collected >= params.limit) break;

          const key = card.name.toLowerCase();
          if (seen.has(key)) continue;

          seen.add(key);
          collected += 1;
          newFound += 1;

          this.logger.event(LogEvent.BUSINESS_PARSED, 'Extracted IndiaMART business', {
            name: card.name,
            collected,
          });

          yield {
            name: card.name,
            category: params.category,
            city: params.city,
            state: params.state,
            country: params.country ?? 'India',
            rating: card.rating,
            address: card.address,
            email: card.email,
            phone: card.phone,
            website: card.website,
          };
        }

        const prevHeight = await page.evaluate(() => document.body.scrollHeight);
        await page.evaluate(() => { window.scrollBy(0, 1200); });
        await sleep(this.scraperConfig.scrollDelayMs);
        const newHeight = await page.evaluate(() => document.body.scrollHeight);

        scrolls += 1;
        if (newHeight === prevHeight && newFound === 0) {
          break;
        }
      }
    } catch (error) {
      await this.captureScreenshot(page, 'search-failure');
      this.logger.error('IndiaMART scrape failed', error);
      throw error;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private buildSearchUrl(params: SearchParams): string {
    const query = encodeURIComponent(params.category);
    const city = encodeURIComponent(params.city);
    return `https://dir.indiamart.com/search.mp?ss=${query}&cq=${city}`;
  }

  private async dismissPopups(page: Page): Promise<void> {
    try {
      const closeButtons = await page.$$('.glc, .close, button[aria-label="Close"]');
      for (const btn of closeButtons) {
        if (await btn.isVisible()) {
          await btn.click().catch(() => undefined);
        }
      }
    } catch {
      // Ignored
    }
  }

  private async extractCardsFromPage(page: Page): Promise<IndiaMartCard[]> {
    return page.$$eval(
      'div[class*="card"], div[class*="listing"], .clg, .m-card',
      (elements) => {
        const results: IndiaMartCard[] = [];
        for (const el of elements) {
          const nameEl = el.querySelector('.gpname, [class*="company"], a[href*="indiamart.com/"], h2');
          const name = nameEl?.textContent?.trim();
          if (!name) continue;

          const ratingEl = el.querySelector('.rating, [class*="star"], [class*="rate"]');
          const ratingMatch = ratingEl?.textContent?.match(/\d+(\.\d+)?/);
          const rating = ratingMatch ? parseFloat(ratingMatch[0]) : undefined;

          const addressEl = el.querySelector('.cty-name, [class*="city"], .loc-name, [class*="address"]');
          const address = addressEl?.textContent?.trim() ?? undefined;

          const phoneEl = el.querySelector('.pns_h, a[href^="tel:"], [class*="contact"]');
          let phone = phoneEl?.getAttribute('href')?.replace('tel:', '').trim();
          if (!phone) {
            const phoneMatch = phoneEl?.textContent?.match(/(\+?\d[\d\s-]{8,})/);
            phone = phoneMatch?.[1] ? phoneMatch[1].trim() : undefined;
          }

          const mailtoEl = el.querySelector('a[href^="mailto:"]');
          let email = mailtoEl?.getAttribute('href')?.replace(/^mailto:/i, '').split('?')[0]?.trim();
          if (!email && el.textContent) {
            const emailMatch = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.exec(el.textContent);
            email = emailMatch?.[0];
          }

          const websiteEl = el.querySelector('a[href*="http"]:not([href*="indiamart.com"])');
          const website = websiteEl?.getAttribute('href') ?? undefined;

          results.push({ name, rating, address, email, phone, website });
        }
        return results;
      },
    );
  }
}
