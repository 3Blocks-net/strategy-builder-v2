import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { RangeToggle } from '@/components/range-toggle';

interface HistoryPoint {
  t: string;
  valueUsd: number;
}
interface HistoryMarker {
  t: string;
  type: string;
  token: string;
  amount: string;
  amountUsd: number | null;
}
interface ValueHistory {
  range: string;
  points: HistoryPoint[];
  markers: HistoryMarker[];
  historyStartsAt: string | null;
}

const W = 600;
const H = 160;
const PAD = 8;

function formatUsd(v: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function ValueHistoryChart({
  address,
  range,
  onRangeChange,
}: {
  address: string;
  range: string;
  onRangeChange: (range: string) => void;
}) {
  const [data, setData] = useState<ValueHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/vaults/${address}/value-history?range=${range}`,
      );
      if (!res.ok) throw new Error('failed');
      setData(await res.json());
    } catch {
      setError('Failed to load value history');
    } finally {
      setLoading(false);
    }
  }, [address, range]);

  useEffect(() => {
    load();
  }, [load]);

  const points = data?.points ?? [];
  const hasCurve = points.length >= 2;

  // Map points → SVG coordinates.
  let path = '';
  let markerDots: { x: number; color: string; title: string }[] = [];
  if (hasCurve) {
    const times = points.map((p) => new Date(p.t).getTime());
    const values = points.map((p) => p.valueUsd);
    const minT = times[0];
    const maxT = times[times.length - 1];
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const spanT = maxT - minT || 1;
    const spanV = maxV - minV || 1;
    const x = (t: number) => PAD + ((t - minT) / spanT) * (W - 2 * PAD);
    const y = (v: number) => H - PAD - ((v - minV) / spanV) * (H - 2 * PAD);

    path = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(times[i])},${y(p.valueUsd)}`)
      .join(' ');

    markerDots = (data?.markers ?? [])
      .map((m) => {
        const t = new Date(m.t).getTime();
        if (t < minT || t > maxT) return null;
        return {
          x: x(t),
          color: m.type === 'DEPOSIT' ? '#22c55e' : '#ef4444',
          title: `${m.type} ${m.amountUsd != null ? formatUsd(m.amountUsd) : ''} @ ${formatDate(m.t)}`,
        };
      })
      .filter((d): d is { x: number; color: string; title: string } => d != null);
  }

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Value history</h2>
        <RangeToggle value={range} onChange={onRangeChange} />
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && !hasCurve && (
        <p className="text-sm text-muted-foreground">
          Not enough history yet — snapshots are still being collected.
        </p>
      )}

      {!loading && !error && hasCurve && (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
          >
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-primary"
              vectorEffect="non-scaling-stroke"
            />
            {markerDots.map((d, i) => (
              <line
                key={i}
                x1={d.x}
                x2={d.x}
                y1={PAD}
                y2={H - PAD}
                stroke={d.color}
                strokeWidth={1}
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              >
                <title>{d.title}</title>
              </line>
            ))}
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              <span className="text-green-500">●</span> deposit{' '}
              <span className="ml-2 text-red-500">●</span> withdraw
            </span>
            {data?.historyStartsAt && (
              <span>History since {formatDate(data.historyStartsAt)}</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
