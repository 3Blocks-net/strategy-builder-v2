import { useState, useCallback } from 'react';
import { usePublicClient, useWriteContract } from 'wagmi';
import { type Address } from 'viem';
import { StrategyBuilderVaultAbi } from '@/lib/abis';
import type { TxErrorCode } from '@/lib/tx-error';

type ExpertModeStep = 'idle' | 'confirming' | 'waiting' | 'done' | 'error';

/**
 * Switches the vault's expert-mode flag.
 *
 * The switch is a signing action like any other: it goes through the user's
 * wallet (`writeContract`), and the hook reports every phase of it — asking
 * the wallet, waiting for the receipt, done, failed. Nothing here decides
 * whether the switch *should* happen; that is the warning dialog's job.
 */
export function useExpertMode() {
  const [step, setStep] = useState<ExpertModeStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<TxErrorCode | null>(null);

  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const setExpertMode = useCallback(
    async (params: { vaultAddress: Address; enabled: boolean }) => {
      setError(null);
      setErrorCode(null);
      setStep('confirming');

      try {
        const hash = await writeContractAsync({
          address: params.vaultAddress,
          abi: StrategyBuilderVaultAbi,
          functionName: 'setExpertMode',
          args: [params.enabled],
          gas: 100_000n,
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

  return { setExpertMode, step, error, errorCode, reset };
}
