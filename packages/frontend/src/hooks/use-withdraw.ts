import { useState, useCallback } from 'react';
import { usePublicClient, useWriteContract } from 'wagmi';
import { type Address } from 'viem';
import { StrategyBuilderVaultAbi } from '@/lib/abis';
import type { TxErrorCode } from '@/lib/tx-error';

type WithdrawStep = 'idle' | 'confirming' | 'waiting' | 'done' | 'error';

export function useWithdraw() {
  const [step, setStep] = useState<WithdrawStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<TxErrorCode | null>(null);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const withdraw = useCallback(
    async (params: {
      vaultAddress: Address;
      tokenAddress: Address;
      amount: bigint;
      recipient: Address;
    }) => {
      setError(null);
      setErrorCode(null);
      setStep('confirming');

      try {
        const hash = await writeContractAsync({
          address: params.vaultAddress,
          abi: StrategyBuilderVaultAbi,
          functionName: 'withdraw',
          args: [params.tokenAddress, params.amount, params.recipient],
          gas: 300_000n,
        });

        setStep('waiting');
        await publicClient!.waitForTransactionReceipt({ hash });

        setStep('done');
        return true;
      } catch (e) {
        if (e instanceof Error) setError(e.message);
        else setErrorCode('transaction-failed');
        setStep('error');
        return false;
      }
    },
    [writeContractAsync, publicClient],
  );

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setErrorCode(null);
  }, []);

  return { withdraw, step, error, errorCode, reset };
}
