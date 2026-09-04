import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { ExecutionStatusBadge } from '@/components/execution-status-badge';
import { FreshnessIndicator } from '@/components/freshness-indicator';
import { useExecutionsSocket } from '@/hooks/use-executions-socket';
import { useIndexerStatus } from '@/hooks/use-indexer-status';
import { useFormatters, type Formatters } from '@/i18n';
import { apiFetch } from '@/lib/api';

/**
 * Unified vault history table (PEC-219 #03 + #04) — read-only.
 *
 * Consumes `GET /vaults/:address/executions?automationId=&page=&pageSize=`,
 * which returns a chronological UNION of success executions and deposit/withdraw
 * events (vault-wide) or executions of one automation (when filtered). Realtime
 * (#06) and failure/resolved rows (#05) plug in without changing this surface.
 */

interface HistoryRow {
  kind: 'execution' | 'vault_event' | 'failure';
  id: string;
  txHash: string | null;
  blockNumber: number;
  logIndex: number;
  blockTimestamp: string;
  // execution / failure
  automationId: number | null;
  // execution-only
  gasCompAmount: string | null;
  gasCompToken: string | null;
  gasCompUsd: string | null;
  // vault-event-only
  eventType: string | null;
  token: string | null;
  amount: string | null;
  amountUsd: string | null;
  feeAmount: string | null;
  feeBps: number | null;
  // failure-only
  failureStatus: string | null; // 'open' | 'resolved'
  errorMessage: string | null;
  attemptCount: number | null;
}

interface AcceptedToken {
  address: string;
  symbol: string;
  decimals: number;
}

interface AutomationOption {
  onChainId: number;
  label: string;
}

interface Props {
  vaultAddress: string;
  chainId?: number;
}

const PAGE_SIZE = 20;



function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function getBscScanUrl(txHash: string, chainId?: number): string {
  const base = chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';
  return `${base}/tx/${txHash}`;
}

function formatAmount(
  fmt: Formatters,
  amount: string | null,
  token: string | null,
  tokenMeta: Map<string, AcceptedToken>,
): string {
  if (!amount || !token) return '—';
  const meta = tokenMeta.get(token.toLowerCase());
  const decimals = meta?.decimals ?? 18;
  try {
    const num = parseFloat(formatUnits(BigInt(amount), decimals));
    const formatted = fmt.number(num, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    });
    return meta?.symbol ? `${formatted} ${meta.symbol}` : formatted;
  } catch {
    return amount;
  }
}

function formatUsd(fmt: Formatters, value: string | null): string {
  if (value === null) return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return fmt.usd(num, { maximumFractionDigits: 4 });
}

function VaultEventBadge({ eventType }: { eventType: string | null }) {
  const { t } = useTranslation();
  const isDeposit = eventType === 'DEPOSIT';
  return (
    <span
      className={`whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${
        isDeposit ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
      }`}
    >
      {isDeposit ? t('history.deposit') : t('history.withdrawal')}
    </span>
  );
}

function renderBadge(row: HistoryRow) {
  if (row.kind === 'vault_event') return <VaultEventBadge eventType={row.eventType} />;
  if (row.kind === 'failure') {
    return <ExecutionStatusBadge status={row.failureStatus === 'resolved' ? 'resolved' : 'failed'} />;
  }
  return <ExecutionStatusBadge status="success" />;
}

function renderDetail(
  t: TFunction,
  fmt: Formatters,
  row: HistoryRow,
  tokenMeta: Map<string, AcceptedToken>,
) {
  if (row.kind === 'vault_event')
    return formatAmount(fmt, row.amount, row.token, tokenMeta);
  const automation = t('history.automation', { id: row.automationId ?? '' });
  if (row.kind === 'failure') {
    return (
      <span>
        {automation}
        {row.attemptCount && row.attemptCount > 1
          ? ` · ${t('history.attempts', { times: row.attemptCount })}`
          : ''}
        {row.errorMessage ? (
          <span className="block text-xs text-muted-foreground/80">{row.errorMessage}</span>
        ) : null}
      </span>
    );
  }
  return automation;
}

function renderCost(
  fmt: Formatters,
  row: HistoryRow,
  tokenMeta: Map<string, AcceptedToken>,
) {
  if (row.kind === 'execution')
    return formatAmount(fmt, row.gasCompAmount, row.gasCompToken, tokenMeta);
  if (row.kind === 'vault_event') {
    return `${formatAmount(fmt, row.feeAmount, row.token, tokenMeta)}${
      row.feeBps != null ? ` (${fmt.percent(row.feeBps / 10_000)})` : ''
    }`;
  }
  return '—'; // failure
}

export function ExecutionHistoryTable({ vaultAddress, chainId }: Props) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [automationId, setAutomationId] = useState<number | ''>('');
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [tokenMeta, setTokenMeta] = useState<Map<string, AcceptedToken>>(new Map());
  const [automations, setAutomations] = useState<AutomationOption[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  // Fee-token metadata (decimals + symbol) so amounts are never off by orders of magnitude.
  useEffect(() => {
    apiFetch('/tokens/accepted')
      .then((r) => (r.ok ? r.json() : []))
      .then((tokens: AcceptedToken[]) => {
        const m = new Map<string, AcceptedToken>();
        for (const t of tokens) m.set(t.address.toLowerCase(), t);
        setTokenMeta(m);
      })
      .catch(() => {});
  }, []);

  // Deployed automations populate the per-automation filter.
  useEffect(() => {
    apiFetch(`/vaults/${vaultAddress}/automations`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: any[]) => {
        setAutomations(
          items
            .filter((a) => a.onChainId !== null && a.onChainId !== undefined)
            .map((a) => ({
              onChainId: a.onChainId,
              label: a.label || t('history.automation', { id: a.onChainId }),
            })),
        );
      })
      .catch(() => {});
  }, [vaultAddress, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey wird nie gelesen, nur als Cache-Busting-Signal hochgezählt (Realtime-Event / 15s-Poll), damit diese Callback-Identität wechselt und der Effect unten neu fetcht.
  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) });
      if (automationId !== '') params.set('automationId', String(automationId));
      const res = await apiFetch(`/vaults/${vaultAddress}/executions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [vaultAddress, page, automationId, reloadKey]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Live updates: a realtime success event (or a (re)connect gap-fill) jumps to
  // page 1 and reloads, so the new row shows and resolved failures flip over.
  const { connected } = useExecutionsSocket(
    vaultAddress,
    useCallback(() => {
      setPage(1);
      setReloadKey((k) => k + 1);
    }, []),
  );

  // Server-truth freshness (always polled) + REST fallback while disconnected.
  const indexerStatus = useIndexerStatus(10_000);

  useEffect(() => {
    if (connected) return; // socket healthy → no heavy history polling
    const id = setInterval(() => setReloadKey((k) => k + 1), 15_000);
    return () => clearInterval(id);
  }, [connected]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* flex-wrap: "Verbindung wird wiederhergestellt · aktualisiert vor
            2 Min." is far wider than its English counterpart. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="text-base font-semibold tracking-tight">
            {t('history.heading')}
          </h3>
          <FreshnessIndicator
            connected={connected}
            lastProcessedBlockTimestamp={indexerStatus?.lastProcessedBlockTimestamp ?? null}
          />
        </div>
        {automations.length > 0 && (
          <select
            className="rounded-md border bg-background px-2 py-1 text-sm"
            value={automationId === '' ? '' : String(automationId)}
            onChange={(e) => {
              setPage(1);
              setAutomationId(e.target.value === '' ? '' : Number(e.target.value));
            }}
          >
            <option value="">{t('history.allActivity')}</option>
            {automations.map((a) => (
              <option key={a.onChainId} value={a.onChainId}>
                {a.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {failed && (
        <div className="py-8 text-center">
          <p className="text-sm text-destructive">{t('history.loadFailed')}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={fetchHistory}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!loading && !failed && rows.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-muted-foreground">{t('history.empty')}</p>
        </div>
      )}

      {!loading && !failed && rows.length > 0 && (
        <>
          {/* The German headings are the wide ones — the table scrolls inside
              its own box rather than pushing the page sideways. */}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">
                    {t('history.table.type')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t('history.table.detail')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('history.table.cost')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('history.table.usd')}
                  </th>
                  <th className="px-4 py-3 text-left font-medium">
                    {t('history.table.txHash')}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {t('history.table.date')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-3">{renderBadge(row)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {renderDetail(t, fmt, row, tokenMeta)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {renderCost(fmt, row, tokenMeta)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {row.kind === 'execution'
                        ? formatUsd(fmt, row.gasCompUsd)
                        : row.kind === 'vault_event'
                          ? formatUsd(fmt, row.amountUsd)
                          : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {row.txHash ? (
                        <a
                          href={getBscScanUrl(row.txHash, chainId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {truncateHash(row.txHash)}
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {fmt.dateTime(row.blockTimestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                {t('history.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('history.page', { page, total: totalPages })}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                {t('history.next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
