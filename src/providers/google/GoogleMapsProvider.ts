import type { Page } from 'playwright';

import type { ScraperConfig, ProxyConfig, PathsConfig } from '../../config/config';
import type { ILogger } from '../../logger';
import { LogEvent } from '../../logger';
import { ProviderName } from '../../models/enums';
import { sleep } from '../../utils/time';
import { BaseProvider } from '../base/BaseProvider';
import type { BusinessData, SearchParams } from '../base/IProvider';
import * as S from './selectors';

export class GoogleMapsProvider extends BaseProvider {
  public readonly name = ProviderName.GOOGLE;

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
      this.logger.event(LogEvent.SEARCH_STARTED, 'Google Maps search started', {
        category: params.category,
        city: params.city,
        url,
      });

      await this.withRetry('navigate to Google Maps', () => this.navigate(page, url));
      await this.dismissConsent(page);
      await this.waitFor(page, S.RESULTS_PANEL);

      let collected = 0;
      let scrolls = 0;
      // Normalised keys: place name lowercased, used to skip duplicates across
      // scroll batches. Google Maps hrefs embed coordinates that shift between
      // renders, so href alone is not a stable dedup key.
      const seen = new Set<string>();

      while (collected < params.limit && scrolls < this.scraperConfig.maxScrolls) {
        // Re-query cards on every iteration — handles returned from a previous
        // $$ call go stale once the DOM updates after a card click + back nav.
        const hrefs = await this.collectCardHrefs(page);

        let newThisScroll = 0;

        for (const href of hrefs) {
          if (collected >= params.limit) break;

          // Normalise: strip coordinates and query params, keep only the place path
          const key = this.normalisePlaceHref(href);
          if (seen.has(key)) continue;
          seen.add(key);
          newThisScroll += 1;

          await this.throttle();

          const business = await this.withRetry('extract business', () =>
            this.extractCard(page, href, params),
          ).catch((err: unknown) => {
            this.logger.warn('Failed to extract business, skipping', {
              href,
              reason: err instanceof Error ? err.message : String(err),
            });
            // Capture screenshot for debugging without blocking the scrape
            void this.captureScreenshot(page, 'extract-error');
            return null;
          });

          if (business === null) {
            this.logger.event(LogEvent.BUSINESS_SKIPPED, 'Business skipped', { href });
            continue;
          }

          this.logger.event(LogEvent.BUSINESS_PARSED, 'Business parsed', { name: business.name });
          collected += 1;
          yield business;
        }

        if (collected >= params.limit) break;

        // Check for end-of-results marker. We wait briefly after each scroll
        // so the marker has time to render before we check.
        const ended = await this.isEndOfResults(page);
        if (ended) {
          this.logger.info('Reached end of Google Maps results', { scrolls, collected });
          break;
        }

        // If this scroll produced zero new cards the panel may be loading —
        // wait one extra scroll delay before trying again.
        if (newThisScroll === 0) {
          await sleep(this.scraperConfig.scrollDelayMs);
        }

        await this.scrollPanel(page);
        scrolls += 1;
        this.logger.event(LogEvent.PAGE_SCROLLED, 'Results panel scrolled', { scrolls, collected });
        await sleep(this.scraperConfig.scrollDelayMs);
      }

      this.logger.event(LogEvent.SEARCH_COMPLETED, 'Google Maps search completed', {
        collected,
        scrolls,
      });
    } finally {
      await page.close();
    }
  }

  // ── Card collection ───────────────────────────────────────────────────────

  /** Returns all visible card hrefs without holding ElementHandles. */
  private async collectCardHrefs(page: Page): Promise<string[]> {
    return page.$$eval(S.RESULT_CARD, (anchors) =>
      anchors
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => h.includes('/maps/place/')),
    );
  }

  /**
   * Strips the coordinate fragment and query string from a Google Maps place
   * URL so the same business always produces the same dedup key regardless of
   * how the URL was rendered.
   *
   * Input:  https://www.google.com/maps/place/Cafe+Coffee+Day/@17.4,78.4,17z/data=...
   * Output: /maps/place/cafe+coffee+day/
   */
  private normalisePlaceHref(href: string): string {
    try {
      const url = new URL(href);
      // Keep only the /maps/place/<name>/ segment, lowercased
      const match = /^(\/maps\/place\/[^/]+\/)/.exec(url.pathname);
      return match?.[1]?.toLowerCase() ?? url.pathname.toLowerCase();
    } catch {
      return href.toLowerCase();
    }
  }

  // ── Card extraction ───────────────────────────────────────────────────────

  /**
   * Navigates directly to the place URL, extracts data, then goes back to the
   * search results. Using direct navigation instead of clicking an ElementHandle
   * avoids stale-handle errors entirely.
   */
  private async extractCard(
    page: Page,
    href: string,
    params: SearchParams,
  ): Promise<BusinessData> {
    await page.goto(href, {
      waitUntil: 'domcontentloaded',
      timeout: this.scraperConfig.navigationTimeoutMs,
    });

    await page.waitForSelector(S.DETAIL_NAME, { timeout: this.scraperConfig.timeoutMs });

    const name = await this.readText(page, S.DETAIL_NAME);
    if (name === null || name.trim() === '') {
      throw new Error('Business name not found on detail page');
    }

    const [category, address, phone, website, ratingText, reviewText] = await Promise.all([
      this.readText(page, S.DETAIL_CATEGORY),
      this.readAttribute(page, S.DETAIL_ADDRESS, 'aria-label'),
      this.readAttribute(page, S.DETAIL_PHONE, 'data-item-id'),
      this.readAttribute(page, S.DETAIL_WEBSITE, 'href'),
      this.readText(page, S.DETAIL_RATING),
      this.readAttribute(page, S.DETAIL_REVIEW_COUNT, 'aria-label'),
    ]);

    const phoneClean = phone?.replace('phone:tel:', '').trim() ?? undefined;
    const rating = ratingText !== null ? parseFloat(ratingText) : undefined;
    const reviewCount = reviewText !== null ? this.parseReviewCount(reviewText) : undefined;
    const mapsUrl = page.url().includes('/maps/place/') ? page.url() : href;
    const placeId = this.extractPlaceId(mapsUrl);

    // Navigate back to the search results list
    await page.goBack({
      waitUntil: 'domcontentloaded',
      timeout: this.scraperConfig.navigationTimeoutMs,
    });

    // Wait for the results panel to be present again before continuing
    await page
      .waitForSelector(S.RESULTS_PANEL, { timeout: this.scraperConfig.timeoutMs })
      .catch(() => undefined);

    return {
      providerBusinessId: placeId,
      name: name.trim(),
      category: category?.trim() ?? params.category,
      phone: phoneClean,
      website: website ?? undefined,
      address: address?.trim() ?? undefined,
      city: params.city,
      state: params.state,
      country: params.country,
      rating: Number.isFinite(rating) ? rating : undefined,
      reviewCount,
      googleMapsUrl: mapsUrl,
      rawData: { mapsUrl, ratingText, reviewText },
    };
  }

  // ── Scroll helpers ────────────────────────────────────────────────────────

  private async scrollPanel(page: Page): Promise<void> {
    await page.evaluate((selector) => {
      const panel = document.querySelector(selector);
      if (panel !== null) {
        panel.scrollTop = panel.scrollHeight;
      }
    }, S.RESULTS_PANEL);
  }

  /**
   * Returns true when Google Maps has rendered the end-of-results marker.
   * Waits up to 1 s so the marker has time to appear after the last scroll.
   */
  private async isEndOfResults(page: Page): Promise<boolean> {
    try {
      await page.waitForSelector(S.END_OF_RESULTS, { timeout: 1_000 });
      return true;
    } catch {
      return false;
    }
  }

  // ── Misc helpers ──────────────────────────────────────────────────────────

  private buildSearchUrl(params: SearchParams): string {
    const query = [params.category, params.city, params.state, params.country]
      .filter(Boolean)
      .join(', ');
    return `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
  }

  private async dismissConsent(page: Page): Promise<void> {
    try {
      const btn = await page.$(S.CONSENT_BUTTON);
      if (btn !== null) {
        await btn.click();
        await sleep(500);
      }
    } catch {
      // Consent dialog is region-specific; absence is not an error.
    }
  }

  private async readText(page: Page, selector: string): Promise<string | null> {
    try {
      const el = await page.$(selector);
      return el !== null ? ((await el.textContent())?.trim() ?? null) : null;
    } catch {
      return null;
    }
  }

  private async readAttribute(
    page: Page,
    selector: string,
    attribute: string,
  ): Promise<string | null> {
    try {
      const el = await page.$(selector);
      return el !== null ? await el.getAttribute(attribute) : null;
    } catch {
      return null;
    }
  }

  private parseReviewCount(text: string): number | undefined {
    const match = /[\d,]+/.exec(text.replace(/[()]/g, ''));
    if (match === null) return undefined;
    const n = parseInt(match[0].replace(/,/g, ''), 10);
    return Number.isFinite(n) ? n : undefined;
  }

  private extractPlaceId(url: string): string | undefined {
    const match = /!1s(ChIJ[^!]+)/.exec(url);
    return match?.[1];
  }
}
