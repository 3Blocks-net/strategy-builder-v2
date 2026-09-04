import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { apiFetch } from '@/lib/api';

interface VaultOverview {
  address: string;
  label: string;
  depositToken: string;
  chainId: number;
  totalValueUsd: number;
  createdAt: string;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function DashboardPage() {
  const navigate = useNavigate();
  const [vaults, setVaults] = useState<VaultOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVaults = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/vaults/overview');
      if (!res.ok) throw new Error('Failed to load vaults');
      const data = await res.json();
      setVaults(data.vaults ?? []);
    } catch {
      setError('Failed to load vaults');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVaults();
  }, [fetchVaults]);

  const totalUsd = vaults.reduce((sum, v) => sum + v.totalValueUsd, 0);

  return (
    <AppShell
      band={
        <div>
          <p className="text-sm text-on-band-sub">Portfolio value</p>
          {loading ? (
            <div className="mt-2 h-10 w-56 animate-pulse rounded-md bg-on-band-line" />
          ) : (
            <p className="mt-1 text-5xl font-semibold tracking-tight">
              {error ? '—' : formatUsd(totalUsd)}
            </p>
          )}
          <p className="mt-2 text-sm text-on-band-sub">
            {error
              ? 'Portfolio value unavailable right now'
              : loading
                ? 'Loading your vaults…'
                : vaults.length === 0
                  ? 'No vaults yet · BSC'
                  : `Across ${vaults.length} ${vaults.length === 1 ? 'vault' : 'vaults'} · BSC`}
          </p>
        </div>
      }
    >
      <div className="flex items-baseline justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold tracking-tight">Your Vaults</h1>
        <Button size="sm" onClick={() => navigate('/vault/create')}>
          <Plus className="h-4 w-4" aria-hidden />
          Create Vault
        </Button>
      </div>

      {loading && <VaultTableSkeleton />}

      {error && (
        <div className="py-12 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={fetchVaults}
          >
            Retry
          </Button>
        </div>
      )}

      {!loading && !error && vaults.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-medium">You don't have any vaults yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            A vault is a smart contract only you control — your strategies and
            funds live there, never with us.
          </p>
          <Button className="mt-6" onClick={() => navigate('/vault/create')}>
            Create Your First Vault
          </Button>
        </div>
      )}

      {!loading && !error && vaults.length > 0 && (
        <VaultTable
          vaults={vaults}
          onRowClick={(addr) => navigate(`/vault/${addr}`)}
        />
      )}
    </AppShell>
  );
}

function VaultTable({
  vaults,
  onRowClick,
}: {
  vaults: VaultOverview[];
  onRowClick: (address: string) => void;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th className="py-3 pr-4 text-left font-medium">Label</th>
          <th className="hidden px-4 py-3 text-left font-medium md:table-cell">
            Deposit Token
          </th>
          <th className="px-4 py-3 text-right font-medium">Total Value (USD)</th>
          <th className="hidden py-3 pl-4 text-right font-medium md:table-cell">
            Created
          </th>
        </tr>
      </thead>
      <tbody>
        {vaults.map((vault) => (
          <tr
            key={vault.address}
            onClick={() => onRowClick(vault.address)}
            className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60"
          >
            <td className="py-4 pr-4 font-medium">{vault.label}</td>
            <td className="hidden px-4 py-4 font-mono text-xs text-muted-foreground md:table-cell">
              {vault.depositToken.slice(0, 6)}…{vault.depositToken.slice(-4)}
            </td>
            <td className="px-4 py-4 text-right font-semibold">
              {formatUsd(vault.totalValueUsd)}
            </td>
            <td className="hidden py-4 pl-4 text-right text-muted-foreground md:table-cell">
              {formatDate(vault.createdAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VaultTableSkeleton() {
  return (
    <div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-b border-border py-4 last:border-0">
          <div className="h-5 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
