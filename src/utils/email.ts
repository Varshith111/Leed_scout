/**
 * Utility for extracting and prioritizing email addresses (especially Gmail).
 */

const NON_EMAIL_EXTENSIONS = /\.(png|jpg|jpeg|gif|webp|svg|css|js|woff|woff2|ttf|eot)$/i;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

const DUMMY_EMAILS = new Set([
  'user@domain.com',
  'email@domain.com',
  'name@domain.com',
  'name@company.com',
  'yourname@email.com',
  'example@example.com',
  'test@test.com',
  'admin@example.com',
  'someone@example.com',
  'john@doe.com',
  'info@domain.com',
]);

const DUMMY_DOMAINS = [
  'example.com',
  'domain.com',
  'sentry.io',
  'wixpress.com',
  'cloudflare.com',
  'googleapis.com',
  'duckduckgo.com',
  'w3.org',
  'schema.org',
  'yimg.com',
  'yahoo.com',
  'google.com',
  'bing.com',
  'bbbemail.org',
  'bbb.org',
];

/**
 * Extracts all valid email addresses from arbitrary text / HTML snippets.
 * Prioritises `@gmail.com` and `@googlemail.com` addresses.
 */
export function extractEmails(text?: string | null): string[] {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) ?? [];

  const cleaned = matches
    .map((e) => e.trim().toLowerCase())
    .filter((e) => {
      if (NON_EMAIL_EXTENSIONS.test(e)) return false;
      if (e.includes('%')) return false;
      if (e.length < 5 || e.length > 100) return false;
      if (DUMMY_EMAILS.has(e)) return false;
      if (DUMMY_DOMAINS.some((d) => e.endsWith('@' + d) || e.endsWith('.' + d))) return false;
      return true;
    });

  const unique = Array.from(new Set(cleaned));

  // Prioritise Gmail addresses to the top
  unique.sort((a, b) => {
    const aIsGmail = a.endsWith('@gmail.com') || a.endsWith('@googlemail.com');
    const bIsGmail = b.endsWith('@gmail.com') || b.endsWith('@googlemail.com');
    if (aIsGmail && !bIsGmail) return -1;
    if (!aIsGmail && bIsGmail) return 1;
    return 0;
  });

  return unique;
}

/**
 * Returns the best candidate email address (prioritizing Gmail).
 */
export function extractBestEmail(text?: string | null): string | undefined {
  const emails = extractEmails(text);
  return emails[0];
}
