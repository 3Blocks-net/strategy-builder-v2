import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { type Address } from 'viem';
import { ArrowLeft, Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { DepositForm } from '@/components/deposit-form';
import { WithdrawForm } from '@/components/withdraw-form';
import { ExecutionHistoryTable } from '@/components/execution-history-table';
import { ContextView } from '@/components/context-view';
import { GasDepositCard } from '@/components/gas-deposit-card';
import { CockpitPositionsPanel } from '@/components/cockpit-positions-panel';
import { ValueHistoryChart } from '@/components/value-history-chart';
import { PerformanceCard } from '@/components/performance-card';
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
  // Shared cockpit timeframe — drives both the performance card and the chart.
  const [cockpitRange, setCockpitRange] = useState('30d');

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
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : '';

  const sortedPositions = portfolio
    ? [...portfolio.positions].sort(
        (a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0),
      )
    : [];

  return (
    <AppShell
      band={
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm text-on-band-sub hover:text-on-band"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
            Dashboard
          </Link>

          <div className="mt-4 flex items-center gap-3">
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
                  // biome-ignore lint/a11y/noAutofocus: Click-to-edit — Fokus muss beim Umschalten in den Edit-Modus sofort im Input landen.
                  autoFocus
                  className="rounded-md border border-on-band-line bg-transparent px-2 py-1 text-xl font-semibold text-on-band"
                />
                {labelError && (
                  <span className="text-sm text-on-band-sub">{labelError}</span>
                )}
              </div>
            ) : (
              <h1 className="text-xl font-semibold">
                <button
                  type="button"
                  className="cursor-pointer hover:text-on-band-sub"
                  onClick={() => {
                    setLabelInput(label);
                    setEditingLabel(true);
                    setLabelError(null);
                  }}
                  title="Click to edit"
                >
                  {label || 'Vault'}
                </button>
              </h1>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-2 text-sm text-on-band-sub">
            <code className="font-mono text-xs">{truncated}</code>
            <button
              type="button"
              onClick={copyAddress}
              title="Copy vault address"
              className="rounded p-0.5 hover:text-on-band"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-on-band-positive" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden />
              )}
            </button>
            <span className="rounded-full border border-on-band-line px-2 py-0.5 text-xs">
              BSC
            </span>
          </div>

          <p className="mt-6 text-sm text-on-band-sub">Total value</p>
          {loading ? (
            <div className="mt-2 h-10 w-56 animate-pulse rounded-md bg-on-band-line" />
          ) : (
            <p className="mt-1 text-5xl font-semibold tracking-tight">
              {error ? '—' : formatUsd(portfolio?.totalValueUsd ?? null)}
            </p>
          )}
        </div>
      }
    >
      <div className="space-y-10">
        {error && (
          <div className="py-8 text-center">
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

        {address && (
          <ValueHistoryChart
            address={address}
            range={cockpitRange}
            onRangeChange={setCockpitRange}
          />
        )}

        {address && (
          <PerformanceCard
            address={address}
            range={cockpitRange}
            onRangeChange={setCockpitRange}
          />
        )}

        <section>
          <h2 className="border-b border-border pb-3 text-base font-semibold tracking-tight">
            Token Balances
          </h2>
          {loading && (
            <div>
              {[1, 2, 3].map((i) => (
                <div key={i} className="border-b border-border py-4 last:border-0">
                  <div className="h-5 w-full animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          )}
          {!loading && !error && sortedPositions.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No token positions found in this vault.
            </p>
          )}
          {!loading && !error && sortedPositions.length > 0 && (
            <PositionsTable positions={sortedPositions} />
          )}
        </section>

        {address && <CockpitPositionsPanel address={address} />}

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

        {address && <ExecutionHistoryTable vaultAddress={address} />}

        {address && <ContextView vaultAddress={address} />}
      </div>
    </AppShell>
  );
}

function PriceSourceBadge({
  source,
}: {
  source: 'alchemy' | 'defi-llama' | 'unavailable';
}) {
  if (source === 'alchemy') return null;
  const label = source === 'defi-llama' ? 'DeFiLlama' : 'N/A';
  return (
    <span className="ml-1.5 rounded-full border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
      {label}
    </span>
  );
}

function PositionsTable({ positions }: { positions: Position[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th className="py-3 pr-4 text-left font-medium">Token</th>
          <th className="hidden px-4 py-3 text-right font-medium sm:table-cell">
            Balance
          </th>
          <th className="hidden px-4 py-3 text-right font-medium md:table-cell">
            Price
          </th>
          <th className="py-3 pl-4 text-right font-medium">Value</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((pos) => (
          <tr key={pos.address} className="border-b border-border last:border-0">
            <td className="py-4 pr-4">
              <span className="font-medium">{pos.symbol}</span>
              <span className="ml-2 text-muted-foreground">{pos.name}</span>
            </td>
            <td className="hidden px-4 py-4 text-right font-mono text-xs sm:table-cell">
              {formatBalance(pos.balance, pos.decimals)}
            </td>
            <td className="hidden px-4 py-4 text-right md:table-cell">
              {formatUsd(pos.priceUsd)}
              <PriceSourceBadge source={pos.priceSource} />
            </td>
            <td className="py-4 pl-4 text-right font-semibold">
              {formatUsd(pos.valueUsd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
