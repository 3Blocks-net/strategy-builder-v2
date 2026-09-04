/**
 * The single i18n bootstrap: importing this module gives the app a ready
 * i18next instance, restores the visitor's language choice and keeps
 * `<html lang>` in sync. Importing `@/i18n` is what starts it; components only
 * ever touch `useTranslation()` and `useFormatters()`.
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import {
  FALLBACK_LANGUAGE,
  LANGUAGES,
  isLanguage,
  resolveLanguage,
  type Language,
} from './languages';
import { de } from './locales/de';
import { en } from './locales/en';

export const LANGUAGE_STORAGE_KEY = 'pecunity.language';

/** Storage can throw (private mode, blocked cookies) — never let that break the app. */
function readStoredLanguage(): Language | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeLanguage(language: Language): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // A visitor who cannot persist still gets the language for this session.
  }
}

/**
 * A remembered choice wins; otherwise the browser's preferred languages
 * decide, and English closes the chain.
 */
export function detectInitialLanguage(): Language {
  const stored = readStoredLanguage();
  if (stored) return stored;
  if (typeof navigator === 'undefined') return FALLBACK_LANGUAGE;
  const preferred =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  return resolveLanguage(preferred);
}

function applyDocumentLanguage(language: string): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language;
  }
}

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      de: { translation: de },
    },
    lng: detectInitialLanguage(),
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [...LANGUAGES],
    interpolation: {
      // React escapes for us; double-escaping would mangle apostrophes.
      escapeValue: false,
    },
  });

  i18n.on('languageChanged', (language) => {
    if (isLanguage(language)) storeLanguage(language);
    applyDocumentLanguage(language);
  });

  applyDocumentLanguage(i18n.resolvedLanguage ?? FALLBACK_LANGUAGE);
}

/** The active language, narrowed to what the app actually supports. */
export function currentLanguage(): Language {
  const active = i18n.resolvedLanguage ?? i18n.language;
  return isLanguage(active) ? active : FALLBACK_LANGUAGE;
}

/** Switching language: persists the choice and updates `<html lang>` via the listener. */
export async function setLanguage(language: Language): Promise<void> {
  await i18n.changeLanguage(language);
}

export { i18n };
