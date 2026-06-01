import { useState, useCallback } from 'react';
import { useWriteContract } from 'wagmi';
import { type Address } from 'viem';
import { StrategyBuilderVaultAbi } from '@/lib/abis';

type WithdrawStep = 'idle' | 'confirming' | 'waiting' | 'done' | 'error';

export function useWithdraw() {
  const [step, setStep] = useState<WithdrawStep>('idle');
  const [error, setError] = useState<string | null>(null);

  const { writeContractAsync } = useWriteContract();

  const withdraw = useCallback(
    async (params: {
      vaultAddress: Address;
      tokenAddress: Address;
      amount: bigint;
      recipient: Address;
    }) => {
      setError(null);
      setStep('confirming');

      try {
        await writeContractAsync({
          address: params.vaultAddress,
          abi: StrategyBuilderVaultAbi,
          functionName: 'withdraw',
          args: [params.tokenAddress, params.amount, params.recipient],
        });

        setStep('done');
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Transaction failed';
        setError(msg);
        setStep('error');
      }
    },
    [writeContractAsync],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
  }, []);

  return { withdraw, step, error, reset };
}
