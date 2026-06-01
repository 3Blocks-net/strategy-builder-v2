import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';

interface VaultEvent {
  id: string;
  eventType: string;
  token: string;
  amount: string;
  feeAmount: string;
  feeBps: number;
  txHash: string;
  blockNumber: number;
  blockTimestamp: string;
}

interface HistoryTableProps {
  vaultAddress: string;
  chainId?: number;
}

function formatAmount(amount: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 6,
  }).format(num);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function getBscScanUrl(txHash: string, chainId?: number): string {
  const base = chainId === 97 ? 'https://testnet.bscscan.com' : 'https://bscscan.com';
  return `${base}/tx/${txHash}`;
}

export function HistoryTable({ vaultAddress, chainId }: HistoryTableProps) {
  const [events, setEvents] = useState<VaultEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `/vaults/${vaultAddress}/history?page=${page}&limit=${limit}`,
      );
      if (!res.ok) throw new Error('Failed to load history');
      const data = await res.json();
      setEvents(data.events ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setError('Failed to load transaction history');
    } finally {
      setLoading(false);
    }
  }, [vaultAddress, page]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Transaction History</h3>

      <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
        Transaction history may be incomplete. Direct on-chain interactions and
        automation executions are not tracked until Subgraph integration is
        active.
      </div>

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded bg-muted" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 p-4 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={fetchHistory}
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && events.length === 0 && (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-muted-foreground">No transactions yet.</p>
        </div>
      )}

      {!loading && !error && events.length > 0 && (
        <>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Token</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-right font-medium">Fee</th>
                  <th className="px-4 py-3 text-left font-medium">TX Hash</th>
                  <th className="px-4 py-3 text-right font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {events.map((evt) => (
                  <tr key={evt.id} className="border-b last:border-0">
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          evt.eventType === 'DEPOSIT'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {evt.eventType === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {truncateHash(evt.token)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatAmount(evt.amount)}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatAmount(evt.feeAmount)} ({(evt.feeBps / 100).toFixed(2)}%)
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={getBscScanUrl(evt.txHash, chainId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {truncateHash(evt.txHash)}
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatDate(evt.blockTimestamp)}
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
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
