import { useState } from 'react';
import { useAccount } from 'wagmi';
import { type Address, parseUnits, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { useWithdraw } from '@/hooks/use-withdraw';

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

  const decodeError = (msg: string): string => {
    for (const [name, description] of Object.entries(errorMap)) {
      if (msg.includes(name)) return description;
    }
    if (msg.includes('User rejected')) return 'Transaction rejected by user.';
    return msg;
  };

  const isLoading = ['confirming', 'waiting'].includes(withdraw.step);

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h3 className="font-semibold">Withdraw</h3>

      <div>
        <label className="text-sm font-medium">Token</label>
        <select
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
          <option value="">Select token</option>
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
            <label className="text-sm font-medium">Amount (gross)</label>
            <div className="mt-1 flex gap-2">
              <input
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
                Max
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Vault balance: {maxAmount} {selectedToken.symbol}
            </p>
          </div>

          {amount && parseFloat(amount) > 0 && (
            <p className="text-sm text-muted-foreground">
              You receive:{' '}
              {selectedToken
                ? formatUnits(
                    BigInt(Math.floor(netAmount)),
                    selectedToken.decimals,
                  )
                : '0'}{' '}
              {selectedToken.symbol} (Fee:{' '}
              {selectedToken
                ? formatUnits(
                    BigInt(Math.floor(feeAmount)),
                    selectedToken.decimals,
                  )
                : '0'}{' '}
              {selectedToken.symbol}, {(feeBps / 100).toFixed(2)}%)
            </p>
          )}
        </>
      )}

      {withdraw.error && (
        <p className="text-sm text-destructive">
          {decodeError(withdraw.error)}
        </p>
      )}

      {withdraw.step === 'done' && (
        <p className="text-sm text-green-600">Withdrawal successful!</p>
      )}

      <Button
        className="w-full"
        onClick={handleWithdraw}
        disabled={!selectedToken || !amount || isLoading}
      >
        {isLoading ? 'Processing...' : 'Withdraw'}
      </Button>
    </div>
  );
}

