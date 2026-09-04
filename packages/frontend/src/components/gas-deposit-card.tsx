import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePublicClient, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits, type Address } from 'viem';
import { Button } from '@/components/ui/button';
import { useFormatters, type Formatters } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { StrategyBuilderVaultAbi } from '@/lib/abis';
import { shouldWarnGasDeposit, type GasDepositAutomation } from '@/lib/gas-deposit';

interface GasDeposit {
  enabled: boolean;
  token: { address: string; symbol: string; decimals: number } | null;
  deposited: string;
  minFeeDeposit: string;
}

interface GasDepositCardProps {
  vaultAddress: string;
}

/** Reserve amount as the reader sees it — notation follows the UI language. */
function formatReserve(fmt: Formatters, raw: string, decimals: number): string {
  try {
    const n = parseFloat(formatUnits(BigInt(raw), decimals));
    return fmt.number(n, { maximumFractionDigits: 6 });
  } catch {
    return raw;
  }
}

/**
 * Machine form of an amount: the value the input field expects back, so it
 * stays dot-separated in every language.
 */
function rawAmount(raw: string, decimals: number): string {
  try {
    return formatUnits(BigInt(raw), decimals);
  } catch {
    return raw;
  }
}

export function GasDepositCard({ vaultAddress }: GasDepositCardProps) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const [data, setData] = useState<GasDeposit | null>(null);
  const [automations, setAutomations] = useState<GasDepositAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const [amount, setAmount] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [depositError, setDepositError] = useState<string | null>(null);

  const [minInput, setMinInput] = useState('');
  const [settingMin, setSettingMin] = useState(false);
  const [setMinError, setSetMinError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const fetchData = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [depRes, autoRes] = await Promise.all([
        apiFetch(`/vaults/${vaultAddress}/gas-deposit`),
        apiFetch(`/vaults/${vaultAddress}/automations`),
      ]);
      if (!depRes.ok) throw new Error('Failed to load gas deposit');
      setData(await depRes.json());
      setAutomations(autoRes.ok ? await autoRes.json() : []);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [vaultAddress]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeposit = async () => {
    if (!data?.token || !amount) return;
    setDepositError(null);
    setDepositing(true);
    try {
      const value = parseUnits(amount, data.token.decimals);
      const hash = await writeContractAsync({
        address: vaultAddress as Address,
        abi: StrategyBuilderVaultAbi,
        functionName: 'depositFees',
        args: [data.token.address as Address, value],
        gas: 300_000n,
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setAmount('');
      await fetchData();
    } catch (e) {
      setDepositError(
        e instanceof Error ? e.message : t('gasReserve.depositFailed'),
      );
    } finally {
      setDepositing(false);
    }
  };

  const handleSetMin = async () => {
    if (!data?.token || minInput === '') return;
    setSetMinError(null);
    setSettingMin(true);
    try {
      const value = parseUnits(minInput, data.token.decimals);
      const hash = await writeContractAsync({
        address: vaultAddress as Address,
        abi: StrategyBuilderVaultAbi,
        functionName: 'setMinFeeDeposit',
        args: [value],
        gas: 100_000n,
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      setMinInput('');
      await fetchData();
    } catch (e) {
      setSetMinError(
        e instanceof Error ? e.message : t('gasReserve.setMinFailed'),
      );
    } finally {
      setSettingMin(false);
    }
  };

  const warn =
    data?.enabled === true &&
    shouldWarnGasDeposit(BigInt(data.deposited), BigInt(data.minFeeDeposit), automations);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold tracking-tight">
          {t('gasReserve.heading')}
        </h2>
        <Button variant="ghost" size="sm" disabled={loading} onClick={fetchData}>
          {loading ? t('common.refreshing') : t('common.refresh')}
        </Button>
      </div>

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">{t('gasReserve.loading')}</p>
      ) : failed ? (
        <div className="py-8 text-center">
          <p className="text-sm text-destructive">{t('gasReserve.loadFailed')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            {t('common.retry')}
          </Button>
        </div>
      ) : data && !data.enabled ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-muted-foreground">
          <p className="text-sm">{t('gasReserve.disabled')}</p>
        </div>
      ) : data && data.token ? (
        <div className="space-y-3">
          {warn && (
            <div className="rounded-md border border-warning-border bg-warning-surface px-3 py-2 text-sm text-warning">
              {t('gasReserve.warning')}
            </div>
          )}

          <div className="rounded-md border border-border p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                {t('gasReserve.deposited')}
              </span>
              <span className="font-mono font-medium text-foreground">
                {formatReserve(fmt, data.deposited, data.token.decimals)} {data.token.symbol}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-muted-foreground">
                {t('gasReserve.target')}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {formatReserve(fmt, data.minFeeDeposit, data.token.decimals)} {data.token.symbol}
              </span>
            </div>
          </div>

          <div className="rounded-md border border-border p-4">
            <label htmlFor="gas-deposit-min" className="mb-1 block text-xs font-medium text-foreground">
              {t('gasReserve.minLabel')}
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('gasReserve.minHint')}{' '}
              <span className="font-mono">
                {formatReserve(fmt, data.minFeeDeposit, data.token.decimals)} {data.token.symbol}
              </span>
            </p>
            <div className="flex gap-2">
              <input
                id="gas-deposit-min"
                type="text"
                inputMode="decimal"
                className="flex-1 rounded border border-input px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={`${rawAmount(data.minFeeDeposit, data.token.decimals)} ${data.token.symbol}`}
                value={minInput}
                onChange={(e) => setMinInput(e.target.value)}
              />
              <Button
                size="sm"
                disabled={
                  settingMin ||
                  minInput === '' ||
                  Number.isNaN(Number(minInput)) ||
                  Number(minInput) < 0
                }
                onClick={handleSetMin}
              >
                {settingMin ? t('gasReserve.settingMin') : t('gasReserve.setMin')}
              </Button>
            </div>
            {setMinError && (
              <p className="mt-2 text-xs break-words text-destructive">
                {setMinError}
              </p>
            )}
          </div>

          <div className="rounded-md border border-border p-4">
            <label htmlFor="gas-deposit-amount" className="mb-1 block text-xs font-medium text-foreground">
              {t('gasReserve.depositLabel')}
            </label>
            <p className="mb-2 text-xs text-muted-foreground">
              {t('gasReserve.depositHint')}
            </p>
            <div className="flex gap-2">
              <input
                id="gas-deposit-amount"
                type="text"
                inputMode="decimal"
                className="flex-1 rounded border border-input px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder={`0.0 ${data.token.symbol}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                size="sm"
                disabled={depositing || !amount || Number(amount) <= 0}
                onClick={handleDeposit}
              >
                {depositing ? t('gasReserve.depositing') : t('gasReserve.depositSubmit')}
              </Button>
            </div>
            {depositError && (
              <p className="mt-2 text-xs break-words text-destructive">
                {depositError}
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
