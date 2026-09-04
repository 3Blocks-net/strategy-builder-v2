import { describe, expect, it } from 'vitest';
import { isLanguage, resolveLanguage } from '../languages';

describe('resolveLanguage', () => {
  it('picks the first supported language from the browser preferences', () => {
    expect(resolveLanguage(['de-AT', 'en-GB'])).toBe('de');
    expect(resolveLanguage(['en-GB', 'de-DE'])).toBe('en');
  });

  it('ignores the region and matches on the language itself', () => {
    expect(resolveLanguage(['DE-ch'])).toBe('de');
  });

  it('skips unsupported languages instead of failing', () => {
    expect(resolveLanguage(['fr-FR', 'de'])).toBe('de');
  });

  it('falls back to English when nothing matches or nothing is known', () => {
    expect(resolveLanguage(['fr-FR', 'es'])).toBe('en');
    expect(resolveLanguage([])).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
    expect(resolveLanguage([undefined])).toBe('en');
  });
});

describe('isLanguage', () => {
  it('accepts only the languages the UI ships in', () => {
    expect(isLanguage('de')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('fr')).toBe(false);
    expect(isLanguage(null)).toBe(false);
  });
});
