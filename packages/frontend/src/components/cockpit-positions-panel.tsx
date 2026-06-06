import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

interface PositionLeg {
  token: string;
  symbol: string;
  decimals: number;
  amount: string;
  amountUsd: number | null;
  isDebt?: boolean;
}

interface ValuedPosition {
  protocol: string;
  kind: string;
  label: string;
  legs: PositionLeg[];
  valueUsd: number | null;
  debtUsd?: number;
  earningsUsd?: number | null;
  metrics?: Record<string, unknown>;
  error?: string;
}

interface ValuedVault {
  vaultAddress: string;
  positions: ValuedPosition[];
  totalValueUsd: number;
  asOfBlock: number | null;
  asOf: string;
}

const PROTOCOL_LABELS: Record<string, string> = {
  idle: 'Idle / unallocated',
  'gas-reserve': 'Gas reserve',
  'aave-v3': 'Aave V3',
  'pancakeswap-v3': 'PancakeSwap V3',
};

function formatUsd(value: number | null): string {
  if (value == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount) / 10 ** decimals;
  if (num === 0) return '0';
  if (num < 0.001) return '<0.001';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(num);
}

function relativeAge(iso: string | null): string {
  if (!iso) return '';
  const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function CockpitPositionsPanel({ address }: { address: string }) {
  const [data, setData] = useState<ValuedVault | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(
          `/vaults/${address}/positions${refresh ? '?refresh=1' : ''}`,
        );
        if (!res.ok) throw new Error('failed');
        setData(await res.json());
      } catch {
        setError('Failed to load positions');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [address],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Group positions by protocol, preserving a stable display order.
  const order = ['idle', 'gas-reserve', 'aave-v3', 'pancakeswap-v3'];
  const groups = (data?.positions ?? []).reduce<Record<string, ValuedPosition[]>>(
    (acc, p) => {
      (acc[p.protocol] ??= []).push(p);
      return acc;
    },
    {},
  );
  const groupKeys = Object.keys(groups).sort(
    (a, b) =>
      (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) -
      (order.indexOf(b) === -1 ? 99 : order.indexOf(b)),
  );

  const isEmpty =
    data != null && data.positions.length === 0 && data.totalValueUsd === 0;

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Positions</h2>
          {data && (
            <p className="text-2xl font-bold">{formatUsd(data.totalValueUsd)}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-muted-foreground">
              updated {relativeAge(data.asOf)}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading positions…</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && isEmpty && (
        <p className="text-sm text-muted-foreground">
          No positions yet. Deposit funds or deploy an automation to get started.
        </p>
      )}

      {!loading && !error && !isEmpty && (
        <div className="space-y-4">
          {groupKeys.map((proto) => (
            <div key={proto}>
              <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                {PROTOCOL_LABELS[proto] ?? proto}
              </h3>
              <div className="space-y-1">
                {groups[proto].map((p, i) =>
                  p.error ? (
                    <div
                      key={i}
                      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      {p.label}: {p.error}
                    </div>
                  ) : (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div>
                        <span className="font-medium">{p.label}</span>
                        {p.legs.map((leg, j) => (
                          <span key={j} className="ml-2 text-muted-foreground">
                            {formatAmount(leg.amount, leg.decimals)} {leg.symbol}
                            {leg.isDebt ? ' (debt)' : ''}
                          </span>
                        ))}
                      </div>
                      <span
                        className={
                          (p.valueUsd ?? 0) < 0 ? 'text-destructive' : ''
                        }
                      >
                        {formatUsd(p.valueUsd)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
