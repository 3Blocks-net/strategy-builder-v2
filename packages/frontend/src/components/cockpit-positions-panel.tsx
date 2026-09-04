import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { useFormatters, type Formatters } from '@/i18n';
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
  source?: 'snapshot' | 'live';
}

/**
 * Protocol names are proper names and stay as they are; only the two
 * house-made groups have copy that a reader expects in their language.
 */
const PROTOCOL_NAMES: Record<string, string> = {
  'aave-v3': 'Aave V3',
  'pancakeswap-v3': 'PancakeSwap V3',
};

function protocolLabel(t: TFunction, protocol: string): string {
  if (protocol === 'idle') return t('positions.protocol.idle');
  if (protocol === 'gas-reserve') return t('positions.protocol.gas-reserve');
  return PROTOCOL_NAMES[protocol] ?? protocol;
}

function formatUsd(fmt: Formatters, value: number | null): string {
  if (value == null) return '—';
  return fmt.usd(value);
}

function formatAmount(fmt: Formatters, amount: string, decimals: number): string {
  const num = Number(amount) / 10 ** decimals;
  if (num === 0) return '0';
  if (num < 0.001) return '<0.001';
  return fmt.number(num, { maximumFractionDigits: 4 });
}

function formatMetrics(
  t: TFunction,
  fmt: Formatters,
  p: ValuedPosition,
): string | null {
  const m = p.metrics;
  if (!m) return null;
  const parts: string[] = [];
  if ('healthFactor' in m) {
    const hf = m.healthFactor as number | null;
    parts.push(
      t('positions.metrics.healthFactor', {
        value:
          hf == null
            ? '∞'
            : fmt.number(hf, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
      }),
    );
  }
  if (typeof m.supplyApy === 'number')
    parts.push(t('positions.metrics.supplyApy', { value: fmt.percent(m.supplyApy) }));
  if (typeof m.borrowApy === 'number')
    parts.push(t('positions.metrics.borrowApy', { value: fmt.percent(m.borrowApy) }));
  if ('inRange' in m)
    parts.push(
      m.inRange
        ? t('positions.metrics.inRange')
        : t('positions.metrics.outOfRange'),
    );
  if (typeof m.feeTier === 'number')
    parts.push(
      t('positions.metrics.feeTier', {
        value: fmt.percent(m.feeTier / 1_000_000, { minimumFractionDigits: 0 }),
      }),
    );
  if (typeof m.uncollectedUsd === 'number')
    parts.push(
      t('positions.metrics.uncollected', {
        value: formatUsd(fmt, m.uncollectedUsd),
      }),
    );
  if (typeof p.earningsUsd === 'number')
    parts.push(
      t('positions.metrics.earnings', { value: formatUsd(fmt, p.earningsUsd) }),
    );
  return parts.length ? parts.join(' · ') : null;
}

/**
 * Tick range + human price bounds for a PancakeSwap V3 LP position.
 * Backend metrics carry tickLower/tickUpper; legs are ordered [token0, token1]
 * with decimals/symbol. Price(token1 per token0) = 1.0001^tick · 10^(dec0−dec1);
 * inverted for readability when below 1 so the number stays legible.
 */
function lpRangeLine(
  t: TFunction,
  fmt: Formatters,
  p: ValuedPosition,
): string | null {
  const m = p.metrics;
  if (!m || typeof m.tickLower !== 'number' || typeof m.tickUpper !== 'number') {
    return null;
  }
  if (p.legs.length < 2) return null;
  const [t0, t1] = p.legs;
  const tl = m.tickLower as number;
  const tu = m.tickUpper as number;
  const priceAt = (tick: number) =>
    Math.pow(1.0001, tick) * 10 ** (t0.decimals - t1.decimals); // token1 per token0

  let lo = priceAt(tl);
  let hi = priceAt(tu); // tickUpper > tickLower ⇒ hi > lo
  let base = t0.symbol;
  let quote = t1.symbol;
  if (hi < 1) {
    // invert: show token0 per token1 (bounds swap on inversion)
    [lo, hi] = [1 / hi, 1 / lo];
    base = t1.symbol;
    quote = t0.symbol;
  }
  const price = (x: number) => fmt.number(x, { maximumSignificantDigits: 6 });
  return t('positions.metrics.range', {
    low: price(lo),
    high: price(hi),
    quote,
    base,
    tickLower: tl,
    tickUpper: tu,
  });
}

export function CockpitPositionsPanel({ address }: { address: string }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [data, setData] = useState<ValuedVault | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setFailed(false);
      try {
        const res = await apiFetch(
          `/vaults/${address}/positions${refresh ? '?refresh=1' : ''}`,
        );
        if (!res.ok) throw new Error('failed');
        setData(await res.json());
      } catch {
        setFailed(true);
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
      // biome-ignore lint/suspicious/noAssignInExpressions: idiomatisches get-or-create (??=) fürs Akkumulator-Array, kein typo-anfälliges `if (x = ...)`.
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-base font-semibold tracking-tight">
            {t('positions.heading')}
          </h2>
          {data && (
            <p className="text-2xl font-bold">{formatUsd(fmt, data.totalValueUsd)}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {data && (
            <span className="text-xs text-muted-foreground">
              {t(data.source === 'live' ? 'positions.asOfLive' : 'positions.asOf', {
                age: fmt.relativeAge(data.asOf),
              })}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => load(true)}
            disabled={refreshing || loading}
          >
            {refreshing ? t('common.refreshing') : t('common.refresh')}
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">{t('positions.loading')}</p>
      )}
      {failed && (
        <p className="text-sm text-destructive">{t('positions.loadFailed')}</p>
      )}

      {!loading && !failed && isEmpty && (
        <p className="text-sm text-muted-foreground">{t('positions.empty')}</p>
      )}

      {!loading && !failed && !isEmpty && (
        <div className="space-y-4">
          {groupKeys.map((proto) => (
            <div key={proto}>
              <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                {protocolLabel(t, proto)}
              </h3>
              <div className="space-y-1">
                {groups[proto].map((p) =>
                  p.error ? (
                    <div
                      // kind+label sind nicht eindeutig (z. B. Spam-Token mit
                      // gleichem Symbol) — Leg-Token-Adressen als Tie-Breaker.
                      key={`${p.kind}-${p.label}-${p.legs.map((l) => l.token).join('.')}`}
                      className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    >
                      {p.label}: {p.error}
                    </div>
                  ) : (
                    <div
                      key={`${p.kind}-${p.label}-${p.legs.map((l) => l.token).join('.')}`}
                      className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
                    >
                      <div>
                        <div>
                          <span className="font-medium">{p.label}</span>
                          {p.legs.map((leg) => (
                            <span key={`${leg.token}-${leg.isDebt ? 'debt' : 'supply'}`} className="ml-2 text-muted-foreground">
                              {formatAmount(fmt, leg.amount, leg.decimals)}{' '}
                              {leg.symbol}
                              {leg.isDebt ? ` ${t('positions.debtSuffix')}` : ''}
                            </span>
                          ))}
                        </div>
                        {formatMetrics(t, fmt, p) && (
                          <div className="text-xs text-muted-foreground">
                            {formatMetrics(t, fmt, p)}
                          </div>
                        )}
                        {lpRangeLine(t, fmt, p) && (
                          <div className="text-xs text-muted-foreground">
                            {lpRangeLine(t, fmt, p)}
                          </div>
                        )}
                      </div>
                      <span
                        className={
                          (p.valueUsd ?? 0) < 0 ? 'text-destructive' : ''
                        }
                      >
                        {p.kind === 'summary' ? '' : formatUsd(fmt, p.valueUsd)}
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
