import type { ILogger } from '../logger';
import { extractBestEmail } from '../utils/email';

export class EmailFinder {
  public constructor(
    private readonly timeoutMs: number,
    private readonly userAgent: string,
    private readonly logger: ILogger,
  ) {}

  /**
   * Discovers and extracts the most relevant contact email / Gmail for a business.
   *
   * Strategies applied in priority order:
   * 1. Inspect existing website or social profile URL (homepage + /contact).
   * 2. Search Yahoo for the business and inspect snippets and top candidate sites.
   * 3. Search Bing for the business contact snippets.
   */
  public async findEmail(
    name: string,
    city: string,
    websiteUrl?: string | null,
  ): Promise<string | undefined> {
    // 1. Direct website / social URL check
    if (websiteUrl?.trim()) {
      const fromSite = await this.checkWebsite(websiteUrl.trim());
      if (fromSite) return fromSite;
    }

    // 2. Web search via Yahoo
    const fromYahoo = await this.searchYahoo(name, city);
    if (fromYahoo) return fromYahoo;

    // 3. Web search via Bing
    const fromBing = await this.searchBing(name, city);
    if (fromBing) return fromBing;

    return undefined;
  }

  private async checkWebsite(rawUrl: string): Promise<string | undefined> {
    let target = rawUrl;
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    const html = await this.fetchHtml(target, this.timeoutMs);
    if (!html) return undefined;

    const email = extractBestEmail(html);
    if (email) return email;

    // Probe /contact or /about on custom domains (skip social platforms)
    try {
      const u = new URL(target);
      const isSocial = /facebook\.com|instagram\.com|yelp\.com|linkedin\.com/i.test(u.hostname);
      if (!isSocial) {
        const contactHtml = await this.fetchHtml(`${u.origin}/contact`, Math.min(this.timeoutMs, 4000));
        const contactEmail = extractBestEmail(contactHtml);
        if (contactEmail) return contactEmail;

        const aboutHtml = await this.fetchHtml(`${u.origin}/about`, Math.min(this.timeoutMs, 4000));
        const aboutEmail = extractBestEmail(aboutHtml);
        if (aboutEmail) return aboutEmail;
      }
    } catch {
      // Invalid URL syntax ignored
    }

    return undefined;
  }

  private async searchYahoo(name: string, city: string): Promise<string | undefined> {
    try {
      const cleanName = name.replace(/[^\w\s]/g, ' ').trim();
      const cleanCity = city.replace(/[^\w\s]/g, ' ').trim();
      const query = encodeURIComponent(`"${cleanName}" ${cleanCity}`);
      const url = `https://search.yahoo.com/search?p=${query}&n=10`;

      const html = await this.fetchHtml(url, this.timeoutMs);
      if (!html) return undefined;

      // Check snippet text directly
      const snippetEmail = extractBestEmail(html);
      if (snippetEmail) return snippetEmail;

      // Extract result links including Yahoo RU= redirects
      const rawLinks: string[] = [];
      const ruMatches = html.matchAll(/\/RU=([^/&]+)/g);
      for (const m of ruMatches) {
        try {
          if (m[1]) rawLinks.push(decodeURIComponent(m[1]));
        } catch {
          // Ignore malformed URI component
        }
      }
      const directLinks = html.match(/https?:\/\/[a-zA-Z0-9.\-_/]+/g) ?? [];
      rawLinks.push(...directLinks);

      const nameSlug = cleanName.toLowerCase().split(/\s+/)[0];
      const candidates = Array.from(new Set(rawLinks)).filter((l) => {
        const lower = l.toLowerCase();
        if (
          lower.includes('yahoo.com') ||
          lower.includes('google.com') ||
          lower.includes('bing.com') ||
          lower.includes('yimg.com')
        ) return false;
        if (
          lower.includes('wikipedia') ||
          lower.includes('mapquest') ||
          lower.includes('yellowpages') ||
          lower.includes('wheree.com') ||
          lower.includes('bbb.org')
        ) return false;
        const matchesSlug = nameSlug !== undefined && lower.includes(nameSlug);
        return matchesSlug || lower.includes('facebook.com');
      });

      const origins = Array.from(
        new Set(
          candidates.map((c) => {
            try { return new URL(c).origin; } catch { return c; }
          }),
        ),
      );

      for (const origin of origins.slice(0, 3)) {
        const originHtml = await this.fetchHtml(origin, Math.min(this.timeoutMs, 5000));
        if (originHtml) {
          const originEmail = extractBestEmail(originHtml);
          if (originEmail) return originEmail;
        }
      }
    } catch (error) {
      this.logger.debug('EmailFinder Yahoo search failed', {
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return undefined;
  }

  private async searchBing(name: string, city: string): Promise<string | undefined> {
    try {
      const cleanName = name.replace(/[^\w\s]/g, ' ').trim();
      const cleanCity = city.replace(/[^\w\s]/g, ' ').trim();
      const query = encodeURIComponent(`"${cleanName}" ${cleanCity} email OR contact OR @gmail.com`);
      const url = `https://www.bing.com/search?q=${query}`;

      const html = await this.fetchHtml(url, this.timeoutMs);
      if (!html) return undefined;

      return extractBestEmail(html);
    } catch {
      return undefined;
    }
  }

  private async fetchHtml(url: string, timeoutMs: number): Promise<string | undefined> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'follow',
      });
      if (!res.ok) return undefined;
      return await res.text();
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
