/**
 * Domain validation helpers.
 *
 * Answers one question: does this URL look like an official business website,
 * or is it a social-media profile / directory listing that should not count?
 */

/** Hostnames (and hostname suffixes) that are never official websites. */
const NON_WEBSITE_HOSTS = new Set([
  'facebook.com',
  'fb.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'linkedin.com',
  'youtube.com',
  'youtu.be',
  'pinterest.com',
  'snapchat.com',
  'tiktok.com',
  'whatsapp.com',
  'telegram.org',
  't.me',
  // Directories / aggregators
  'justdial.com',
  'indiamart.com',
  'sulekha.com',
  'tradeindia.com',
  'yellowpages.com',
  'yelp.com',
  'tripadvisor.com',
  'zomato.com',
  'swiggy.com',
  'google.com',
  'maps.google.com',
  'maps.app.goo.gl',
  'goo.gl',
  'bit.ly',
  'linktr.ee',
]);

export interface NormalisedUrl {
  readonly href: string;
  readonly hostname: string;
  readonly isValid: boolean;
  readonly isOfficialWebsite: boolean;
}

/**
 * Parses and normalises a raw URL string.
 *
 * - Prepends `https://` when the scheme is missing.
 * - Strips UTM and common tracking query parameters.
 * - Classifies the URL as an official website or not.
 */
export function normaliseUrl(raw: string): NormalisedUrl {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { href: '', hostname: '', isValid: false, isOfficialWebsite: false };
  }

  // Prepend scheme if missing so URL() can parse it
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return { href: trimmed, hostname: '', isValid: false, isOfficialWebsite: false };
  }

  // Strip tracking params
  const TRACKING_PARAMS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
  for (const param of TRACKING_PARAMS) {
    parsed.searchParams.delete(param);
  }

  const hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const isOfficialWebsite = !isNonWebsiteHost(hostname);

  return {
    href: parsed.toString(),
    hostname,
    isValid: true,
    isOfficialWebsite,
  };
}

/** Returns true when the hostname matches a known non-website domain. */
function isNonWebsiteHost(hostname: string): boolean {
  if (NON_WEBSITE_HOSTS.has(hostname)) return true;
  // Also match subdomains, e.g. business.facebook.com
  for (const blocked of NON_WEBSITE_HOSTS) {
    if (hostname.endsWith(`.${blocked}`)) return true;
  }
  return false;
}

/**
 * Returns true when the string looks like a plausible domain name.
 * Used to validate domains extracted from Google Search results.
 */
export function isPlausibleDomain(value: string): boolean {
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/i.test(value);
}
