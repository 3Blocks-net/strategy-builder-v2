import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { type Address } from 'viem';
import { Button } from '@/components/ui/button';
import { DepositForm } from '@/components/deposit-form';
import { WithdrawForm } from '@/components/withdraw-form';
import { HistoryTable } from '@/components/history-table';
import { ContextView } from '@/components/context-view';
import { GasDepositCard } from '@/components/gas-deposit-card';
import { apiFetch } from '@/lib/api';
import { AutomationList } from '@/features/automation-editor/components/automation-list';

interface Position {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
  priceUsd: number | null;
  valueUsd: number | null;
  priceSource: 'alchemy' | 'defi-llama' | 'unavailable';
}

interface Portfolio {
  vaultAddress: string;
  positions: Position[];
  totalValueUsd: number;
}

function formatUsd(value: number | null): string {
  if (value == null) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBalance(balance: string, decimals: number): string {
  const num = parseFloat(balance) / 10 ** decimals;
  if (num === 0) return '0';
  if (num < 0.001) return '<0.001';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(num);
}

export function VaultDetailPage() {
  const { address } = useParams<{ address: string }>();
  const navigate = useNavigate();
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelInput, setLabelInput] = useState('');
  const [labelError, setLabelError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [fees, setFees] = useState<{ depositFeeBps: number; withdrawFeeBps: number } | null>(null);
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch('/fees')
      .then((r) => r.json())
      .then((d) => setFees(d))
      .catch(() => {});
    apiFetch('/errors/contract-errors')
      .then((r) => r.json())
      .then((d) => setErrorMap(d.errors ?? {}))
      .catch(() => {});
  }, []);

  const fetchPortfolio = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/vaults/${address}/portfolio`);
      if (res.status === 403) {
        navigate('/dashboard');
        return;
      }
      if (!res.ok) throw new Error('Failed to load portfolio');
      const data = await res.json();
      setPortfolio(data);
    } catch {
      setError('Failed to load portfolio');
    } finally {
      setLoading(false);
    }
  }, [address, navigate]);

  const fetchVaultInfo = useCallback(async () => {
    if (!address) return;
    try {
      const res = await apiFetch('/vaults');
      if (!res.ok) return;
      const vaults = await res.json();
      const vault = vaults.find?.(
        (v: { address: string }) =>
          v.address.toLowerCase() === address.toLowerCase(),
      );
      if (vault) setLabel(vault.label);
    } catch {
      // ignore
    }
  }, [address]);

  useEffect(() => {
    fetchPortfolio();
    fetchVaultInfo();
  }, [fetchPortfolio, fetchVaultInfo]);

  const handleLabelSave = async () => {
    if (!address || !labelInput.trim()) {
      setEditingLabel(false);
      return;
    }
    setLabelError(null);
    try {
      const res = await apiFetch(`/vaults/${address}`, {
        method: 'PATCH',
        body: JSON.stringify({ label: labelInput.trim() }),
      });
      if (res.status === 409) {
        setLabelError('Label already in use');
        return;
      }
      if (!res.ok) {
        setLabelError('Failed to update label');
        return;
      }
      const updated = await res.json();
      setLabel(updated.label);
      setEditingLabel(false);
    } catch {
      setLabelError('Failed to update label');
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  const sortedPositions = portfolio
    ? [...portfolio.positions].sort(
        (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0),
      )
    : [];

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate('/dashboard')}
        >
          &larr; Back to Dashboard
        </Button>

        <div className="space-y-2">
          <div className="flex items-center gap-3">
            {editingLabel ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleLabelSave();
                    if (e.key === 'Escape') setEditingLabel(false);
                  }}
                  onBlur={handleLabelSave}
                  autoFocus
                  className="rounded-md border border-input bg-background px-2 py-1 text-2xl font-bold"
                />
                {labelError && (
                  <span className="text-sm text-destructive">
                    {labelError}
                  </span>
                )}
              </div>
            ) : (
              <h1
                className="cursor-pointer text-2xl font-bold hover:text-primary"
                onClick={() => {
                  setLabelInput(label);
                  setEditingLabel(true);
                  setLabelError(null);
                }}
                title="Click to edit"
              >
                {label || 'Vault'}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <code className="rounded bg-secondary px-2 py-0.5 font-mono">
              {truncated}
            </code>
            <Button variant="outline" size="sm" onClick={copyAddress}>
              {copied ? 'Copied!' : 'Copy'}
            </Button>
          </div>
        </div>

        {portfolio && (
          <div className="rounded-md border p-6">
            <p className="text-sm text-muted-foreground">Total Value</p>
            <p className="text-3xl font-bold">
              {formatUsd(portfolio.totalValueUsd)}
            </p>
          </div>
        )}

        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded bg-muted" />
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={fetchPortfolio}
            >
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && sortedPositions.length === 0 && (
          <div className="rounded-md border border-dashed p-8 text-center">
            <p className="text-muted-foreground">
              No token positions found in this vault.
            </p>
          </div>
        )}

        {!loading && !error && sortedPositions.length > 0 && (
          <PositionsTable positions={sortedPositions} />
        )}

        {address && (
          <div className="grid gap-6 md:grid-cols-2">
            <DepositForm
              vaultAddress={address as Address}
              fees={fees}
              onSuccess={fetchPortfolio}
            />
            <WithdrawForm
              vaultAddress={address as Address}
              positions={sortedPositions}
              fees={fees}
              errorMap={errorMap}
              onSuccess={fetchPortfolio}
            />
          </div>
        )}

        {address && <AutomationList vaultAddress={address} />}

        {address && <GasDepositCard vaultAddress={address} />}

        {address && <ContextView vaultAddress={address} />}

        {address && <HistoryTable vaultAddress={address} />}
      </div>
    </div>
  );
}

function PriceSourceBadge({
  source,
}: {
  source: 'alchemy' | 'defi-llama' | 'unavailable';
}) {
  if (source === 'alchemy') return null;
  const label = source === 'defi-llama' ? 'DeFiLlama' : 'N/A';
  const color =
    source === 'defi-llama'
      ? 'text-yellow-600 bg-yellow-50'
      : 'text-gray-500 bg-gray-100';
  return (
    <span className={`ml-1 rounded px-1 py-0.5 text-[10px] ${color}`}>
      {label}
    </span>
  );
}

function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">Token</th>
            <th className="px-4 py-3 text-right font-medium">Balance</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={pos.address} className="border-b last:border-0">
              <td className="px-4 py-3">
                <span className="font-medium">{pos.symbol}</span>
                <span className="ml-2 text-muted-foreground">{pos.name}</span>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatBalance(pos.balance, pos.decimals)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatUsd(pos.priceUsd)}
                <PriceSourceBadge source={pos.priceSource} />
              </td>
              <td className="px-4 py-3 text-right font-medium">
                {formatUsd(pos.valueUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
