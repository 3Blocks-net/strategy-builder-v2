import { Button } from '@/components/ui/button';

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
        <Button
          key={r.key}
          variant={value === r.key ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </Button>
      ))}
    </div>
  );
}
