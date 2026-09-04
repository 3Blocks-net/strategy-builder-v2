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
  let areaPath = '';
  let markerDots: { key: string; x: number; color: string; title: string }[] = [];
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
    areaPath = `${path} L${x(maxT)},${H - PAD} L${x(minT)},${H - PAD} Z`;

    markerDots = (data?.markers ?? [])
      .map((m, i) => {
        const t = new Date(m.t).getTime();
        if (t < minT || t > maxT) return null;
        return {
          // Marker-Zeitstempel sind nicht eindeutig (Deposit+Withdraw im selben
          // Block) — Index als Tie-Breaker gegen doppelte React-Keys.
          key: `${t}-${m.type}-${i}`,
          x: x(t),
          color: m.type === 'DEPOSIT' ? '#1e7f4f' : '#c2402a',
          title: `${m.type} ${m.amountUsd != null ? formatUsd(m.amountUsd) : ''} @ ${formatDate(m.t)}`,
        };
      })
      .filter((d): d is { key: string; x: number; color: string; title: string } => d != null);
  }

  return (
    <section>
      <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold tracking-tight">Value history</h2>
        <RangeToggle value={range} onChange={onRangeChange} />
      </div>
      <div className="pt-4">

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
            <title>Value history chart</title>
            <defs>
              <linearGradient id="value-history-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#4568d0" stopOpacity="0.14" />
                <stop offset="1" stopColor="#4568d0" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#value-history-fill)" />
            <path
              d={path}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="text-primary"
              vectorEffect="non-scaling-stroke"
            />
            {markerDots.map((d) => (
              <line
                key={d.key}
                x1={d.x}
                x2={d.x}
                y1={PAD}
                y2={H - PAD}
                stroke={d.color}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              >
                <title>{d.title}</title>
              </line>
            ))}
          </svg>
          <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-positive" aria-hidden />
                deposit
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden />
                withdraw
              </span>
            </span>
            {data?.historyStartsAt && (
              <span>History since {formatDate(data.historyStartsAt)}</span>
            )}
          </div>
        </>
      )}
      </div>
    </section>
  );
}
