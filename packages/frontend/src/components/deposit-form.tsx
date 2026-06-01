import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { type Address, erc20Abi, parseUnits, formatUnits } from 'viem';
import { Button } from '@/components/ui/button';
import { useApproveAndDeposit } from '@/hooks/use-approve-and-deposit';
import { apiFetch } from '@/lib/api';

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
    await deposit.approveAndDeposit({
      vaultAddress,
      tokenAddress: selectedToken.address as Address,
      amount: amountBig,
      currentAllowance: currentAllowance ?? 0n,
    });

    if (deposit.step === 'done') {
      recordEvent(vaultAddress, {
        eventType: 'DEPOSIT',
        token: selectedToken.address,
        amount: amountBig.toString(),
        feeAmount: BigInt(Math.floor(feeAmount)).toString(),
        feeBps: fees?.depositFeeBps ?? 0,
      });
      onSuccess?.();
    }
  };

  const isLoading = ['checking', 'approving', 'depositing'].includes(deposit.step);

  return (
    <div className="space-y-4 rounded-md border p-4">
      <h3 className="font-semibold">Deposit</h3>

      <div>
        <label className="text-sm font-medium">Token</label>
        <select
          value={selectedToken?.address ?? ''}
          onChange={(e) => {
            const t = tokens.find((t) => t.address === e.target.value) ?? null;
            setSelectedToken(t);
            setAmount('');
          }}
          className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Select token</option>
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
            <label className="text-sm font-medium">Amount</label>
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
              Wallet: {maxAmount} {selectedToken.symbol}
            </p>
          </div>

          {fees && amount && parseFloat(amount) > 0 && (
            <p className="text-sm text-muted-foreground">
              Deposit fee: {(fees.depositFeeBps / 100).toFixed(2)}% — Fee:{' '}
              {formatUnits(
                BigInt(Math.floor(feeAmount)),
                selectedToken.decimals,
              )}{' '}
              {selectedToken.symbol}
            </p>
          )}
        </>
      )}

      {deposit.totalSteps > 0 && isLoading && (
        <p className="text-sm text-muted-foreground">
          Step {deposit.currentStep}/{deposit.totalSteps}:{' '}
          {deposit.step === 'approving' ? 'Approving...' : 'Depositing...'}
        </p>
      )}

      {deposit.error && (
        <p className="text-sm text-destructive">{deposit.error}</p>
      )}

      {deposit.step === 'done' && (
        <p className="text-sm text-green-600">Deposit successful!</p>
      )}

      <Button
        className="w-full"
        onClick={handleDeposit}
        disabled={!selectedToken || !amount || isLoading}
      >
        {isLoading ? 'Processing...' : 'Deposit'}
      </Button>
    </div>
  );
}

async function recordEvent(
  vaultAddress: string,
  data: {
    eventType: string;
    token: string;
    amount: string;
    feeAmount: string;
    feeBps: number;
  },
  retries = 3,
) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await apiFetch(`/vaults/${vaultAddress}/events`, {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          txHash: '0x0',
          blockNumber: 0,
          blockTimestamp: new Date().toISOString(),
        }),
      });
      if (res.ok) return;
    } catch {
      // retry
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
