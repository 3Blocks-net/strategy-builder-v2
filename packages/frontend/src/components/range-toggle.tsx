/** The four cockpit timeframes, shared by the value chart and performance card. */
export const COCKPIT_RANGES: { key: string; label: string }[] = [
  { key: '24h', label: '24h' },
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: 'all', label: 'Since creation' },
];

export function RangeToggle({
  value,
  onChange,
}: {
  value: string;
  onChange: (range: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {COCKPIT_RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={value === r.key}
          onClick={() => onChange(r.key)}
          className={`rounded-full px-3 py-1 text-xs transition-colors ${
            value === r.key
              ? 'bg-muted font-semibold text-foreground'
              : 'font-medium text-muted-foreground hover:text-foreground'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
