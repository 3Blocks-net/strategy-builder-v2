import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '@/i18n';
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

/** One dashed deposit/withdraw marker, positioned on the chart's x axis. */
interface MarkerDot {
  key: string;
  x: number;
  color: string;
  title: string;
}

const W = 600;
const H = 160;
const PAD = 8;

export function ValueHistoryChart({
  address,
  range,
  onRangeChange,
}: {
  address: string;
  range: string;
  onRangeChange: (range: string) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [data, setData] = useState<ValueHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await apiFetch(
        `/vaults/${address}/value-history?range=${range}`,
      );
      if (!res.ok) throw new Error('failed');
      setData(await res.json());
    } catch {
      setFailed(true);
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
  let markerDots: MarkerDot[] = [];
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
      .map((m, i): MarkerDot | null => {
        const at = new Date(m.t).getTime();
        if (at < minT || at > maxT) return null;
        return {
          // Marker-Zeitstempel sind nicht eindeutig (Deposit+Withdraw im selben
          // Block) — Index als Tie-Breaker gegen doppelte React-Keys.
          key: `${at}-${m.type}-${i}`,
          x: x(at),
          color: m.type === 'DEPOSIT' ? '#1e7f4f' : '#c2402a',
          title: t('valueHistory.marker', {
            type:
              m.type === 'DEPOSIT'
                ? t('valueHistory.legendDeposit')
                : t('valueHistory.legendWithdraw'),
            amount:
              m.amountUsd != null
                ? fmt.usd(m.amountUsd, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })
                : '',
            date: fmt.date(m.t),
          }),
        };
      })
      .filter((d): d is MarkerDot => d != null);
  }

  return (
    <section>
      <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold tracking-tight">
          {t('valueHistory.heading')}
        </h2>
        <RangeToggle value={range} onChange={onRangeChange} />
      </div>
      <div className="pt-4">

      {loading && (
        <p className="text-sm text-muted-foreground">{t('valueHistory.loading')}</p>
      )}
      {failed && (
        <p className="text-sm text-destructive">{t('valueHistory.loadFailed')}</p>
      )}

      {!loading && !failed && !hasCurve && (
        <p className="text-sm text-muted-foreground">{t('valueHistory.empty')}</p>
      )}

      {!loading && !failed && hasCurve && (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="h-40 w-full"
            preserveAspectRatio="none"
          >
            <title>{t('valueHistory.chartTitle')}</title>
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
                {t('valueHistory.legendDeposit')}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-destructive" aria-hidden />
                {t('valueHistory.legendWithdraw')}
              </span>
            </span>
            {data?.historyStartsAt && (
              <span>
                {t('valueHistory.since', { date: fmt.date(data.historyStartsAt) })}
              </span>
            )}
          </div>
        </>
      )}
      </div>
    </section>
  );
}
