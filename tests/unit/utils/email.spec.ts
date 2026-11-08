import { extractBestEmail, extractEmails } from '../../../src/utils/email';

describe('extractEmails', () => {
  it('extracts unique valid emails from text', () => {
    const text = 'Contact us at hello@example.com or support@business.org for help. Repeat hello@example.com';
    const result = extractEmails(text);
    expect(result).toEqual(['hello@example.com', 'support@business.org']);
  });

  it('filters out image extensions and invalid patterns', () => {
    const text = 'Ignore logo@2x.png and test@domain.jpg but keep real@company.com';
    const result = extractEmails(text);
    expect(result).toEqual(['real@company.com']);
  });

  it('returns an empty array when no emails exist', () => {
    expect(extractEmails('No email here!')).toEqual([]);
    expect(extractEmails(undefined)).toEqual([]);
  });
});

describe('extractBestEmail', () => {
  it('prioritizes Gmail addresses over other domains', () => {
    const text = 'Owner email: john.plumbing@gmail.com, office info@plumbingleads.com';
    const best = extractBestEmail(text);
    expect(best).toBe('john.plumbing@gmail.com');
  });

  it('prioritizes googlemail.com addresses as well', () => {
    const text = 'Contact info@firm.com or director@googlemail.com';
    const best = extractBestEmail(text);
    expect(best).toBe('director@googlemail.com');
  });

  it('returns the first available email if no Gmail address is present', () => {
    const text = 'Reach out at info@company.com or sales@company.com';
    const best = extractBestEmail(text);
    expect(best).toBe('info@company.com');
  });

  it('returns undefined if text is empty or has no emails', () => {
    expect(extractBestEmail('')).toBeUndefined();
    expect(extractBestEmail(undefined)).toBeUndefined();
  });
});

