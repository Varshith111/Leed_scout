import type { Page } from 'playwright';

import type { ScraperConfig, ProxyConfig, PathsConfig } from '../../config/config';
import type { ILogger } from '../../logger';
import { LogEvent } from '../../logger';
import { ProviderName } from '../../models/enums';
import { sleep } from '../../utils/time';
import { BaseProvider } from '../base/BaseProvider';
import type { BusinessData, SearchParams } from '../base/IProvider';

interface JustDialCard {
  readonly name: string;
  readonly rating?: number | undefined;
  readonly reviewCount?: number | undefined;
  readonly address?: string | undefined;
  readonly email?: string | undefined;
  readonly phone?: string | undefined;
  readonly website?: string | undefined;
}

export class JustDialProvider extends BaseProvider {
  public readonly name = ProviderName.JUSTDIAL;

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
      this.logger.event(LogEvent.SEARCH_STARTED, 'JustDial search started', {
        category: params.category,
        city: params.city,
        url,
      });

      await this.withRetry('navigate to JustDial', () => this.navigate(page, url));
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

          this.logger.event(LogEvent.BUSINESS_PARSED, 'Extracted JustDial business', {
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
            reviewCount: card.reviewCount,
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
      this.logger.error('JustDial scrape failed', error);
      throw error;
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  private buildSearchUrl(params: SearchParams): string {
    const city = encodeURIComponent(params.city.toLowerCase().replace(/\s+/g, '-'));
    const category = encodeURIComponent(params.category.toLowerCase().replace(/\s+/g, '-'));
    return `https://www.justdial.com/${city}/${category}`;
  }

  private async dismissPopups(page: Page): Promise<void> {
    try {
      const closeButtons = await page.$$('span[class*="close"], button[class*="close"], #best_deal_div .close');
      for (const btn of closeButtons) {
        if (await btn.isVisible()) {
          await btn.click().catch(() => undefined);
        }
      }
    } catch {
      // Ignored
    }
  }

  private async extractCardsFromPage(page: Page): Promise<JustDialCard[]> {
    return page.$$eval(
      'div[class*="resultbox"], div[class*="card"]',
      (elements) => {
        const results: JustDialCard[] = [];
        for (const el of elements) {
          const nameEl = el.querySelector('h2, [class*="resultbox_title"], [class*="heading"], [class*="store-name"]');
          const name = nameEl?.textContent?.trim();
          if (!name) continue;

          const ratingEl = el.querySelector('[class*="rating"], [class*="rate"], [class*="star"]');
          const ratingMatch = ratingEl?.textContent?.match(/\d+(\.\d+)?/);
          const rating = ratingMatch ? parseFloat(ratingMatch[0]) : undefined;

          const reviewEl = el.querySelector('[class*="votes"], [class*="review"], [class*="rating-count"]');
          const reviewText = reviewEl?.textContent?.replace(/[^\d]/g, '');
          const reviewCount = reviewText ? parseInt(reviewText, 10) : undefined;

          const addressEl = el.querySelector('[class*="address"], [class*="locat"], [class*="address-info"]');
          const address = addressEl?.textContent?.trim() ?? undefined;

          const phoneEl = el.querySelector('a[href^="tel:"], [class*="call"], [class*="contact"], [class*="phone"]');
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

          const websiteEl = el.querySelector('a[href*="http"]:not([href*="justdial.com"])');
          const website = websiteEl?.getAttribute('href') ?? undefined;

          results.push({ name, rating, reviewCount, address, email, phone, website });
        }
        return results;
      },
    );
  }
}
