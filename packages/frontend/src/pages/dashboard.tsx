import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/providers/auth-context';
import { Button } from '@/components/ui/button';
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
  const { address, logout } = useAuth();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [vaults, setVaults] = useState<VaultOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const truncated = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : '';

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const fetchVaults = async () => {
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
  };

  useEffect(() => {
    fetchVaults();
  }, []);

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <code className="rounded bg-secondary px-3 py-1.5 text-sm font-mono">
                {truncated}
              </code>
              <Button variant="outline" size="sm" onClick={copyAddress}>
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={logout}>
              Disconnect
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your Vaults</h2>
          <Button onClick={() => navigate('/vault/create')}>
            Create Vault
          </Button>
        </div>

        {loading && <VaultTableSkeleton />}

        {error && (
          <div className="rounded-md border border-destructive/50 p-6 text-center">
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
          <div className="rounded-md border border-dashed p-12 text-center">
            <p className="text-muted-foreground">
              You don't have any vaults yet.
            </p>
            <Button className="mt-4" onClick={() => navigate('/vault/create')}>
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
      </div>
    </div>
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
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium">Label</th>
            <th className="px-4 py-3 text-left font-medium">Deposit Token</th>
            <th className="px-4 py-3 text-right font-medium">
              Total Value (USD)
            </th>
            <th className="px-4 py-3 text-right font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {vaults.map((vault) => (
            <tr
              key={vault.address}
              onClick={() => onRowClick(vault.address)}
              className="cursor-pointer border-b transition-colors hover:bg-muted/50 last:border-0"
            >
              <td className="px-4 py-3 font-medium">{vault.label}</td>
              <td className="px-4 py-3 text-muted-foreground">
                {vault.depositToken.slice(0, 6)}...{vault.depositToken.slice(-4)}
              </td>
              <td className="px-4 py-3 text-right">
                {formatUsd(vault.totalValueUsd)}
              </td>
              <td className="px-4 py-3 text-right text-muted-foreground">
                {formatDate(vault.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VaultTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="border-b bg-muted/50 px-4 py-3">
        <div className="h-4 w-full animate-pulse rounded bg-muted" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-b px-4 py-3 last:border-0">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
