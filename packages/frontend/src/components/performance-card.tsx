import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface Performance {
  currentValueUsd: number;
  netDepositsUsd: number;
  pnlAbsUsd: number;
  pnlPct: number | null;
  costsUsd: number;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatSignedUsd(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatUsd(value)}`;
}

export function PerformanceCard({ address }: { address: string }) {
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/vaults/${address}/performance`);
      if (!res.ok) throw new Error('failed');
      setData(await res.json());
    } catch {
      setError('Failed to load performance');
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    load();
  }, [load]);

  const up = (data?.pnlAbsUsd ?? 0) >= 0;

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="mb-3 text-lg font-semibold">Performance</h2>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading performance…</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">PnL</p>
            <p
              className={`text-xl font-bold ${up ? 'text-green-500' : 'text-destructive'}`}
            >
              {formatSignedUsd(data.pnlAbsUsd)}
            </p>
            <p className={`text-xs ${up ? 'text-green-500' : 'text-destructive'}`}>
              {data.pnlPct == null
                ? '—'
                : `${(data.pnlPct * 100).toFixed(2)}%`}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Current value</p>
            <p className="text-xl font-semibold">
              {formatUsd(data.currentValueUsd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Net deposits</p>
            <p className="text-xl font-semibold">
              {formatUsd(data.netDepositsUsd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Costs (fees + gas)</p>
            <p className="text-xl font-semibold">{formatUsd(data.costsUsd)}</p>
          </div>
        </div>
      )}
    </div>
  );
}
