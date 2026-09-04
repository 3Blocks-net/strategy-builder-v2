/**
 * The languages the UI ships in, plus the pure helpers around them.
 *
 * Deliberately free of React, i18next and browser globals: the detection and
 * the number/date locales are decided here and used from the bootstrap
 * (`./index.ts`), the formatters and the tests alike.
 */

export const LANGUAGES = ['en', 'de'] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * English is the source language: every string exists in it, so it is both the
 * default for an unknown browser language and the fallback for a phrase the
 * German catalog does not (yet) carry.
 */
export const FALLBACK_LANGUAGE: Language = 'en';

/**
 * The BCP-47 locales numbers, currencies and dates are formatted in — the
 * decision "formatting follows the UI language" lives here and nowhere else
 * (see `docs/PRODUCT.md`, "Languages").
 */
export const INTL_LOCALES: Record<Language, string> = {
  en: 'en-US',
  de: 'de-DE',
};

/** Endonyms: a language is offered in its own language, never translated. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  de: 'Deutsch',
};

/** Two-letter badge for the switcher. */
export const LANGUAGE_SHORT_NAMES: Record<Language, string> = {
  en: 'EN',
  de: 'DE',
};

export function isLanguage(value: string | null | undefined): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

/**
 * Picks the first supported language from an ordered list of BCP-47 tags
 * (`['de-AT', 'en-GB']` → `de`). Falls back to English when nothing matches.
 */
export function resolveLanguage(
  preferred: readonly (string | undefined)[] | undefined,
): Language {
  for (const tag of preferred ?? []) {
    const primary = tag?.toLowerCase().split('-')[0];
    if (isLanguage(primary)) return primary;
  }
  return FALLBACK_LANGUAGE;
}
