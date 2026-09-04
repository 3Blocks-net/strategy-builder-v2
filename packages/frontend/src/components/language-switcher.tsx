import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  LANGUAGES,
  LANGUAGE_NAMES,
  LANGUAGE_SHORT_NAMES,
  currentLanguage,
  setLanguage,
} from '@/i18n';

/**
 * Segmented DE/EN control, reachable from both shells.
 *
 * The badge stays short (`DE`, `EN`) so it fits a top bar; the accessible name
 * is the language's own name (`Deutsch`, `English`), which is what a screen
 * reader and a test should hear. Follows the RangeToggle pattern so the two
 * switches in the app read as one family.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t } = useTranslation();
  const active = currentLanguage();

  return (
    // A fieldset is the group semantics the two options need; Tailwind's
    // preflight strips its default border and padding.
    <fieldset
      aria-label={t('language.switcherLabel')}
      className={cn('flex gap-1', className)}
    >
      {LANGUAGES.map((language) => {
        const isActive = language === active;
        return (
          <button
            key={language}
            type="button"
            lang={language}
            aria-label={LANGUAGE_NAMES[language]}
            aria-pressed={isActive}
            onClick={() => setLanguage(language)}
            className={cn(
              'rounded-full px-2.5 py-1 text-xs transition-colors',
              isActive
                ? 'bg-muted font-semibold text-foreground'
                : 'font-medium text-muted-foreground hover:text-foreground',
            )}
          >
            {LANGUAGE_SHORT_NAMES[language]}
          </button>
        );
      })}
    </fieldset>
  );
}
