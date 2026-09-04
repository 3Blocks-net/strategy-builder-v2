import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccount } from 'wagmi';
import { type Address, parseUnits, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { useWithdraw } from '@/hooks/use-withdraw';
import { useFormatters } from '@/i18n';
import { txErrorText } from '@/lib/tx-error';

interface Position {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: string;
}

interface WithdrawFormProps {
  vaultAddress: Address;
  positions: Position[];
  fees: { depositFeeBps: number; withdrawFeeBps: number } | null;
  errorMap: Record<string, string>;
  onSuccess?: () => void;
}

export function WithdrawForm({
  vaultAddress,
  positions,
  fees,
  errorMap,
  onSuccess,
}: WithdrawFormProps) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const { address: userAddress } = useAccount();
  const [selectedToken, setSelectedToken] = useState<Position | null>(null);
  const [amount, setAmount] = useState('');
  const withdraw = useWithdraw();

  const maxAmount =
    selectedToken
      ? formatUnits(BigInt(selectedToken.balance), selectedToken.decimals)
      : '0';

  const parsedAmount =
    amount && selectedToken
      ? parseFloat(amount) * 10 ** selectedToken.decimals
      : 0;

  const feeBps = fees?.withdrawFeeBps ?? 0;
  const feeAmount = parsedAmount > 0 ? (parsedAmount * feeBps) / 10_000 : 0;
  const netAmount = parsedAmount - feeAmount;

  const handleWithdraw = async () => {
    if (!selectedToken || !amount || !userAddress) return;

    const amountBig = parseUnits(amount, selectedToken.decimals);
    const success = await withdraw.withdraw({
      vaultAddress,
      tokenAddress: selectedToken.address as Address,
      amount: amountBig,
      recipient: userAddress,
    });

    if (success) {
      // Deposit/withdraw history is now indexer-owned (PEC-219 #04) — recorded
      // from on-chain logs by the backend; no optimistic frontend write.
      onSuccess?.();
    }
  };

  /**
   * A revert the contract named is explained by the backend's error map; a
   * wallet rejection is ours to phrase; anything else keeps the wording it
   * arrived in.
   */
  const decodeError = (msg: string): string => {
    for (const [name, description] of Object.entries(errorMap)) {
      if (msg.includes(name)) return description;
    }
    if (msg.includes('User rejected')) return t('withdraw.rejected');
    return msg;
  };

  const isLoading = ['confirming', 'waiting'].includes(withdraw.step);

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <h3 className="font-semibold">{t('withdraw.heading')}</h3>

      <div>
        <label htmlFor="withdraw-token" className="text-sm font-medium">
          {t('withdraw.token')}
        </label>
        <select
          id="withdraw-token"
          value={selectedToken?.address ?? ''}
          onChange={(e) => {
            const p =
              positions.find((p) => p.address === e.target.value) ?? null;
            setSelectedToken(p);
            setAmount('');
          }}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          disabled={isLoading}
        >
          <option value="">{t('common.selectToken')}</option>
          {positions.map((p) => (
            <option key={p.address} value={p.address}>
              {p.symbol} — {formatUnits(BigInt(p.balance), p.decimals)}
            </option>
          ))}
        </select>
      </div>

      {selectedToken && (
        <>
          <div>
            <label htmlFor="withdraw-amount" className="text-sm font-medium">
              {t('withdraw.amount')}
            </label>
            <div className="mt-1 flex gap-2">
              <input
                id="withdraw-amount"
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
              {t('withdraw.vaultBalance', {
                amount: maxAmount,
                symbol: selectedToken.symbol,
              })}
            </p>
          </div>

          {amount && parseFloat(amount) > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('withdraw.receiveLine', {
                net: formatUnits(
                  BigInt(Math.floor(netAmount)),
                  selectedToken.decimals,
                ),
                fee: formatUnits(
                  BigInt(Math.floor(feeAmount)),
                  selectedToken.decimals,
                ),
                symbol: selectedToken.symbol,
                percent: fmt.percent(feeBps / 10_000),
              })}
            </p>
          )}
        </>
      )}

      {(withdraw.error || withdraw.errorCode) && (
        <p className="text-sm break-words text-destructive">
          {withdraw.error
            ? decodeError(withdraw.error)
            : txErrorText(t, withdraw.errorCode, null)}
        </p>
      )}

      {withdraw.step === 'done' && (
        <p className="text-sm text-green-600">{t('withdraw.success')}</p>
      )}

      <Button
        className="w-full"
        onClick={handleWithdraw}
        disabled={!selectedToken || !amount || isLoading}
      >
        {isLoading ? t('common.processing') : t('withdraw.submit')}
      </Button>
    </div>
  );
}

