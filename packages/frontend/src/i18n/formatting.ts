import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { currentLanguage } from './instance';
import { INTL_LOCALES, type Language } from './languages';

/**
 * The one place the app turns numbers, money and dates into text.
 *
 * Money apps live and die on this: `1,234.56` and `1.234,56` mean the same
 * amount and read wrong to the other audience. Formatting therefore follows
 * the chosen UI language instead of being pinned to `en-US` in each component
 * (decision recorded in `docs/PRODUCT.md`, "Languages").
 *
 * Machine-readable values — addresses, transaction hashes, raw on-chain
 * amounts a user copies elsewhere — are deliberately not routed through here.
 */
export interface Formatters {
  /** The language these formatters were built for. */
  readonly language: Language;
  /** Plain number, e.g. a token amount. */
  number(value: number, options?: Intl.NumberFormatOptions): string;
  /** USD amount, two fraction digits unless overridden. */
  usd(value: number, options?: Intl.NumberFormatOptions): string;
  /** USD amount with an explicit `+` on gains, for PnL figures. */
  signedUsd(value: number, options?: Intl.NumberFormatOptions): string;
  /** Ratio → percentage: `0.1234` becomes `12.34%` / `12,34 %`. */
  percent(ratio: number, options?: Intl.NumberFormatOptions): string;
  /** Calendar date, medium length by default. */
  date(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string;
  /** Calendar date with time of day. */
  dateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string;
  /**
   * How long ago a moment was, phrased in the reader's language
   * ("2 min. ago" / "vor 2 Min."). Used wherever the UI reports how fresh a
   * figure is.
   */
  relativeAge(value: Date | string | number): string;
}

const DATE_DEFAULTS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
};

const TIME_DEFAULTS: Intl.DateTimeFormatOptions = {
  hour: '2-digit',
  minute: '2-digit',
};

export function createFormatters(language: Language): Formatters {
  const locale = INTL_LOCALES[language];
  const format = (value: number, options: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, options).format(value);
  const formatDate = (
    value: Date | string | number,
    options: Intl.DateTimeFormatOptions,
  ) => new Intl.DateTimeFormat(locale, options).format(new Date(value));

  const usd: Formatters['usd'] = (value, options) =>
    format(value, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      ...options,
    });

  return {
    language,
    number: (value, options) => format(value, { ...options }),
    usd,
    signedUsd: (value, options) => `${value > 0 ? '+' : ''}${usd(value, options)}`,
    percent: (ratio, options) =>
      format(ratio, {
        style: 'percent',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
        ...options,
      }),
    date: (value, options) => formatDate(value, { ...DATE_DEFAULTS, ...options }),
    dateTime: (value, options) =>
      formatDate(value, { ...DATE_DEFAULTS, ...TIME_DEFAULTS, ...options }),
    relativeAge: (value) => {
      const relative = new Intl.RelativeTimeFormat(locale, {
        numeric: 'always',
        style: 'short',
      });
      const seconds = Math.max(
        0,
        Math.round((Date.now() - new Date(value).getTime()) / 1000),
      );
      if (seconds < 60) return relative.format(-seconds, 'second');
      if (seconds < 3600) return relative.format(-Math.floor(seconds / 60), 'minute');
      return relative.format(-Math.floor(seconds / 3600), 'hour');
    },
  };
}

/**
 * Formatters for the language currently shown. Re-renders with the switcher,
 * so every figure on screen changes notation together with the copy.
 */
export function useFormatters(): Formatters {
  // Subscribes the component to language changes; which language is active is
  // answered in one place only.
  useTranslation();
  const language = currentLanguage();
  return useMemo(() => createFormatters(language), [language]);
}
