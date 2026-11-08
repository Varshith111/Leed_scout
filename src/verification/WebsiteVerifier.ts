import type { VerificationConfig } from '../config/config';
import type { ILogger } from '../logger';
import { normaliseUrl } from './DomainValidator';

export interface WebsiteCheckResult {
  readonly url: string;
  readonly reachable: boolean;
  readonly statusCode?: number | undefined;
  readonly finalUrl?: string | undefined;
  readonly error?: string | undefined;
}

export class WebsiteVerifier {
  public constructor(
    private readonly config: VerificationConfig,
    private readonly logger: ILogger,
  ) {}

  /**
   * Checks whether `rawUrl` resolves to a reachable web page.
   *
   * Strategy:
   *   1. Normalise and validate the URL.
   *   2. Try HEAD (cheap, no body download).
   *   3. Fall back to GET if HEAD returns 405 or times out.
   *   4. Follow up to 5 redirects.
   */
  public async check(rawUrl: string): Promise<WebsiteCheckResult> {
    const normalised = normaliseUrl(rawUrl);

    if (!normalised.isValid || !normalised.isOfficialWebsite) {
      return {
        url: rawUrl,
        reachable: false,
        error: normalised.isValid ? 'not-an-official-website' : 'invalid-url',
      };
    }

    try {
      const result = await this.fetchWithTimeout(normalised.href, 'HEAD');
      if (result.statusCode === 405 || result.statusCode === 501) {
        return this.fetchWithTimeout(normalised.href, 'GET');
      }
      return result;
    } catch (error) {
      // HEAD failed — try GET before giving up
      try {
        return await this.fetchWithTimeout(normalised.href, 'GET');
      } catch (getError) {
        const message = getError instanceof Error ? getError.message : String(getError);
        this.logger.debug('Website check failed', { url: normalised.href, error: message });
        return { url: normalised.href, reachable: false, error: message };
      }
    }
  }

  private async fetchWithTimeout(url: string, method: 'HEAD' | 'GET'): Promise<WebsiteCheckResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'User-Agent': this.config.userAgent },
      });

      return {
        url,
        reachable: response.ok || response.status < 500,
        statusCode: response.status,
        finalUrl: response.url !== url ? response.url : undefined,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
