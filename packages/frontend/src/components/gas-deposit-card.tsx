import { useState, useEffect, useCallback } from 'react';
import { usePublicClient, useWriteContract } from 'wagmi';
import { formatUnits, parseUnits, type Address } from 'viem';
import { Button } from '@/components/ui/button';
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

function format(raw: string, decimals: number): string {
  try {
    const n = parseFloat(formatUnits(BigInt(raw), decimals));
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(n);
  } catch {
    return raw;
  }
}

export function GasDepositCard({ vaultAddress }: GasDepositCardProps) {
  const [data, setData] = useState<GasDeposit | null>(null);
  const [automations, setAutomations] = useState<GasDepositAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const [depRes, autoRes] = await Promise.all([
        apiFetch(`/vaults/${vaultAddress}/gas-deposit`),
        apiFetch(`/vaults/${vaultAddress}/automations`),
      ]);
      if (!depRes.ok) throw new Error('Failed to load gas deposit');
      setData(await depRes.json());
      setAutomations(autoRes.ok ? await autoRes.json() : []);
    } catch {
      setError('Failed to load gas deposit');
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
      setDepositError(e instanceof Error ? e.message : 'Deposit failed');
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
      setSetMinError(e instanceof Error ? e.message : 'Failed to set minimum');
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
        <h2 className="text-lg font-semibold">Gas Reserve</h2>
        <Button variant="ghost" size="sm" disabled={loading} onClick={fetchData}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>

      {loading && !data ? (
        <p className="text-sm text-gray-500">Loading gas reserve…</p>
      ) : error ? (
        <div className="rounded-md border border-destructive/50 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={fetchData}>
            Retry
          </Button>
        </div>
      ) : data && !data.enabled ? (
        <div className="rounded-md border border-dashed p-6 text-center text-gray-500">
          <p className="text-sm">Gas-Kompensation für diesen Vault deaktiviert (kein Deposit-Token).</p>
        </div>
      ) : data && data.token ? (
        <div className="space-y-3">
          {warn && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Zu geringe Gas-Reserve hinterlegt — externe Executor werden nicht
              kompensiert und führen deine public Automations daher voraussichtlich
              nicht aus.
            </div>
          )}

          <div className="rounded-md border border-gray-200 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-500">Hinterlegte Reserve</span>
              <span className="font-mono font-medium text-gray-900">
                {format(data.deposited, data.token.decimals)} {data.token.symbol}
              </span>
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-xs text-gray-400">Ziel (minFeeDeposit)</span>
              <span className="font-mono text-xs text-gray-500">
                {format(data.minFeeDeposit, data.token.decimals)} {data.token.symbol}
              </span>
            </div>
          </div>

          <div className="rounded-md border border-gray-200 p-4">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Mindest-Reserve (minFeeDeposit)
            </label>
            <p className="mb-2 text-xs text-gray-400">
              Auffüllziel der FeeDepositAction. Bei 0 füllt sie die Reserve nicht
              automatisch auf. Aktuell:{' '}
              <span className="font-mono">
                {format(data.minFeeDeposit, data.token.decimals)} {data.token.symbol}
              </span>
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={`${format(data.minFeeDeposit, data.token.decimals)} ${data.token.symbol}`}
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
                {settingMin ? 'Setzen…' : 'Setzen'}
              </Button>
            </div>
            {setMinError && (
              <p className="mt-2 text-xs text-destructive">{setMinError}</p>
            )}
          </div>

          <div className="rounded-md border border-gray-200 p-4">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Fees einzahlen
            </label>
            <p className="mb-2 text-xs text-gray-400">
              Wird aus der Token-Balance des Vaults entnommen.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="decimal"
                className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={`0.0 ${data.token.symbol}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                size="sm"
                disabled={depositing || !amount || Number(amount) <= 0}
                onClick={handleDeposit}
              >
                {depositing ? 'Einzahlen…' : 'Einzahlen'}
              </Button>
            </div>
            {depositError && (
              <p className="mt-2 text-xs text-destructive">{depositError}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
