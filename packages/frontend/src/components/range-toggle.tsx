import { useTranslation } from 'react-i18next';

/**
 * The four cockpit timeframes, shared by the value chart and performance card.
 * The keys are the API's range parameter; the label comes from the catalog, so
 * "Since creation" can grow into "Seit Erstellung" without a second list.
 */
export const COCKPIT_RANGES = ['24h', '7d', '30d', 'all'] as const;

export type CockpitRange = (typeof COCKPIT_RANGES)[number];

export function RangeToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (range: string) => void;
}) {
  const { t } = useTranslation();

  return (
    // flex-wrap: the German labels are the long ones and must fall into a
    // second line rather than push the card open.
    <div className="flex flex-wrap gap-1">
      {COCKPIT_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          onClick={() => onChange(range)}
          className={`rounded-full px-3 py-1 text-xs transition-colors ${
            value === range
              ? 'bg-muted font-semibold text-foreground'
              : 'font-medium text-muted-foreground hover:text-foreground'
          }`}
        >
          {t(`ranges.${range}`)}
        </button>
      ))}
    </div>
  );
}
