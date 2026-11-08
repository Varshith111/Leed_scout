import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { Browser, BrowserContext, BrowserType as PlaywrightBrowserType, Page } from 'playwright';
import { chromium, firefox, webkit } from 'playwright';

import type { ScraperConfig, ProxyConfig, PathsConfig } from '../../config/config';
import type { ILogger } from '../../logger';
import { LogEvent } from '../../logger';
import { BrowserType } from '../../models/enums';
import { ScraperError } from '../../utils/errors';
import { sleep, fileTimestamp } from '../../utils/time';
import type { IProvider } from './IProvider';

export abstract class BaseProvider implements IProvider {
  public abstract readonly name: IProvider['name'];

  private browser: Browser | undefined;
  private context: BrowserContext | undefined;

  // Token-bucket rate limiter state
  private tokens: number;
  private lastRefill: number;

  protected constructor(
    protected readonly scraperConfig: ScraperConfig,
    protected readonly proxyConfig: ProxyConfig,
    protected readonly pathsConfig: PathsConfig,
    protected readonly logger: ILogger,
  ) {
    this.tokens = scraperConfig.rateLimitPerMinute;
    this.lastRefill = Date.now();
  }

  public abstract search(params: IProvider['search'] extends (p: infer P) => unknown ? P : never): ReturnType<IProvider['search']>;

  public async close(): Promise<void> {
    await this.context?.close();
    await this.browser?.close();
    this.context = undefined;
    this.browser = undefined;
  }

  // ── Playwright helpers ────────────────────────────────────────────────────

  protected async getPage(): Promise<Page> {
    if (this.context === undefined) {
      this.browser = await this.launchBrowser();
      this.context = await this.browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        locale: 'en-US',
        timezoneId: 'Asia/Kolkata',
        viewport: { width: 1280, height: 800 },
      });
    }

    return this.context.newPage();
  }

  protected async navigate(page: Page, url: string): Promise<void> {
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: this.scraperConfig.navigationTimeoutMs,
    });
  }

  /** Waits for `selector` with the configured operation timeout. */
  protected async waitFor(page: Page, selector: string): Promise<void> {
    await page.waitForSelector(selector, { timeout: this.scraperConfig.timeoutMs });
  }

  // ── Rate limiting ─────────────────────────────────────────────────────────

  /** Consumes one token, sleeping until one is available. */
  protected async throttle(): Promise<void> {
    this.refillTokens();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    // Calculate wait until next token is available
    const msPerToken = (60 * 1000) / this.scraperConfig.rateLimitPerMinute;
    await sleep(msPerToken);
    this.tokens = 0;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refill = (elapsed / 60_000) * this.scraperConfig.rateLimitPerMinute;
    this.tokens = Math.min(this.scraperConfig.rateLimitPerMinute, this.tokens + refill);
    this.lastRefill = now;
  }

  // ── Retry ─────────────────────────────────────────────────────────────────

  protected async withRetry<T>(
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.scraperConfig.retryCount + 1; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt <= this.scraperConfig.retryCount) {
          this.logger.event(LogEvent.RETRY, `Retrying ${label}`, { attempt });
          await sleep(1_000 * attempt);
        }
      }
    }

    throw new ScraperError(
      `${label} failed after ${String(this.scraperConfig.retryCount + 1)} attempts`,
      {},
      lastError,
    );
  }

  // ── Screenshots ───────────────────────────────────────────────────────────

  protected async captureScreenshot(page: Page, label: string): Promise<void> {
    if (!this.scraperConfig.screenshotsEnabled) return;

    try {
      await mkdir(this.pathsConfig.screenshots, { recursive: true });
      const filename = `${this.name}-${label}-${fileTimestamp()}.png`;
      const path = join(this.pathsConfig.screenshots, filename);
      const buffer = await page.screenshot({ fullPage: false });
      await writeFile(path, buffer);
      this.logger.event(LogEvent.SCREENSHOT_CAPTURED, 'Screenshot saved', { path });
    } catch {
      // Screenshot failures must never mask the original error.
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async launchBrowser(): Promise<Browser> {
    const engine = this.pickEngine();

    const proxyUrl = this.proxyConfig.urls[0];
    const launchOptions = {
      headless: this.scraperConfig.headless,
      ...(this.proxyConfig.enabled && proxyUrl !== undefined
        ? {
            proxy: {
              server: proxyUrl,
              ...(this.proxyConfig.username !== undefined
                ? { username: this.proxyConfig.username }
                : {}),
              ...(this.proxyConfig.password !== undefined
                ? { password: this.proxyConfig.password }
                : {}),
            },
          }
        : {}),
    };

    return engine.launch(launchOptions);
  }

  private pickEngine(): PlaywrightBrowserType {
    switch (this.scraperConfig.browserType) {
      case BrowserType.FIREFOX:
        return firefox;
      case BrowserType.WEBKIT:
        return webkit;
      default:
        return chromium;
    }
  }
}
