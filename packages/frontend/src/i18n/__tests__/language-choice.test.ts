import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LANGUAGE_STORAGE_KEY,
  currentLanguage,
  detectInitialLanguage,
  i18n,
  setLanguage,
} from '..';

/** Pretends the browser is configured with these languages, in this order. */
function browserLanguages(tags: string[]) {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(tags);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(tags[0] ?? 'en-US');
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(async () => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  await setLanguage('en');
});

describe('starting language', () => {
  it('follows the browser when the visitor has never chosen', () => {
    browserLanguages(['de-DE', 'en-US']);
    expect(detectInitialLanguage()).toBe('de');
  });

  it('falls back to English for a browser language the app does not ship', () => {
    browserLanguages(['fr-FR']);
    expect(detectInitialLanguage()).toBe('en');
  });

  it('prefers the visitor\'s own choice over the browser setting', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'de');
    browserLanguages(['en-US']);
    expect(detectInitialLanguage()).toBe('de');
  });

  it('ignores a stored value that is not a shipped language', () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'klingon');
    browserLanguages(['en-US']);
    expect(detectInitialLanguage()).toBe('en');
  });
});

describe('switching language', () => {
  it('survives a reload: the choice is written to storage', async () => {
    await setLanguage('de');
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('de');
    // A reload starts from storage again.
    expect(detectInitialLanguage()).toBe('de');
    expect(currentLanguage()).toBe('de');
  });

  it('tells assistive technology which language the page is in', async () => {
    await setLanguage('de');
    expect(document.documentElement.lang).toBe('de');
    await setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });
});

describe('missing translations', () => {
  it('shows the English phrase instead of a raw key', async () => {
    // A phrase that only the English catalog carries. (An unknown key cannot
    // reach the UI at all: `t()` is typed against the English catalog, so the
    // build rejects it — hence the cast needed here.)
    i18n.addResourceBundle(
      'en',
      'translation',
      { testOnly: { untranslated: 'Only in English' } },
      true,
      true,
    );

    await setLanguage('de');
    const t = i18n.t as unknown as (key: string) => string;

    expect(t('testOnly.untranslated')).toBe('Only in English');
    expect(t('testOnly.untranslated')).not.toContain('testOnly');
  });
});
