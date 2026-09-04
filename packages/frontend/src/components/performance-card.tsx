import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormatters } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { RangeToggle } from '@/components/range-toggle';

interface Performance {
  currentValueUsd: number;
  netDepositsUsd: number;
  pnlAbsUsd: number;
  pnlPct: number | null;
  costsUsd: number;
}

export function PerformanceCard({
  address,
  range,
  onRangeChange,
}: {
  address: string;
  range: string;
  onRangeChange: (range: string) => void;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [data, setData] = useState<Performance | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const res = await apiFetch(
        `/vaults/${address}/performance?range=${range}`,
      );
      if (!res.ok) throw new Error('failed');
      setData(await res.json());
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [address, range]);

  useEffect(() => {
    load();
  }, [load]);

  const up = (data?.pnlAbsUsd ?? 0) >= 0;

  return (
    <section>
      <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold tracking-tight">
          {t('performance.heading')}
        </h2>
        <RangeToggle value={range} onChange={onRangeChange} />
      </div>
      <div className="pt-4">

      {loading && (
        <p className="text-sm text-muted-foreground">{t('performance.loading')}</p>
      )}
      {failed && (
        <p className="text-sm text-destructive">{t('performance.loadFailed')}</p>
      )}

      {!loading && !failed && data && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">{t('performance.pnl')}</p>
            <p
              className={`text-xl font-semibold ${up ? 'text-positive' : 'text-destructive'}`}
            >
              {fmt.signedUsd(data.pnlAbsUsd)}
            </p>
            <p className={`text-xs ${up ? 'text-positive' : 'text-destructive'}`}>
              {data.pnlPct == null ? '—' : fmt.percent(data.pnlPct)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t('performance.currentValue')}
            </p>
            <p className="text-xl font-semibold">
              {fmt.usd(data.currentValueUsd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t('performance.netDeposits')}
            </p>
            <p className="text-xl font-semibold">
              {fmt.usd(data.netDepositsUsd)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">
              {t('performance.costs')}
            </p>
            <p className="text-xl font-semibold">{fmt.usd(data.costsUsd)}</p>
          </div>
        </div>
      )}
      </div>
    </section>
  );
}
