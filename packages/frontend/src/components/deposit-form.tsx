import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount, useReadContract } from 'wagmi';
import { type Address, erc20Abi, parseUnits, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { useApproveAndDeposit } from '@/hooks/use-approve-and-deposit';
import { useFormatters } from '@/i18n';
import { apiFetch } from '@/lib/api';
import { txErrorText } from '@/lib/tx-error';

interface AcceptedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

interface DepositFormProps {
  vaultAddress: Address;
  fees: { depositFeeBps: number; withdrawFeeBps: number } | null;
  onSuccess?: () => void;
}

export function DepositForm({ vaultAddress, fees, onSuccess }: DepositFormProps) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const { address: userAddress } = useAccount();
  const [tokens, setTokens] = useState<AcceptedToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<AcceptedToken | null>(null);
  const [amount, setAmount] = useState('');
  const deposit = useApproveAndDeposit();

  useEffect(() => {
    apiFetch('/tokens/accepted')
      .then((r) => r.json())
      .then((d) => setTokens(d.tokens ?? []))
      .catch(() => {});
  }, []);

  const { data: walletBalance } = useReadContract({
    address: selectedToken?.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!selectedToken && !!userAddress },
  });

  const { data: currentAllowance } = useReadContract({
    address: selectedToken?.address as Address | undefined,
    abi: erc20Abi,
    functionName: 'allowance',
    args: userAddress ? [userAddress, vaultAddress] : undefined,
    query: { enabled: !!selectedToken && !!userAddress },
  });

  const maxAmount =
    walletBalance != null && selectedToken
      ? formatUnits(walletBalance, selectedToken.decimals)
      : '0';

  const parsedAmount =
    amount && selectedToken
      ? parseFloat(amount) * 10 ** selectedToken.decimals
      : 0;

  const feeAmount =
    fees && parsedAmount > 0
      ? (parsedAmount * fees.depositFeeBps) / 10_000
      : 0;

  const handleDeposit = async () => {
    if (!selectedToken || !amount || !userAddress) return;

    const amountBig = parseUnits(amount, selectedToken.decimals);
    const success = await deposit.approveAndDeposit({
      vaultAddress,
      tokenAddress: selectedToken.address as Address,
      amount: amountBig,
      currentAllowance: currentAllowance ?? 0n,
    });

    if (success) {
      // Deposit/withdraw history is now indexer-owned (PEC-219 #04) — the
      // backend records it from on-chain logs; no optimistic frontend write.
      onSuccess?.();
    }
  };

  const isLoading = ['checking', 'approving', 'depositing'].includes(deposit.step);

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <h3 className="font-semibold">{t('deposit.heading')}</h3>

      <div>
        <label htmlFor="deposit-token" className="text-sm font-medium">
          {t('deposit.token')}
        </label>
        <select
          id="deposit-token"
          value={selectedToken?.address ?? ''}
          onChange={(e) => {
            const t = tokens.find((t) => t.address === e.target.value) ?? null;
            setSelectedToken(t);
            setAmount('');
          }}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('common.selectToken')}</option>
          {tokens.map((t) => (
            <option key={t.address} value={t.address}>
              {t.symbol} — {t.name}
            </option>
          ))}
        </select>
      </div>

      {selectedToken && (
        <>
          <div>
            <label htmlFor="deposit-amount" className="text-sm font-medium">
              {t('deposit.amount')}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="deposit-amount"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.0"
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={isLoading}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAmount(maxAmount)}
                disabled={isLoading}
              >
                {t('common.max')}
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t('deposit.wallet', {
                amount: maxAmount,
                symbol: selectedToken.symbol,
              })}
            </p>
          </div>

          {fees && amount && parseFloat(amount) > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('deposit.feeLine', {
                percent: fmt.percent(fees.depositFeeBps / 10_000),
                amount: formatUnits(
                  BigInt(Math.floor(feeAmount)),
                  selectedToken.decimals,
                ),
                symbol: selectedToken.symbol,
              })}
            </p>
          )}
        </>
      )}

      {deposit.totalSteps > 0 && isLoading && (
        <p className="text-sm text-muted-foreground">
          {t('deposit.step', {
            current: deposit.currentStep,
            total: deposit.totalSteps,
            action:
              deposit.step === 'approving'
                ? t('deposit.approving')
                : t('deposit.depositing'),
          })}
        </p>
      )}

      {(deposit.error || deposit.errorCode) && (
        <p className="text-sm break-words text-destructive">
          {txErrorText(t, deposit.errorCode, deposit.error)}
        </p>
      )}

      {deposit.step === 'done' && (
        <p className="text-sm text-green-600">{t('deposit.success')}</p>
      )}

      <Button
        className="w-full"
        onClick={handleDeposit}
        disabled={!selectedToken || !amount || isLoading}
      >
        {isLoading ? t('common.processing') : t('deposit.submit')}
      </Button>
    </div>
  );
}

