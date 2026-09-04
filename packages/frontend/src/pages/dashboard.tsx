import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { useFormatters, type Formatters } from '@/i18n';
import { apiFetch } from '@/lib/api';

interface VaultOverview {
  address: string;
  label: string;
  depositToken: string;
  chainId: number;
  totalValueUsd: number;
  createdAt: string;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const navigate = useNavigate();
  const [vaults, setVaults] = useState<VaultOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const fetchVaults = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await apiFetch('/vaults/overview');
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      setVaults(data.vaults ?? []);
    } catch {
      setFailed(true);
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
          <p className="text-sm text-on-band-sub">{t('dashboard.portfolioValue')}</p>
          {loading ? (
            <div className="mt-2 h-10 w-56 animate-pulse rounded-md bg-on-band-line" />
          ) : (
            <p className="mt-1 text-5xl font-semibold tracking-tight">
              {failed ? '—' : fmt.usd(totalUsd)}
            </p>
          )}
          <p className="mt-2 text-sm text-on-band-sub">
            {failed
              ? t('dashboard.portfolioUnavailable')
              : loading
                ? t('dashboard.loadingVaults')
                : vaults.length === 0
                  ? t('dashboard.noVaultsYet')
                  : t('dashboard.acrossVaults', { count: vaults.length })}
          </p>
        </div>
      }
    >
      <div className="flex items-baseline justify-between border-b border-border pb-4">
        <h1 className="text-lg font-semibold tracking-tight">
          {t('dashboard.heading')}
        </h1>
        <Button size="sm" onClick={() => navigate('/vault/create')}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('dashboard.createVault')}
        </Button>
      </div>

      {loading && <VaultTableSkeleton />}

      {failed && (
        <div className="py-16 text-center">
          <p className="font-medium text-destructive">
            {t('dashboard.loadFailedTitle')}
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {t('dashboard.loadFailedBody')}
          </p>
          <Button variant="outline" className="mt-6" onClick={fetchVaults}>
            {t('dashboard.retry')}
          </Button>
        </div>
      )}

      {!loading && !failed && vaults.length === 0 && (
        <div className="py-16 text-center">
          <p className="font-medium">{t('dashboard.emptyTitle')}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            {t('dashboard.emptyBody')}
          </p>
          <Button className="mt-6" onClick={() => navigate('/vault/create')}>
            {t('dashboard.createFirstVault')}
          </Button>
        </div>
      )}

      {!loading && !failed && vaults.length > 0 && (
        <VaultTable
          vaults={vaults}
          fmt={fmt}
          onRowClick={(addr) => navigate(`/vault/${addr}`)}
        />
      )}
    </AppShell>
  );
}

function VaultTable({
  vaults,
  fmt,
  onRowClick,
}: {
  vaults: VaultOverview[];
  fmt: Formatters;
  onRowClick: (address: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          <th className="py-3 pr-4 text-left font-medium">
            {t('dashboard.table.label')}
          </th>
          <th className="hidden px-4 py-3 text-left font-medium md:table-cell">
            {t('dashboard.table.depositToken')}
          </th>
          <th className="px-4 py-3 text-right font-medium">
            {t('dashboard.table.totalValueUsd')}
          </th>
          <th className="hidden py-3 pl-4 text-right font-medium md:table-cell">
            {t('dashboard.table.created')}
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
              {fmt.usd(vault.totalValueUsd)}
            </td>
            <td className="hidden py-4 pl-4 text-right text-muted-foreground md:table-cell">
              {fmt.date(vault.createdAt)}
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
