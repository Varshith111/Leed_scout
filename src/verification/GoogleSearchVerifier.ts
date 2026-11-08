import type { VerificationConfig } from '../config/config';
import type { ILogger } from '../logger';
import { normaliseUrl, isPlausibleDomain } from './DomainValidator';
import { extractBestEmail } from '../utils/email';

export interface SearchVerificationResult {
  readonly websiteFound: boolean;
  readonly websiteUrl?: string | undefined;
  readonly email?: string | undefined;
}

export class GoogleSearchVerifier {
  public constructor(
    private readonly config: VerificationConfig,
    private readonly logger: ILogger,
  ) {}

  /**
   * Searches Google for `"<name>" "<city>"` and inspects the top results.
   *
   * Returns the first result URL that looks like an official website.
   * Uses the JSON-LD / meta approach via the search API — no browser needed.
   */
  public async findWebsite(
    name: string,
    city: string,
  ): Promise<SearchVerificationResult> {
    const query = encodeURIComponent(`"${name}" "${city}" official website`);
    const url = `https://www.google.com/search?q=${query}&num=${String(this.config.maxSearchResults)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.config.userAgent,
          Accept: 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        this.logger.debug('Google search returned non-OK status', {
          status: response.status,
          name,
          city,
        });
        return { websiteFound: false };
      }

      const html = await response.text();
      const email = extractBestEmail(html);
      const websiteUrl = this.extractFirstOfficialUrl(html);

      if (websiteUrl !== undefined) {
        this.logger.debug('Google search found website', { name, city, websiteUrl, email });
        return { websiteFound: true, websiteUrl, email };
      }

      return { websiteFound: false, email };
    } catch (error) {
      this.logger.debug('Google search verifier failed', {
        name,
        city,
        error: error instanceof Error ? error.message : String(error),
      });
      return { websiteFound: false };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Specifically searches for email / Gmail contact for a business without a website.
   */
  public async findEmail(name: string, city: string): Promise<string | undefined> {
    const query = encodeURIComponent(`"${name}" "${city}" "gmail.com" OR "email" OR "contact"`);
    const url = `https://www.google.com/search?q=${query}&num=5`;

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': this.config.userAgent,
          Accept: 'text/html',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) return undefined;
      const html = await response.text();
      return extractBestEmail(html);
    } catch {
      return undefined;
    }
  }

  /**
   * Extracts href values from Google search result anchors in the raw HTML.
   * Google wraps organic results in <a href="/url?q=ACTUAL_URL&..."> tags.
   */
  private extractFirstOfficialUrl(html: string): string | undefined {
    // Match Google's redirect wrapper: /url?q=https://...&
    const pattern = /\/url\?q=(https?:\/\/[^&"]+)/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(html)) !== null) {
      const raw = match[1];
      if (raw === undefined) continue;

      let decoded: string;
      try {
        decoded = decodeURIComponent(raw);
      } catch {
        continue;
      }

      const normalised = normaliseUrl(decoded);
      if (normalised.isValid && normalised.isOfficialWebsite && isPlausibleDomain(normalised.hostname)) {
        return normalised.href;
      }
    }

    return undefined;
  }
}
