import type { Translation } from './locales/en';

/**
 * Makes the English catalog the type of every translation key: `t('…')` only
 * compiles for a key that exists in English, so the UI can never render a raw
 * key like `dashboard.heading`. The build (`tsc -b`) is the enforcement.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: Translation };
  }
}
